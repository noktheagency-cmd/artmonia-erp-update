import type { ActionErrorCode } from "@/lib/action-result";

export class TeacherAccountLinkError extends Error {
  constructor(
    message: string,
    readonly code: ActionErrorCode,
  ) {
    super(message);
    this.name = "TeacherAccountLinkError";
  }
}

type TeacherAccountLinkDb = {
  teacher: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null } | null>;
    findFirst(args: {
      where: { userId: string; id: { not: string } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    update(args: {
      where: { id: string };
      data: { userId: string | null };
      select: { id: true; userId: true };
    }): Promise<{ id: string; userId: string | null }>;
  };
};

export type TeacherAccountLinkResult = {
  teacherId: string | null;
  linked: boolean;
  changed: boolean;
};

/**
 * Keeps the HR employee -> teacher -> ERP account chain consistent whenever
 * account roles change. This is deliberately called inside the surrounding
 * account transaction so a role grant can never be committed without its
 * operational teacher profile link.
 */
export async function syncTeacherAccountLink(
  db: TeacherAccountLinkDb,
  input: {
    teacherId: string | null;
    userId: string;
    hasTeacherRole: boolean;
  },
): Promise<TeacherAccountLinkResult> {
  if (!input.teacherId) {
    if (input.hasTeacherRole) {
      throw new TeacherAccountLinkError(
        "Müəllim rolu üçün əvvəlcə əməkdaşın müəllim profili yaradılmalıdır",
        "CONFLICT",
      );
    }
    return { teacherId: null, linked: false, changed: false };
  }

  const teacher = await db.teacher.findUnique({
    where: { id: input.teacherId },
    select: { id: true, userId: true },
  });
  if (!teacher) {
    throw new TeacherAccountLinkError("Əməkdaşın müəllim profili tapılmadı", "NOT_FOUND");
  }

  if (input.hasTeacherRole) {
    if (teacher.userId && teacher.userId !== input.userId) {
      throw new TeacherAccountLinkError("Müəllim profili başqa ERP hesabına bağlıdır", "CONFLICT");
    }
    const otherTeacher = await db.teacher.findFirst({
      where: { userId: input.userId, id: { not: teacher.id } },
      select: { id: true },
    });
    if (otherTeacher) {
      throw new TeacherAccountLinkError("ERP hesabı başqa müəllim profilinə bağlıdır", "CONFLICT");
    }
    if (teacher.userId === input.userId) {
      return { teacherId: teacher.id, linked: true, changed: false };
    }
    await db.teacher.update({
      where: { id: teacher.id },
      data: { userId: input.userId },
      select: { id: true, userId: true },
    });
    return { teacherId: teacher.id, linked: true, changed: true };
  }

  if (teacher.userId !== input.userId) {
    return { teacherId: teacher.id, linked: false, changed: false };
  }
  await db.teacher.update({
    where: { id: teacher.id },
    data: { userId: null },
    select: { id: true, userId: true },
  });
  return { teacherId: teacher.id, linked: false, changed: true };
}
