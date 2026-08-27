export type PackageLessonUsage = {
  totalLessons: number | null;
  usedLessons: number;
  remainingLessons: number | null;
  overLimitLessons: number;
};

export function calculatePackageLessonUsage(
  totalLessons: number | null,
  presentLessons: number,
): PackageLessonUsage {
  const normalizedTotal = totalLessons === null
    ? null
    : Math.max(0, Math.trunc(totalLessons));
  const usedLessons = Math.max(0, Math.trunc(presentLessons));

  return {
    totalLessons: normalizedTotal,
    usedLessons,
    remainingLessons: normalizedTotal === null
      ? null
      : Math.max(normalizedTotal - usedLessons, 0),
    overLimitLessons: normalizedTotal === null
      ? 0
      : Math.max(usedLessons - normalizedTotal, 0),
  };
}
