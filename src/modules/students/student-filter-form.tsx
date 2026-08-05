"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BookOpen, CreditCard, Filter, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldGroup } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import type { StudentListData } from "@/modules/students/queries";

type StudentFilterFormProps = Pick<StudentListData, "filterOptions" | "filters" | "query">;

export function StudentFilterForm({ filterOptions, filters, query }: StudentFilterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const currentTab = searchParams.get("tab");

    if (currentTab) params.set("tab", currentTab);
    appendParam(params, "q", formData.get("q"));
    appendParam(params, "status", formData.get("status"));
    appendParam(params, "program", formData.get("program"));
    appendParam(params, "teacher", formData.get("teacher"));
    appendParam(params, "from", formData.get("from"));
    appendParam(params, "to", formData.get("to"));

    const payment = cleanValue(formData.get("payment"));
    if (payment && payment !== "all") params.set("payment", payment);
    const nextUrl = (params.size > 0 ? `/students?${params.toString()}` : "/students") as Route;
    startTransition(() => router.push(nextUrl));
  }

  function handleClear() {
    const tab = searchParams.get("tab");
    const nextUrl = (tab ? `/students?tab=${tab}` : "/students") as Route;
    startTransition(() => router.push(nextUrl));
  }

  return (
    <form className="students-filter-form" onSubmit={handleSubmit} aria-label="Tələbə filtrləri">
      <FieldGroup className="students-filter-primary">
        <Field className="students-search-field">
          <InputGroup>
            <InputGroupAddon aria-hidden="true"><Search /></InputGroupAddon>
            <InputGroupInput name="q" placeholder="Tələbə, kod və ya telefon..." defaultValue={query} aria-label="Tələbə axtar" />
          </InputGroup>
        </Field>
        <Field className="students-date-field"><DatePicker name="from" value={dateFrom} onValueChange={setDateFrom} placeholder="Başlanğıc" aria-label="Başlanğıc tarixi" /></Field>
        <Field className="students-date-field"><DatePicker name="to" value={dateTo} onValueChange={setDateTo} placeholder="Son tarix" aria-label="Son tarix" /></Field>
        <Field className="students-filter-select-field"><FormSelect name="status" defaultValue={filters.status} emptyLabel="Status" options={filterOptions.statuses} icon={Activity} /></Field>
        <Field className="students-filter-select-field"><FormSelect name="program" defaultValue={filters.program} emptyLabel="Proqram" options={filterOptions.programs} icon={BookOpen} searchable searchPlaceholder="Proqram axtar..." /></Field>
        <Field className="students-filter-select-field"><FormSelect name="teacher" defaultValue={filters.teacher} emptyLabel="Müəllim" options={filterOptions.teachers} icon={Users} searchable searchPlaceholder="Müəllim axtar..." /></Field>
        <Field className="students-filter-select-field"><FormSelect name="payment" defaultValue={filters.payment} options={filterOptions.payments} icon={CreditCard} /></Field>
        <Button type="submit" size="icon" disabled={isPending} aria-label="Filtrləri göstər" title="Göstər"><Filter /></Button>
        <Button type="button" variant="outline" size="icon" onClick={handleClear} aria-label="Filtrləri təmizlə" title="Təmizlə"><X /></Button>
      </FieldGroup>
    </form>
  );
}

function appendParam(params: URLSearchParams, key: string, value: FormDataEntryValue | null) {
  const clean = cleanValue(value);
  if (clean) params.set(key, clean);
}

function cleanValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed && trimmed !== EMPTY_SELECT_VALUE ? trimmed : "";
}
