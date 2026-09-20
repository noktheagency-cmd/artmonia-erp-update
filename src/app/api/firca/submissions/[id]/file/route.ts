import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { teacherScope } from "@/modules/firca/homework";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireErpActor("attendance.manage");const id=z.string().uuid().parse((await params).id);
    const scope=await teacherScope(actor);
    const [row]=await getPrisma().$queryRaw<{path:string}[]>(Prisma.sql`select h.object_path as path from erp.homework_submissions h join erp.slot_sessions s on s.id=h.session_id where h.id=${id}::uuid and ${scope}`);
    if(!row)return Response.json({code:"NOT_FOUND"},{status:404});
    const result=await getSupabaseAdminClient().storage.from("erp-private-files").createSignedUrl(row.path,60,{download:true});
    if(result.error)return Response.json({code:"FILE_UNAVAILABLE"},{status:503});
    return new Response(null,{status:302,headers:{Location:result.data.signedUrl,"Cache-Control":"private, no-store"}});
  }catch{return Response.json({code:"FORBIDDEN"},{status:403});}
}
