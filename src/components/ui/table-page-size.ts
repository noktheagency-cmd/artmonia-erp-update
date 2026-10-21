export const TABLE_PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const;
export const DEFAULT_TABLE_PAGE_SIZE = 15;

export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];

export function normalizeTablePageSize(value: unknown, fallback: TablePageSize = DEFAULT_TABLE_PAGE_SIZE) {
  const parsed = Number(value);
  return (TABLE_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed as TablePageSize
    : fallback;
}

export type TablePaginationItem = number | "ellipsis";

export function buildTablePaginationItems(currentPage: number, totalPages: number): TablePaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: Math.max(totalPages, 0) }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
}
