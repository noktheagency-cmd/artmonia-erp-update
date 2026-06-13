import { getPrisma } from "@/server/db/prisma";

export type DuplicatePhoneMatch = {
  id: string;
  fullName: string;
  phone: string;
  students: Array<{
    code: string;
    status: string;
  }>;
  leads: Array<{
    stage: string;
    createdAt: string;
  }>;
};

export async function findDuplicatePhoneMatches(
  phone: string
): Promise<DuplicatePhoneMatch[]> {
  const phoneNormalized = normalizePhone(phone);

  if (!phoneNormalized) {
    return [];
  }

  const matches = await getPrisma().contact.findMany({
    where: { phoneNormalized },
    take: 5,
    select: {
      id: true,
      fullName: true,
      phoneDisplay: true,
      students: {
        select: {
          code: true,
          lifecycleStatus: true,
        },
        take: 3,
      },
      leads: {
        orderBy: { createdAt: "desc" },
        select: {
          stage: true,
          createdAt: true,
        },
        take: 3,
      },
    },
  });

  return matches.map((match) => ({
    id: match.id,
    fullName: match.fullName,
    phone: match.phoneDisplay ?? phone,
    students: match.students.map((student) => ({
      code: student.code,
      status: student.lifecycleStatus,
    })),
    leads: match.leads.map((lead) => ({
      stage: lead.stage,
      createdAt: lead.createdAt.toISOString(),
    })),
  }));
}

export function normalizePhone(value: string | undefined) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length > 0 ? normalized : null;
}
