export const STUDENT_LESSONS_PER_WEEK = 2;

type CapacityGroup = {
  capacity: number;
  schedules: readonly unknown[];
};

export type GroupCapacityMetrics = {
  weeklyClassPlaces: number;
  maximumStudentCapacity: number;
};

export function calculateGroupCapacity(
  groups: readonly CapacityGroup[],
  studentLessonsPerWeek = STUDENT_LESSONS_PER_WEEK,
): GroupCapacityMetrics {
  if (!Number.isFinite(studentLessonsPerWeek) || studentLessonsPerWeek <= 0) {
    throw new RangeError("Student lessons per week must be greater than zero");
  }

  const weeklyClassPlaces = groups.reduce(
    (total, group) => total + group.capacity * group.schedules.length,
    0,
  );

  return {
    weeklyClassPlaces,
    maximumStudentCapacity: Math.floor(weeklyClassPlaces / studentLessonsPerWeek),
  };
}
