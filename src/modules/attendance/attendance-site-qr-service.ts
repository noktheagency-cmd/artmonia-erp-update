import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import type { ErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export async function getAttendanceSiteQr(actor: ErpActor) {
  assertSiteQrManager(actor);
  const site = await getPrisma().attendanceSite.findFirst({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      token: true,
      locationLabel: true,
      isActive: true,
      rotatedAt: true,
    },
  });
  if (!site) throw new Error("Ümumi davamiyyət QR-ı konfiqurasiya edilməyib");
  return sitePayload(site);
}

export async function rotateAttendanceSiteQr(actor: ErpActor) {
  assertSiteQrManager(actor);
  const prisma = getPrisma();
  const site = await prisma.$transaction(async (tx) => {
    const current = await tx.attendanceSite.findFirst({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
    if (!current) throw new Error("Ümumi davamiyyət QR-ı konfiqurasiya edilməyib");
    await tx.$executeRaw(Prisma.sql`
      select pg_advisory_xact_lock(hashtextextended(${`attendance-site:${current.id}`}, 0))
    `);
    const updated = await tx.attendanceSite.update({
      where: { id: current.id },
      data: {
        token: randomBytes(32).toString("base64url"),
        isActive: true,
        rotatedAt: new Date(),
        updatedById: actor.id,
      },
      select: {
        id: true,
        name: true,
        token: true,
        locationLabel: true,
        isActive: true,
        rotatedAt: true,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "attendance_site.qr.rotate",
      entityType: "attendance_site",
      entityId: current.id,
      before: { tokenFingerprint: current.token.slice(0, 8), rotatedAt: current.rotatedAt.toISOString() },
      after: { tokenFingerprint: updated.token.slice(0, 8), rotatedAt: updated.rotatedAt.toISOString() },
      reason: "Ümumi davamiyyət QR tokeni yeniləndi",
    });
    return updated;
  });
  return sitePayload(site);
}

function sitePayload(site: {
  id: string;
  name: string;
  token: string;
  locationLabel: string | null;
  isActive: boolean;
  rotatedAt: Date;
}) {
  return {
    id: site.id,
    name: site.name,
    location: site.locationLabel,
    isActive: site.isActive,
    deepLink: `artmonia://attendance/check-in?v=2&token=${site.token}`,
    rotatedAt: site.rotatedAt.toISOString(),
  };
}

function assertSiteQrManager(actor: ErpActor) {
  if (!actor.permissions.has("group.manage")) {
    throw new Error("Missing permission: group.manage");
  }
}
