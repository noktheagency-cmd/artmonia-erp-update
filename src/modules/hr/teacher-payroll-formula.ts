export function calculateAttendanceAdjustedPayout(input: {
  paidAmount: number;
  attendedLessons: number;
  plannedLessons: number;
  salaryPercent: number;
  totalAttendedLessons?: number;
}) {
  const attendedLessons = Math.max(input.attendedLessons, 0);
  const lessonDenominator = Math.max(
    input.plannedLessons,
    input.totalAttendedLessons ?? attendedLessons,
    1,
  );
  const attendanceRatio = Math.min(attendedLessons / lessonDenominator, 1);
  const eligibleRevenue = money(Math.max(input.paidAmount, 0) * attendanceRatio);
  return {
    attendanceRatio,
    lessonDenominator,
    eligibleRevenue,
    payoutAmount: money(eligibleRevenue * Math.max(input.salaryPercent, 0) / 100),
  };
}

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
