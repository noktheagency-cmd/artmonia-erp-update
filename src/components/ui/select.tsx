"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Combobox } from "@base-ui/react/combobox";
import {
  Check,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import {
  deleteDropdownCatalogOptionAction,
  getDropdownCatalogOptionsAction,
  saveDropdownCatalogOptionAction,
} from "@/modules/settings/dropdown-option-actions";
import type {
  DropdownCatalogKey,
  DropdownCatalogRecord,
} from "@/modules/settings/dropdown-option-types";

export type SelectOption = {
  id?: string;
  value: string;
  label: string;
  disabled?: boolean;
  locked?: boolean;
  searchText?: string;
};

export type SelectOptionCrudConfig = {
  canManage?: boolean;
  createLabel?: string;
  onCreate: (label: string) => Promise<SelectOption>;
  onUpdate: (option: SelectOption, label: string) => Promise<SelectOption>;
  onDelete: (option: SelectOption) => Promise<void>;
};

type FormSelectProps = {
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
  catalogKey?: DropdownCatalogKey;
  optionCrud?: SelectOptionCrudConfig;
  searchPlaceholder?: string;
  createLabel?: string;
  "aria-label"?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
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
      collisionPadding={12}
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

export function FormSelect(props: FormSelectProps) {
  return <FormSelectState key={props.catalogKey ?? "static"} {...props} />;
}

function FormSelectState({
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
  catalogKey,
  optionCrud,
  searchPlaceholder = "Axtar...",
  createLabel = "Yeni seçim əlavə et",
  "aria-label": ariaLabel,
  icon: Icon,
}: FormSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [createdOptions, setCreatedOptions] = React.useState<SelectOption[]>([]);
  const [optionOverrides, setOptionOverrides] = React.useState<SelectOption[]>([]);
  const [hiddenOptionValues, setHiddenOptionValues] = React.useState<string[]>([]);
  const [catalogLoaded, setCatalogLoaded] = React.useState(false);
  const [catalogLoading, setCatalogLoading] = React.useState(false);
  const [catalogCanManage, setCatalogCanManage] = React.useState(false);
  const [dialogPortalContainer, setDialogPortalContainer] = React.useState<HTMLElement | null>(null);
  const [editor, setEditor] = React.useState<
    { mode: "create"; option?: undefined } | { mode: "edit"; option: SelectOption } | null
  >(null);
  const [editorValue, setEditorValue] = React.useState("");
  const [deleteCandidate, setDeleteCandidate] = React.useState<SelectOption | null>(null);
  const [crudPending, startCrudTransition] = React.useTransition();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const mobileListId = React.useId();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const editorInputRef = React.useRef<HTMLInputElement>(null);
  const isMobileSheet = useMobileSelectSheet();
  const items = React.useMemo(
    () => {
      const baseItems = emptyLabel
        ? [{ value: emptyValue, label: emptyLabel }, ...options]
        : [...options];
      const hiddenValues = new Set(hiddenOptionValues);
      const optionMap = new Map(
        baseItems
          .filter((item) => !hiddenValues.has(item.value))
          .map((item) => [item.value, item]),
      );

      for (const item of [...optionOverrides, ...createdOptions]) {
        if (!hiddenValues.has(item.value)) {
          optionMap.set(item.value, { ...optionMap.get(item.value), ...item });
        }
      }

      return [...optionMap.values()];
    },
    [createdOptions, emptyLabel, emptyValue, hiddenOptionValues, optionOverrides, options]
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
    creatable && !catalogKey && !optionCrud &&
    createValue.length >= 2 &&
    !items.some((item) =>
      normalizeSearchText(item.value) === normalizedCreateValue ||
      normalizeSearchText(item.label) === normalizedCreateValue
    );
  const shouldAutoFocusSearch =
    !isMobileSheet && searchable;
  const canManageOptions = optionCrud?.canManage ?? catalogCanManage;
  const optionCreateLabel = optionCrud?.createLabel ?? createLabel;

  React.useEffect(() => {
    if (!open || !shouldAutoFocusSearch) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [open, shouldAutoFocusSearch]);

  React.useEffect(() => {
    if (!open || !editor) return;
    const focusTimer = window.setTimeout(() => editorInputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [editor, open]);

  async function loadCatalogOptions() {
    if (!catalogKey || catalogLoaded || catalogLoading) return;
    setCatalogLoading(true);
    try {
      const snapshot = unwrapActionResult(
        await getDropdownCatalogOptionsAction(catalogKey),
      );
      setCatalogCanManage(snapshot.canManage);
      setOptionOverrides(
        snapshot.records.filter((record) => record.isActive).map(catalogRecordToOption),
      );
      setHiddenOptionValues(
        snapshot.records.filter((record) => !record.isActive).map((record) => record.value),
      );
      setCatalogLoaded(true);
    } catch (error) {
      notifyCaughtError(error, "Dropdown seçimləri yüklənmədi.");
    } finally {
      setCatalogLoading(false);
    }
  }

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

    if (nextOpen) {
      setDialogPortalContainer(
        triggerRef.current?.closest<HTMLElement>(".ui-dialog-content") ?? null,
      );
      void loadCatalogOptions();
    }

    if (!nextOpen) {
      setSearchQuery("");
      setEditor(null);
      setEditorValue("");
      setDeleteCandidate(null);
    }
  }

  function beginCreate() {
    setDeleteCandidate(null);
    setEditor({ mode: "create" });
    setEditorValue("");
  }

  function beginEdit(option: SelectOption) {
    setDeleteCandidate(null);
    setEditor({ mode: "edit", option });
    setEditorValue(option.label);
  }

  function cancelCrudPanel() {
    setEditor(null);
    setEditorValue("");
    setDeleteCandidate(null);
  }

  function saveManagedOption() {
    const label = editorValue.replace(/\s+/g, " ").trim();
    if (!editor || label.length < 2 || !canManageOptions) return;

    startCrudTransition(async () => {
      try {
        const previousOption = editor.mode === "edit" ? editor.option : null;
        const saved = optionCrud
          ? editor.mode === "edit"
            ? await optionCrud.onUpdate(editor.option, label)
            : await optionCrud.onCreate(label)
          : catalogKey
            ? catalogRecordToOption(
                unwrapActionResult(
                  await saveDropdownCatalogOptionAction({
                    catalog: catalogKey,
                    value: editor.mode === "edit" ? editor.option.value : undefined,
                    label,
                  }),
                ),
              )
            : null;

        if (!saved) return;
        setHiddenOptionValues((current) =>
          [...new Set([
            ...current.filter((value) => value !== saved.value),
            ...(previousOption && previousOption.value !== saved.value
              ? [previousOption.value]
              : []),
          ])],
        );
        setOptionOverrides((current) => [
          ...current.filter(
            (item) => item.value !== saved.value && item.value !== previousOption?.value,
          ),
          saved,
        ]);

        if (previousOption && currentValue === previousOption.value) {
          handleValueChange(saved.value);
        } else if (!previousOption) {
          handleValueChange(saved.value);
        }

        cancelCrudPanel();
        notifySuccess(
          previousOption ? "Seçim yeniləndi" : "Yeni seçim əlavə edildi",
          saved.label,
        );
      } catch (error) {
        notifyCaughtError(error, "Dropdown seçimi saxlanmadı.");
      }
    });
  }

  function deleteManagedOption() {
    if (!deleteCandidate || !canManageOptions) return;
    const candidate = deleteCandidate;

    startCrudTransition(async () => {
      try {
        if (optionCrud) {
          await optionCrud.onDelete(candidate);
        } else if (catalogKey) {
          unwrapActionResult(
            await deleteDropdownCatalogOptionAction({
              catalog: catalogKey,
              value: candidate.value,
              label: candidate.label,
            }),
          );
        }

        setOptionOverrides((current) =>
          current.filter((item) => item.value !== candidate.value),
        );
        setCreatedOptions((current) =>
          current.filter((item) => item.value !== candidate.value),
        );
        setHiddenOptionValues((current) => [...new Set([...current, candidate.value])]);
        if (currentValue === candidate.value) {
          handleValueChange(emptyLabel ? emptyValue : "");
        }
        cancelCrudPanel();
        notifySuccess("Seçim silindi", candidate.label);
      } catch (error) {
        notifyCaughtError(error, "Dropdown seçimi silinmədi.");
      }
    });
  }

  function managedActions(option: SelectOption) {
    if (!canManageOptions || option.value === emptyValue || option.locked) return null;
    return (
      <span className="ui-select-option-actions">
        <button
          type="button"
          aria-label={`${option.label} seçimini redaktə et`}
          title="Redaktə et"
          onPointerDown={stopManagedPointerEvent}
          onClick={(event) => {
            event.stopPropagation();
            beginEdit(option);
          }}
        >
          <Pencil aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`${option.label} seçimini sil`}
          title="Sil"
          onPointerDown={stopManagedPointerEvent}
          onClick={(event) => {
            event.stopPropagation();
            setEditor(null);
            setDeleteCandidate(option);
          }}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </span>
    );
  }

  function crudPanel() {
    if (catalogLoading) {
      return (
        <div className="ui-select-crud-status">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          Seçimlər yüklənir...
        </div>
      );
    }
    if (!canManageOptions) return null;

    if (deleteCandidate) {
      return (
        <div className="ui-select-crud-confirm">
          <span>“{deleteCandidate.label}” silinsin?</span>
          <span>
            <button type="button" onPointerDown={stopManagedPointerEvent} onClick={cancelCrudPanel} aria-label="Silməni ləğv et"><X /></button>
            <button className="is-danger" type="button" disabled={crudPending} onPointerDown={stopManagedPointerEvent} onClick={deleteManagedOption} aria-label="Seçimi sil"><Trash2 /></button>
          </span>
        </div>
      );
    }

    if (editor) {
      return (
        <div className="ui-select-crud-editor" onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <input
            ref={editorInputRef}
            value={editorValue}
            onChange={(event) => setEditorValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveManagedOption();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelCrudPanel();
              }
            }}
            aria-label={editor.mode === "edit" ? "Seçimin yeni adı" : "Yeni seçimin adı"}
            placeholder="Seçimin adını yazın"
            maxLength={80}
          />
          <button type="button" onPointerDown={stopManagedPointerEvent} onClick={cancelCrudPanel} aria-label="Redaktəni ləğv et"><X /></button>
          <button type="button" disabled={crudPending || editorValue.trim().length < 2} onPointerDown={stopManagedPointerEvent} onClick={saveManagedOption} aria-label="Seçimi yadda saxla">
            {crudPending ? <LoaderCircle className="is-spinning" /> : <Save />}
          </button>
        </div>
      );
    }

    return (
      <button className="ui-select-crud-create" type="button" onPointerDown={stopManagedPointerEvent} onClick={beginCreate}>
        <Plus aria-hidden="true" />
        {optionCreateLabel}
      </button>
    );
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
          ref={triggerRef}
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
          <DialogContent
            className={cx("ui-mobile-select-sheet", contentClassName)}
            onOpenAutoFocus={(event) => {
              // Keep the options visible until the user chooses to search;
              // focusing the input immediately opens the mobile keyboard.
              event.preventDefault();
              window.requestAnimationFrame(() => {
                document.getElementById(mobileListId)?.focus({ preventScroll: true });
              });
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus({ preventScroll: true });
            }}
          >
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

            <div id={mobileListId} tabIndex={-1} className="ui-mobile-select-options" role="listbox" aria-label={sheetTitle}>
              {filteredItems.map((item) => {
                const checked = item.value === currentValue;

                return (
                  <div className="ui-mobile-select-option-row" key={item.value}>
                    <button
                      className="ui-mobile-select-option"
                      type="button"
                      role="option"
                      aria-selected={checked}
                      disabled={item.disabled}
                      onClick={() => {
                        handleValueChange(item.value);
                        handleOpenChange(false);
                      }}
                    >
                      <span>{item.label}</span>
                      {checked ? <Check aria-hidden="true" size={19} /> : null}
                    </button>
                    {managedActions(item)}
                  </div>
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
            <div className="ui-mobile-select-crud-panel">{crudPanel()}</div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (searchable) {
    const createItem = canCreate
      ? {
          value: createValue,
          label: `${createLabel}: “${createValue}”`,
          searchText: createValue,
        }
      : null;
    const visibleItems = createItem ? [...filteredItems, createItem] : filteredItems;
    const selectedItem = items.find((item) => item.value === currentValue) ?? null;
    const comboboxLabel = ariaLabel ?? searchPlaceholder;

    return (
      <Combobox.Root<SelectOption>
        name={name}
        open={open}
        onOpenChange={(nextOpen) => handleOpenChange(nextOpen)}
        value={selectedItem}
        onValueChange={(item) => {
          if (item) handleValueChange(item.value);
        }}
        inputValue={searchQuery}
        onInputValueChange={(query) => setSearchQuery(query)}
        items={visibleItems}
        filter={null}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(item, selected) => item.value === selected.value}
        disabled={disabled}
        required={required}
        autoHighlight
      >
        <Combobox.Trigger
          ref={triggerRef}
          className={cx("ui-select-trigger", "ui-combobox-trigger", className)}
          aria-label={comboboxLabel}
        >
          <span className="ui-select-trigger-content">
            {Icon && <Icon className="ui-select-trigger-inline-icon" size={14} />}
            <span className="ui-select-display-value">{displayLabel}</span>
          </span>
          <ChevronDown className="ui-select-icon" aria-hidden="true" />
        </Combobox.Trigger>
        <Combobox.Portal container={dialogPortalContainer ?? undefined}>
          <Combobox.Positioner
            className="ui-combobox-positioner"
            align="start"
            sideOffset={8}
          >
            <Combobox.Popup
              className={cx("ui-select-content", "ui-combobox-popup", contentClassName)}
              aria-label={comboboxLabel}
            >
              <div className="ui-select-search">
                <Search aria-hidden="true" size={14} />
                <Combobox.Input
                  ref={searchInputRef}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  maxLength={creatable ? 80 : undefined}
                />
              </div>
              <div className="ui-select-viewport ui-combobox-viewport">
                <Combobox.Empty className="ui-select-empty-state">
                  Nəticə tapılmadı
                </Combobox.Empty>
                <Combobox.List className="ui-combobox-list">
                  {(item: SelectOption) => (
                    <Combobox.Row className="ui-select-managed-row" key={item.value}>
                      <Combobox.Item
                        className="ui-select-item"
                        value={item}
                        disabled={item.disabled}
                      >
                        <span className="ui-select-item-indicator">
                          <Combobox.ItemIndicator>
                            <Check />
                          </Combobox.ItemIndicator>
                        </span>
                        <span className="ui-select-item-text">{item.label}</span>
                      </Combobox.Item>
                      {item === createItem ? null : managedActions(item)}
                    </Combobox.Row>
                  )}
                </Combobox.List>
              </div>
              <div className="ui-select-crud-panel">{crudPanel()}</div>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
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
        <div className="ui-select-crud-panel">{crudPanel()}</div>
      </SelectContent>
    </Select>
  );
}

function catalogRecordToOption(record: DropdownCatalogRecord): SelectOption {
  return { id: record.id, value: record.value, label: record.label };
}

function stopManagedPointerEvent(event: React.PointerEvent) {
  event.preventDefault();
  event.stopPropagation();
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
