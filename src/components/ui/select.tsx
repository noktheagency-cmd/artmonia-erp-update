"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

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
  "aria-label"?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
}) {
  const items = emptyLabel
    ? [{ value: emptyValue, label: emptyLabel }, ...options]
    : options;
  const normalizedDefaultValue = normalizeSelectValue(defaultValue, emptyValue);
  const controlledValue =
    value === undefined ? undefined : normalizeSelectValue(value, emptyValue);

  return (
    <Select
      name={name}
      defaultValue={controlledValue === undefined ? normalizedDefaultValue : undefined}
      value={controlledValue}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <span className="ui-select-trigger-content">
          {Icon && <Icon className="ui-select-trigger-inline-icon" size={14} />}
          <SelectValue placeholder={placeholder ?? emptyLabel ?? "Seçin"} />
        </span>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function normalizeSelectValue(value: string | undefined, emptyValue: string) {
  return value && value.length > 0 ? value : emptyValue;
}
