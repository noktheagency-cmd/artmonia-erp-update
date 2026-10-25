type SelectValueItem = { value: string; label: string };

/** Catalogs load after opening. Keep a saved value in the form while its
 * option is unavailable; server-side catalog validation still applies.
 */
export function resolveSelectValueItem(
  items: readonly SelectValueItem[],
  value: string,
  emptyValue: string,
  displayLabel = value,
): SelectValueItem | null {
  return items.find((item) => item.value === value)
    ?? (value && value !== emptyValue ? { value, label: displayLabel } : null);
}
