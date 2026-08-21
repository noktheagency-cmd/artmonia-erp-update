import {
  dateFromInput,
  toDateInput,
  weekdayFromDate,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";

type AssignmentSlot = {
  id: string;
  validFrom: string;
  weekday: GroupWeekdayCode;
};

type TeacherOwnedSlot = {
  teacherId: string | null;
};

export function firstSlotOccurrenceDate(
  requestedDate: string,
  slot: Pick<AssignmentSlot, "validFrom" | "weekday">,
) {
  const anchor = requestedDate > slot.validFrom ? requestedDate : slot.validFrom;
  const start = dateFromInput(anchor);

  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setUTCDate(start.getUTCDate() + offset);
    const value = toDateInput(candidate);
    if (weekdayFromDate(value) === slot.weekday) return value;
  }

  return anchor;
}

export function minimumAssignmentDate(
  slotIds: readonly string[],
  slots: readonly AssignmentSlot[],
) {
  const selectedIds = new Set(slotIds);
  let minimum: string | undefined;

  slots.forEach((slot) => {
    if (!selectedIds.has(slot.id)) return;
    if (!minimum || slot.validFrom > minimum) minimum = slot.validFrom;
  });

  return minimum;
}

export function preferredAssignmentDate(
  slotIds: readonly string[],
  slots: readonly AssignmentSlot[],
  today: string,
) {
  const minimum = minimumAssignmentDate(slotIds, slots);
  const requestedDate = minimum && minimum > today ? minimum : today;
  const selectedIds = new Set(slotIds);
  const occurrences = slots
    .filter((slot) => selectedIds.has(slot.id))
    .map((slot) => firstSlotOccurrenceDate(requestedDate, slot));

  return occurrences.length ? occurrences.toSorted()[0] : requestedDate;
}

export function selectedSlotsFirst<T extends { id: string }>(
  slots: readonly T[],
  selectedIds: ReadonlySet<string>,
) {
  const selected: T[] = [];
  const available: T[] = [];

  slots.forEach((slot) => {
    (selectedIds.has(slot.id) ? selected : available).push(slot);
  });

  return [...selected, ...available];
}

export function slotsForAssignedTeacher<T extends TeacherOwnedSlot>(
  slots: readonly T[],
  teacherId: string | null,
) {
  if (!teacherId) return [];
  return slots.filter((slot) => slot.teacherId === teacherId);
}

export function selectionMatchesAssignedTeacher(
  slots: readonly TeacherOwnedSlot[],
  teacherId: string | null,
) {
  if (!slots.length) return true;
  return Boolean(teacherId) && slots.every((slot) => slot.teacherId === teacherId);
}
