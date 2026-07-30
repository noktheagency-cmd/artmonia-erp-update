"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  searchText?: string;
};

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cx("ui-select-trigger", className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="ui-select-icon" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));

SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cx("ui-select-scroll-button", className)}
    {...props}
  >
    <ChevronUp />
  </SelectPrimitive.ScrollUpButton>
));

SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

export const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cx("ui-select-scroll-button", className)}
    {...props}
  >
    <ChevronDown />
  </SelectPrimitive.ScrollDownButton>
));

SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cx("ui-select-content", className)}
      position={position}
      sideOffset={8}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className="ui-select-viewport">
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));

SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cx("ui-select-label", className)} {...props} />
));

SelectLabel.displayName = SelectPrimitive.Label.displayName;

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item ref={ref} className={cx("ui-select-item", className)} {...props}>
    <span className="ui-select-item-indicator">
      <SelectPrimitive.ItemIndicator>
        <Check />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText className="ui-select-item-text">
      {children}
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));

SelectItem.displayName = SelectPrimitive.Item.displayName;

export function FormSelect({
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  placeholder,
  emptyLabel,
  emptyValue = EMPTY_SELECT_VALUE,
  className,
  contentClassName,
  disabled,
  required,
  searchable = false,
  creatable = false,
  searchPlaceholder = "Axtar...",
  createLabel = "Yeni seçim əlavə et",
  "aria-label": ariaLabel,
  icon: Icon,
}: {
  name: string;
  options: readonly SelectOption[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  emptyValue?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
  searchPlaceholder?: string;
  createLabel?: string;
  "aria-label"?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [createdOptions, setCreatedOptions] = React.useState<SelectOption[]>([]);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isMobileSheet = useMobileSelectSheet();
  const items = React.useMemo(
    () => {
      const baseItems = emptyLabel
        ? [{ value: emptyValue, label: emptyLabel }, ...options]
        : [...options];
      const knownValues = new Set(baseItems.map((item) => item.value));
      return [...baseItems, ...createdOptions.filter((item) => !knownValues.has(item.value))];
    },
    [createdOptions, emptyLabel, emptyValue, options]
  );
  const normalizedDefaultValue = normalizeSelectValue(defaultValue, emptyValue);
  const controlledValue =
    value === undefined ? undefined : normalizeSelectValue(value, emptyValue);
  const [internalValue, setInternalValue] = React.useState(normalizedDefaultValue);
  const currentValue = controlledValue ?? internalValue;
  const displayLabel =
    items.find((item) => item.value === currentValue)?.label ??
    (currentValue !== emptyValue ? currentValue : undefined) ??
    placeholder ??
    emptyLabel ??
    "Seçin";
  const filteredItems = React.useMemo(() => {
    const query = normalizeSearchText(searchQuery);

    if (!query) {
      return items;
    }

    return items.filter((item) =>
      normalizeSearchText(`${item.label} ${item.searchText ?? ""}`).includes(query)
    );
  }, [items, searchQuery]);
  const createValue = searchQuery.replace(/\s+/g, " ").trim();
  const normalizedCreateValue = normalizeSearchText(createValue);
  const canCreate =
    creatable &&
    createValue.length >= 2 &&
    !items.some((item) =>
      normalizeSearchText(item.value) === normalizedCreateValue ||
      normalizeSearchText(item.label) === normalizedCreateValue
    );
  const shouldAutoFocusSearch =
    searchable || (isMobileSheet && (items.length >= 8 || creatable));

  React.useEffect(() => {
    if (!open || !shouldAutoFocusSearch) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [open, shouldAutoFocusSearch]);

  function handleValueChange(nextValue: string) {
    if (creatable && !items.some((item) => item.value === nextValue)) {
      setCreatedOptions((current) => [...current, { value: nextValue, label: nextValue }]);
    }
    if (controlledValue === undefined) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      setSearchQuery("");
    }
  }

  if (isMobileSheet) {
    const showMobileSearch = searchable || items.length >= 8 || creatable;
    const sheetTitle =
      ariaLabel ??
      (placeholder && placeholder !== "Seçin" ? placeholder : undefined) ??
      "Seçim edin";

    return (
      <>
        <input
          type="hidden"
          name={name}
          value={currentValue === emptyValue ? "" : currentValue}
        />
        <button
          className={cx("ui-select-trigger", className)}
          type="button"
          data-state={open ? "open" : "closed"}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-required={required || undefined}
          disabled={disabled}
          onClick={() => handleOpenChange(true)}
        >
          <span className="ui-select-trigger-content">
            {Icon && <Icon className="ui-select-trigger-inline-icon" size={14} />}
            <span className="ui-select-display-value">{displayLabel}</span>
          </span>
          <ChevronDown className="ui-select-icon" />
        </button>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className={cx("ui-mobile-select-sheet", contentClassName)}>
            <div className="ui-mobile-sheet-handle" aria-hidden="true" />
            <DialogHeader className="ui-mobile-select-header">
              <DialogTitle>{sheetTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                Siyahıda axtarın və bir seçim edin.
              </DialogDescription>
            </DialogHeader>

            {showMobileSearch ? (
              <label className="ui-mobile-select-search">
                <Search aria-hidden="true" size={18} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  maxLength={creatable ? 80 : undefined}
                />
              </label>
            ) : null}

            <div className="ui-mobile-select-options" role="listbox" aria-label={sheetTitle}>
              {filteredItems.map((item) => {
                const checked = item.value === currentValue;

                return (
                  <button
                    className="ui-mobile-select-option"
                    type="button"
                    role="option"
                    aria-selected={checked}
                    key={item.value}
                    disabled={item.disabled}
                    onClick={() => {
                      handleValueChange(item.value);
                      handleOpenChange(false);
                    }}
                  >
                    <span>{item.label}</span>
                    {checked ? <Check aria-hidden="true" size={19} /> : null}
                  </button>
                );
              })}

              {canCreate ? (
                <button
                  className="ui-mobile-select-option is-create"
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    handleValueChange(createValue);
                    handleOpenChange(false);
                  }}
                >
                  <span>{createLabel}: “{createValue}”</span>
                </button>
              ) : null}

              {filteredItems.length === 0 && !canCreate ? (
                <div className="ui-mobile-select-empty">Nəticə tapılmadı</div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Select
      name={name}
      open={open}
      onOpenChange={handleOpenChange}
      value={currentValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <span className="ui-select-trigger-content">
          {Icon && <Icon className="ui-select-trigger-inline-icon" size={14} />}
          <span className="ui-select-display-value">{displayLabel}</span>
        </span>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {searchable ? (
          <div
            className="ui-select-search"
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Search aria-hidden="true" size={14} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              maxLength={creatable ? 80 : undefined}
            />
          </div>
        ) : null}
        {filteredItems.length > 0 || canCreate ? (
          <SelectGroup>
            {filteredItems.map((item) => (
              <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                {item.label}
              </SelectItem>
            ))}
            {canCreate ? (
              <SelectItem key={`create-${createValue}`} value={createValue}>
                {createLabel}: “{createValue}”
              </SelectItem>
            ) : null}
          </SelectGroup>
        ) : (
          <div className="ui-select-empty-state">Nəticə tapılmadı</div>
        )}
      </SelectContent>
    </Select>
  );
}

function normalizeSelectValue(value: string | undefined, emptyValue: string) {
  return value && value.length > 0 ? value : emptyValue;
}

function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("az")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ə]/g, "e")
    .replace(/[ı]/g, "i")
    .replace(/[ş]/g, "s")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .trim();
}

function useMobileSelectSheet() {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setMatches(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  return matches;
}
