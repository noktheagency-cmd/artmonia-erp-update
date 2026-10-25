"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/select";
import {
  crmListDateError,
  crmListMonthDates,
  crmListNextWeekDates,
  type CrmListDateFilter,
} from "./list-date-filter";

export type CrmListDateSelection = Pick<CrmListDateFilter, "field" | "from" | "to">;

export function CrmListDateControls({
  filter,
  isPending,
  onApply,
}: {
  filter: CrmListDateFilter;
  isPending: boolean;
  onApply: (selection: CrmListDateSelection) => void;
}) {
  const [field, setField] = useState(filter.field);
  const [from, setFrom] = useState(filter.from);
  const [to, setTo] = useState(filter.to);
  const [error, setError] = useState(filter.error);
  const presets: Array<{ label: string; title: string; selection: () => CrmListDateSelection }> = [
    { label: "Bu ay", title: "Cari ayın bütün günləri", selection: () => ({ field, ...crmListMonthDates() }) },
    { label: "Növbəti həftə", title: "Növbəti həftənin planları", selection: () => ({ field: "planned", ...crmListNextWeekDates() }) },
    { label: "Gələn ay", title: "Gələn ayın planları", selection: () => ({ field: "planned", ...crmListMonthDates(1) }) },
    { label: "Bütün tarixlər", title: "Tarix məhdudiyyətini götür", selection: () => ({ field: "created", from: "", to: "" }) },
  ];

  function apply(selection: CrmListDateSelection) {
    const message = crmListDateError(selection.from, selection.to);
    setError(message);
    if (message) return;
    setField(selection.field);
    setFrom(selection.from);
    setTo(selection.to);
    onApply(selection);
  }

  return (
    <form
      className="crm-list-dates"
      aria-label="Müraciət siyahısının tarix filtri"
      aria-busy={isPending}
      onSubmit={(event) => { event.preventDefault(); apply({ field, from, to }); }}
    >
      <FieldGroup className="crm-list-dates-fields">
        <Field>
          <FieldLabel>Tarix növü</FieldLabel>
          <FormSelect
            name="listDateBy"
            aria-label="Siyahının tarix növü"
            value={field}
            onValueChange={(value) => setField(value === "planned" ? "planned" : "created")}
            options={[
              { value: "created", label: "Yaradılma tarixi" },
              { value: "planned", label: "Növbəti addım / görüş tarixi" },
            ]}
          />
        </Field>
        <FieldGroup className="crm-list-date-range" role="group" aria-label="Tarix aralığı">
          <Field>
            <FieldLabel>Başlanğıc</FieldLabel>
            <DatePicker name="listFrom" aria-label="Siyahının başlanğıc tarixi" value={from} onValueChange={setFrom} compact />
          </Field>
          <Field>
            <FieldLabel>Bitmə</FieldLabel>
            <DatePicker name="listTo" aria-label="Siyahının bitmə tarixi" value={to} onValueChange={setTo} compact />
          </Field>
        </FieldGroup>
        <Button className="crm-list-date-apply" type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="crm-spin" data-icon="inline-start" /> : null}
          {isPending ? "Tətbiq edilir…" : "Tətbiq et"}
        </Button>
      </FieldGroup>
      <div className="crm-list-dates-footer">
        <div className="crm-list-date-presets" role="group" aria-label="Sürətli tarix seçimləri">
          {presets.map((preset) => {
            const selection = preset.selection();
            const selected = filter.active && selection.field === filter.field
              && selection.from === filter.from && selection.to === filter.to;
            return (
              <Button
                key={preset.label} type="button" size="sm" variant={selected ? "secondary" : "outline"}
                title={preset.title} aria-pressed={selected} disabled={isPending}
                onClick={() => apply(preset.selection())}
              >{preset.label}</Button>
            );
          })}
        </div>
        <p className={error ? "crm-list-date-error" : "crm-list-date-hint"} role={error ? "alert" : undefined}>
          {error || (field === "planned" ? "Planlanan addım və görüş tarixinə görə" : "Müraciətin yaradılma tarixinə görə")}
        </p>
      </div>
    </form>
  );
}
