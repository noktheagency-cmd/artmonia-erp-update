"use client";

import { useState } from "react";
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
        <Field>
          <FieldLabel>Başlanğıc</FieldLabel>
          <DatePicker name="listFrom" aria-label="Siyahının başlanğıc tarixi" value={from} onValueChange={setFrom} />
        </Field>
        <Field>
          <FieldLabel>Bitmə</FieldLabel>
          <DatePicker name="listTo" aria-label="Siyahının bitmə tarixi" value={to} onValueChange={setTo} />
        </Field>
        <Button type="submit" disabled={isPending}>{isPending ? "Tətbiq edilir…" : "Tətbiq et"}</Button>
      </FieldGroup>
      <div className="crm-list-date-presets" aria-label="Sürətli tarix seçimləri">
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => apply({ field, ...crmListMonthDates() })}>Bu ay</Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => apply({ field: "planned", ...crmListNextWeekDates() })}>Növbəti həftənin planları</Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => apply({ field: "planned", ...crmListMonthDates(1) })}>Gələn ayın planları</Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => apply({ field: "created", from: "", to: "" })}>Bütün tarixlər</Button>
      </div>
      <p className={error ? "crm-list-date-error" : "crm-list-date-hint"} role={error ? "alert" : undefined}>
        {error || (field === "planned"
          ? "Müraciətin növbəti addımı və ya görüşü üçün planlanan tarixə görə axtarır."
          : "Müraciətin yaradıldığı tarixə görə axtarır.")}
      </p>
    </form>
  );
}
