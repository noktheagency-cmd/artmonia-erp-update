// Synthetic PGlite only. This test never reads DATABASE_URL or a shared database.
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@/generated/prisma/client";

const authId = randomUUID(), sessionId = randomUUID();
const globals = globalThis as typeof globalThis & { prisma?: unknown };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  const result = next(specifier, context);
  if (result.url.replaceAll("\\", "/").endsWith("/src/server/supabase/admin.ts")) {
    return { url: `data:text/javascript,export function getSupabaseAdminClient(){return {auth:{getClaims:async(token)=>token==='valid'?{data:{claims:{sub:'${authId}',session_id:'${sessionId}'}}}:{error:new Error('Invalid token')}},storage:{from:()=>({getPublicUrl:path=>({data:{publicUrl:'https://example.com/'+path}})})}}}`, shortCircuit: true };
  }
  return result;
} });

test("mobile access matching, legacy continuity and HTTP authorization", async () => {
  const pg = new PGlite();
  let failAudit = false;
  const query = async (strings: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => {
    const sql = Array.isArray(strings)
      ? strings.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, "")
      : (strings as Prisma.Sql).text;
    return (await pg.query(sql, Array.isArray(strings) ? values : (strings as Prisma.Sql).values)).rows;
  };
  const account = async (where: { authUserId?: string; id?: string }) => {
    const [row] = (await pg.query<Record<string, unknown>>(`select m.*, s.code, s.lifecycle_status, c.full_name, c.phone_display
      from erp.student_mobile_accounts m join erp.students s on s.id=m.student_id join erp.contacts c on c.id=s.contact_id
      where ${where.authUserId ? "m.auth_user_id" : "m.id"}=$1`, [where.authUserId ?? where.id])).rows;
    return row ? { id: row.id, studentId: row.student_id, authUserId: row.auth_user_id, loginEmail: row.login_email,
      status: row.status, activatedAt: row.activated_at, avatarObjectPath: row.avatar_object_path,
      student: { code: row.code, lifecycleStatus: row.lifecycle_status, contact: { fullName: row.full_name, phoneDisplay: row.phone_display } } } : null;
  };
  const db = {
    $queryRaw: query, $executeRaw: query,
    studentMobileAccount: {
      findUnique: async ({ where }: { where: { authUserId?: string; id?: string } }) => account(where),
      findFirst: async ({ where }: { where: { loginEmail: { equals: string } } }) => {
        const [row] = (await pg.query('select auth_user_id as "authUserId" from erp.student_mobile_accounts where lower(login_email)=lower($1) limit 1', [where.loginEmail.equals])).rows;
        return row ?? null;
      },
      create: async ({ data }: { data: { studentId: string; authUserId: string; loginEmail: string; status: string; activatedAt: Date } }) => {
        await pg.query("insert into erp.student_mobile_accounts(id,student_id,auth_user_id,login_email,status,activated_at) values($1,$2,$3,$4,$5,$6)",
          [randomUUID(), data.studentId, data.authUserId, data.loginEmail, data.status, data.activatedAt]);
        return account({ authUserId: data.authUserId });
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string; activatedAt: Date } }) => {
        await pg.query("update erp.student_mobile_accounts set status=$2,activated_at=$3 where id=$1", [where.id, data.status, data.activatedAt]);
        return account(where);
      },
    },
    auditLog: { create: async () => {
      if (failAudit) throw new Error("Synthetic audit failure");
      await pg.exec("insert into erp.audit_logs default values");
    } },
    $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
      await pg.exec("begin");
      try { const result = await fn(db as unknown as Prisma.TransactionClient); await pg.exec("commit"); return result; }
      catch (error) { await pg.exec("rollback"); throw error; }
    },
  };
  globals.prisma = db;
  process.env.MOBILE_ATTENDANCE_SERVER_TOKENS = "synthetic-server-token-only-for-local-tests";
  process.env.FIRCA_COMMUNITY_SERVER_TOKEN = "synthetic-community-token-only-for-local-tests";
  const { resolveMobileAccessInTransaction } = await import("./mobile-access-service");
  const { resolveStudentMobileIdentityDetailed, inviteStudentMobileAccount } = await import("@/modules/students/mobile-account-service");
  const { POST } = await import("@/app/api/mobile/v1/me/access/route");
  const { authenticateMobileStudentRequest } = await import("./mobile-api");
  const { applyCommentEvent } = await import("@/modules/firca/service");
  const { POST: communityEvent } = await import("@/app/api/mobile/v1/firca/community-events/route");
  try {
    await pg.exec(`create schema auth; create schema erp;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone text,phone_confirmed_at timestamptz,
        raw_user_meta_data jsonb,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean default false);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create table erp.contacts(id uuid primary key,full_name text,email text,phone_display text,phone_normalized text);
      create table erp.students(id uuid primary key,contact_id uuid,code text,lifecycle_status text);
      create table erp.student_mobile_accounts(id uuid primary key,student_id uuid unique,auth_user_id uuid unique,login_email text unique,
        status text,activated_at timestamptz,avatar_object_path text);
      create table erp.audit_logs(id bigint generated always as identity);
      create table erp.users(id uuid primary key);`);
    await pg.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'aylin@example.com',now(),$2)",
      [authId, JSON.stringify({ first_name: "Aylin", last_name: "Məmmədova", phone: "+994501234567", role: "ADMIN", studentId: randomUUID() })]);
    await pg.query("insert into auth.sessions values($1,$2,null)", [sessionId, authId]);
    const resolve = () => db.$transaction(tx => resolveMobileAccessInTransaction(tx, { authUserId: authId, sessionId }));
    const request = (body?: string, serverToken = process.env.MOBILE_ATTENDANCE_SERVER_TOKENS) => new Request("https://erp.example.com/api/mobile/v1/me/access", {
      method: "POST", body, headers: { authorization: `Bearer ${serverToken}`, "x-student-authorization": "Bearer valid" },
    });
    const payload = (result: Awaited<ReturnType<typeof resolve>>) => { assert.ok(result.ok); return result.access; };
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).matchStatus, "not_found");
    assert.equal((await POST(request(""))).status, 200, "an empty POST stream is a bodyless request in Next.js");
    const chunkedRequest = (bytes: number) => new Request(request(), {
      body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } }),
      duplex: "half",
    } as RequestInit);
    assert.equal((await POST(chunkedRequest(0))).status, 200);
    assert.equal((await POST(chunkedRequest(4096))).status, 400, "chunked payloads cannot bypass the no-body contract");
    assert.equal(payload(await resolve()).displayName, "Aylin Məmmədova");
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from erp.students")).rows[0].n, 0);
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from erp.users")).rows[0].n, 0);
    assert.deepEqual(await resolveStudentMobileIdentityDetailed("valid"), { ok: false, code: "STUDENT_MAPPING_NOT_FOUND" });
    const academicDenied = await authenticateMobileStudentRequest(request());
    assert.ok(!academicDenied.ok); assert.equal(academicDenied.response.status, 403);
    const academicRoutes = await Promise.all([
      import("@/app/api/mobile/v1/me/home/route"),
      import("@/app/api/mobile/v1/me/package/route"),
      import("@/app/api/mobile/v1/me/journey/route"),
      import("@/app/api/mobile/v1/me/firca/route"),
      import("@/app/api/mobile/v1/me/leaderboard/route"),
      import("@/app/api/mobile/v1/me/notifications/route"),
    ]);
    for (const route of academicRoutes) {
      const denied = await route.GET(new Request(request(), { method: "GET" }));
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).code, "STUDENT_MAPPING_NOT_FOUND");
    }
    const { POST: scan } = await import("@/app/api/mobile/v1/attendance/check-ins/route");
    const deniedScan = await scan(new Request("https://erp.example.com/api/mobile/v1/attendance/check-ins", {
      method: "POST", headers: { ...Object.fromEntries(request().headers), "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify({ clientEventId: randomUUID(), qrToken: "syntheticFakeQrToken1234", scannedAt: new Date().toISOString(), erpStudentId: randomUUID() }),
    }));
    assert.equal(deniedScan.status, 403, "an arbitrary Student.id does not grant QR access");
    await assert.rejects(inviteStudentMobileAccount({ studentId: randomUUID(), actorId: randomUUID() }),
      { code: "FORBIDDEN" }, "stale invitation requests cannot create an Auth account");
    assert.equal((await POST(request("{}"))).status, 400);
    assert.equal((await POST(request(undefined, "wrong"))).status, 401);
    assert.equal((await POST(new Request(request(), { headers: { ...Object.fromEntries(request().headers), "x-student-authorization": "Bearer invalid" } }))).status, 401);
    assert.equal((await POST(new Request(request(), { headers: { authorization: `Bearer ${process.env.MOBILE_ATTENDANCE_SERVER_TOKENS}` } }))).status, 401);
    await pg.exec("update auth.users set email_confirmed_at=null");
    assert.deepEqual(await resolve(), { ok: false, code: "EMAIL_NOT_VERIFIED" });
    await pg.exec("update auth.users set email_confirmed_at=now(); update auth.sessions set not_after=now()-interval '1 hour'");
    assert.deepEqual(await resolve(), { ok: false, code: "STUDENT_AUTH_INVALID" });
    await pg.exec("update auth.sessions set not_after=null; update auth.users set banned_until=now()+interval '1 day'");
    assert.equal(payload(await resolve()).accountStatus, "disabled");
    assert.deepEqual(await resolveStudentMobileIdentityDetailed("valid"), { ok: false, code: "MOBILE_ACCOUNT_DISABLED" });
    await pg.exec("update auth.users set banned_until=null");
    const contactId = randomUUID(), studentId = randomUUID();
    await pg.query("insert into erp.contacts values($1,'ERP Synthetic',' Aylin@Example.com ','0501234567','0501234567')", [contactId]);
    await pg.query("insert into erp.students values($1,$2,'SYN-01','ACTIVE')", [studentId, contactId]);
    await pg.exec(`update auth.users set raw_user_meta_data='{"full_name":"Forged name","phone":"0551234567"}'`);
    assert.equal(payload(await resolve()).matchStatus, "review_required");
    await pg.exec(`update auth.users set raw_user_meta_data='{"full_name":"Aylin","phone":"+994501234567"}'`);
    const secondContact = randomUUID(), secondStudent = randomUUID();
    await pg.query("insert into erp.contacts values($1,'Duplicate','aylin@example.com',null,null)", [secondContact]);
    await pg.query("insert into erp.students values($1,$2,'SYN-02','ACTIVE')", [secondStudent, secondContact]);
    assert.equal(payload(await resolve()).matchStatus, "review_required");
    await pg.query("delete from erp.students where id=$1", [secondStudent]);
    failAudit = true;
    await assert.rejects(resolve(), /Synthetic audit failure/);
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from erp.student_mobile_accounts")).rows[0].n, 0,
      "failed audit rolls back the mapping instead of granting partial student access");
    failAudit = false;
    assert.equal(payload(await resolve()).role, "student", "later enrollment becomes available without another Auth account");
    assert.equal(payload(await resolve()).displayName, "ERP Synthetic");
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from erp.student_mobile_accounts")).rows[0].n, 1);
    assert.equal((await pg.query<{ n: number }>("select count(*)::int as n from erp.audit_logs")).rows[0].n, 1, "retry does not create duplicate audit/mapping");
    assert.equal((await resolveStudentMobileIdentityDetailed("valid")).ok, true);
    await pg.exec("update erp.student_mobile_accounts set status='INVITED'; update erp.contacts set email='changed@example.com',phone_display='0551234567'");
    assert.equal(payload(await resolve()).role, "student", "legacy mappings remain authoritative despite profile changes");
    assert.equal((await pg.query<{ status: string }>("select status from erp.student_mobile_accounts")).rows[0].status, "ACTIVE");
    await pg.exec("update erp.student_mobile_accounts set status='DISABLED'");
    assert.equal(payload(await resolve()).accountStatus, "disabled");
    assert.deepEqual(await resolveStudentMobileIdentityDetailed("valid"), { ok: false, code: "MOBILE_ACCOUNT_DISABLED" });
    await pg.exec("update erp.student_mobile_accounts set status='ACTIVE'; update erp.students set lifecycle_status='FROZEN'");
    assert.equal(payload(await resolve()).accountStatus, "disabled");
    await pg.exec("update erp.students set lifecycle_status='ACTIVE'");
    const otherAuth = randomUUID(), otherSession = randomUUID();
    await pg.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,'changed@example.com',now(),$2)", [otherAuth, JSON.stringify({ phone: "+994551234567" })]);
    await pg.query("insert into auth.sessions values($1,$2,null)", [otherSession, otherAuth]);
    const other = await db.$transaction(tx => resolveMobileAccessInTransaction(tx, { authUserId: otherAuth, sessionId: otherSession }));
    assert.ok(other.ok); assert.equal(other.access.matchStatus, "review_required");
    await pg.query("update auth.users set email='aylin@example.com' where id=$1", [otherAuth]);
    await pg.query("update erp.contacts set email='aylin@example.com' where id=$1", [secondContact]);
    await pg.query("insert into erp.students values($1,$2,'SYN-03','ACTIVE')", [randomUUID(), secondContact]);
    const conflictingLogin = await db.$transaction(tx => resolveMobileAccessInTransaction(tx, { authUserId: otherAuth, sessionId: otherSession }));
    assert.ok(conflictingLogin.ok); assert.equal(conflictingLogin.access.matchStatus, "review_required",
      "a login email already claimed by another mapping cannot be reused");
    const memberEvent = { commentId: randomUUID(), revision: 1, authorAuthUserId: otherAuth, postAuthorAuthUserId: authId,
      postId: randomUUID(), body: "Synthetic member comment", createdAt: new Date().toISOString(), parentId: null, approved: true, deleted: false };
    assert.deepEqual(await applyCommentEvent(db as unknown as Prisma.TransactionClient, memberEvent), { status: "ineligible", delta: 0 });
    assert.deepEqual(await applyCommentEvent(db as unknown as Prisma.TransactionClient, memberEvent), { status: "ineligible", delta: 0 });
    const eventRequest = () => new Request("https://erp.example.com/api/mobile/v1/firca/community-events", {
      method: "POST", headers: { authorization: `Bearer ${process.env.FIRCA_COMMUNITY_SERVER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(memberEvent),
    });
    for (let retry = 0; retry < 2; retry++) {
      const eventResponse = await communityEvent(eventRequest());
      assert.equal(eventResponse.status, 200);
      assert.deepEqual(await eventResponse.json(), { status: "ineligible", delta: 0 });
    }
    await pg.exec("delete from auth.sessions");
    assert.deepEqual(await resolveStudentMobileIdentityDetailed("valid"), { ok: false, code: "STUDENT_AUTH_INVALID" });
  } finally {
    delete globals.prisma;
    await pg.close();
  }
});
