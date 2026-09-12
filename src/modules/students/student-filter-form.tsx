"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BookOpen, CreditCard, Filter, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import type { StudentListData } from "@/modules/students/queries";

type StudentFilterFormProps = Pick<StudentListData, "filterOptions" | "filters">;

export function StudentFilterForm({ filterOptions, filters }: StudentFilterFormProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const currentTab = searchParams.get("tab");

    if (currentTab) params.set("tab", currentTab);
    appendParam(params, "q", searchParams.get("q"));
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
    startTransition(() => { router.push(nextUrl); setOpen(false); });
  }

  function handleClear() {
    const tab = searchParams.get("tab");
    const nextUrl = (tab ? `/students?tab=${tab}` : "/students") as Route;
    startTransition(() => { router.push(nextUrl); setOpen(false); });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label={`Filtrlər${filters.activeCount ? ` (${filters.activeCount})` : ""}`}>
          <Filter /> Filtrlər
          {filters.activeCount > 0 ? <span className="students-filter-count">{filters.activeCount}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="students-filter-dialog" aria-describedby={undefined} onEscapeKeyDown={() => setOpen(false)}>
        <DialogHeader><DialogTitle>Filtrlər</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} aria-label="Tələbə filtrləri">
          <FieldGroup className="students-filter-dialog-grid">
            <Field><span className="ui-field-label">Status</span><FormSelect name="status" aria-label="Status" defaultValue={filters.status} emptyLabel="Bütün statuslar" options={filterOptions.statuses} icon={Activity} /></Field>
            <Field><span className="ui-field-label">Proqram</span><FormSelect name="program" aria-label="Proqram" defaultValue={filters.program} emptyLabel="Bütün proqramlar" options={filterOptions.programs} icon={BookOpen} searchable searchPlaceholder="Proqram axtar..." /></Field>
            <Field><span className="ui-field-label">Müəllim</span><FormSelect name="teacher" aria-label="Müəllim" defaultValue={filters.teacher} emptyLabel="Bütün müəllimlər" options={filterOptions.teachers} icon={Users} searchable searchPlaceholder="Müəllim axtar..." /></Field>
            <Field><span className="ui-field-label">Ödəniş</span><FormSelect name="payment" aria-label="Ödəniş" defaultValue={filters.payment} options={filterOptions.payments} icon={CreditCard} /></Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={isPending} onClick={handleClear}><X /> Sıfırla</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Tətbiq edilir…" : "Tətbiq et"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
