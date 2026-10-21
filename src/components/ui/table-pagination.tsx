"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildTablePaginationItems,
  DEFAULT_TABLE_PAGE_SIZE,
  normalizeTablePageSize,
  TABLE_PAGE_SIZE_OPTIONS,
} from "@/components/ui/table-page-size";
import "./table-pagination.css";

function rowSignature(rows: readonly unknown[]) {
  const first = rows[0] as { id?: string } | undefined;
  const last = rows[rows.length - 1] as { id?: string } | undefined;
  return `${rows.length}:${first?.id ?? ""}:${last?.id ?? ""}`;
}

export function useClientTablePagination<T>(rows: readonly T[]) {
  const [pageState, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [signature, setSignature] = useState(() => rowSignature(rows));
  const nextSignature = rowSignature(rows);
  const signatureChanged = nextSignature !== signature;

  if (signatureChanged) {
    setSignature(nextSignature);
    setPageState(1);
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(signatureChanged ? 1 : pageState, totalPages);
  const start = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    total,
    totalPages,
    pageRows: rows.slice(start, start + pageSize),
    setPage: (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    setPageSize: (next: number) => {
      setPageSizeState(normalizeTablePageSize(next));
      setPageState(1);
    },
  };
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  label = "Cədvəl səhifələri",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  if (total <= 0) return null;

  const safePageSize = normalizeTablePageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const items = buildTablePaginationItems(safePage, totalPages);

  return (
    <nav className="erp-table-pagination" aria-label={label}>
      <div className="erp-table-pagination-pages">
        <button
          type="button"
          className="erp-table-pagination-button"
          disabled={disabled || safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Əvvəlki səhifə"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        {items.map((item, index) =>
          typeof item === "number" ? (
            <button
              type="button"
              className="erp-table-pagination-button"
              data-active={item === safePage}
              disabled={disabled || item === safePage}
              onClick={() => onPageChange(item)}
              aria-current={item === safePage ? "page" : undefined}
              aria-label={`Səhifə ${item}`}
              key={item}
            >
              {item}
            </button>
          ) : (
            <span className="erp-table-pagination-ellipsis" aria-hidden="true" key={`${item}-${index}`}>
              …
            </span>
          ),
        )}
        <button
          type="button"
          className="erp-table-pagination-button"
          disabled={disabled || safePage === totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Növbəti səhifə"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <label className="erp-table-pagination-size">
        <span>Sətir</span>
        <PageSizeMenu value={safePageSize} disabled={disabled} onChange={onPageSizeChange} />
      </label>
    </nav>
  );
}

function PageSizeMenu({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (pageSize: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [placement, setPlacement] = useState({ top: 0, right: 0, above: true });

  useEffect(() => {
    if (!open) return;

    function place() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top > 188;
      setPlacement({
        top: above ? rect.top - 6 : rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
        above,
      });
    }

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    place();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <span className="erp-table-pagination-select" data-open={open}>
      <button
        ref={triggerRef}
        type="button"
        className="erp-table-pagination-size-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Səhifədə sətir sayı"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {value}
        <ChevronDown aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <ul
              ref={menuRef}
              className="erp-table-pagination-size-menu"
              role="listbox"
              aria-label="Səhifədə sətir sayı"
              data-above={placement.above}
              style={{ top: placement.top, right: placement.right }}
            >
              {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
                <li key={size} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={size === value}
                    data-active={size === value}
                    onClick={() => {
                      onChange(size);
                      setOpen(false);
                    }}
                  >
                    {size}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </span>
  );
}
