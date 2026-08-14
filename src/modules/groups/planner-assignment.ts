type AssignmentSlot = {
  id: string;
  validFrom: string;
};

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
  return minimum && minimum > today ? minimum : today;
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
