import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type AcademyAnnouncementsData = Awaited<ReturnType<typeof getAcademyAnnouncementsData>>;

export async function getAcademyAnnouncementsData() {
  const actor = await requireErpActor("group.read");
  const currentDateTime = toBakuDateTimeInput(new Date());
  if (!actor.permissions.has("group.manage")) {
    return { canManage: false, currentDateTime, programs: [], announcements: [] };
  }
  const prisma = getPrisma();
  const [programs, announcements] = await Promise.all([
    prisma.program.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.academyAnnouncement.findMany({
      take: 50,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        expiresAt: true,
        isActive: true,
        programId: true,
        program: { select: { name: true } },
      },
    }),
  ]);
  return {
    canManage: true,
    currentDateTime,
    programs,
    announcements: announcements.map((announcement) => ({
      ...announcement,
      programName: announcement.program?.name ?? "Bütün proqramlar",
      program: undefined,
      publishedAt: toBakuDateTimeInput(announcement.publishedAt),
      expiresAt: announcement.expiresAt ? toBakuDateTimeInput(announcement.expiresAt) : "",
    })),
  };
}

function toBakuDateTimeInput(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
