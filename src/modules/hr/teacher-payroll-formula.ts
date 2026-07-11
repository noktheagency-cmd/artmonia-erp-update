export function calculateAttendanceAdjustedPayout(input: {
  paidAmount: number;
  attendedLessons: number;
  plannedLessons: number;
  salaryPercent: number;
}) {
  const attendanceRatio = input.plannedLessons > 0
    ? Math.min(Math.max(input.attendedLessons, 0) / input.plannedLessons, 1)
    : 0;
  const eligibleRevenue = money(Math.max(input.paidAmount, 0) * attendanceRatio);
  return {
    attendanceRatio,
    eligibleRevenue,
    payoutAmount: money(eligibleRevenue * Math.max(input.salaryPercent, 0) / 100),
  };
}

function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
