"use client";

import { useTransition, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BookOpen, CreditCard, Filter, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import type { StudentListData } from "@/modules/students/queries";

type StudentFilterFormProps = Pick<StudentListData, "filterOptions" | "filters">;

export function StudentFilterForm({ filterOptions, filters }: StudentFilterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const currentTab = searchParams.get("tab");

    if (currentTab) params.set("tab", currentTab);
    appendParam(params, "from", searchParams.get("from"));
    appendParam(params, "to", searchParams.get("to"));
    const status = cleanValue(formData.get("status"));
    if (status) params.set("status", status);
    const churn = searchParams.get("churn");
    if (churn && !status) params.set("churn", churn);
    appendParam(params, "program", formData.get("program"));
    appendParam(params, "teacher", formData.get("teacher"));

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
