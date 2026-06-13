"use client";

import { FormEvent, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import type { StudentListData } from "@/modules/students/queries";

type StudentFilterFormProps = Pick<
  StudentListData,
  "filterOptions" | "filters" | "query"
>;

export function StudentFilterForm({
  filterOptions,
  filters,
  query,
}: StudentFilterFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const search = cleanValue(formData.get("q"));
    const status = cleanValue(formData.get("status"));
    const payment = cleanValue(formData.get("payment"));
    const program = cleanValue(formData.get("program"));
    const teacher = cleanValue(formData.get("teacher"));

    if (search) {
      params.set("q", search);
    }

    if (status) {
      params.set("status", status);
    }

    if (payment && payment !== "all") {
      params.set("payment", payment);
    }

    if (program) {
      params.set("program", program);
    }

    if (teacher) {
      params.set("teacher", teacher);
    }

    const nextUrl = (params.size > 0 ? `/students?${params.toString()}` : "/students") as Route;
    startTransition(() => router.push(nextUrl));
  }

  return (
    <form className="table-toolbar crm-filter-toolbar" action="/students" onSubmit={handleSubmit}>
      <label className="table-search">
        <Search size={16} />
        <span className="sr-only">Tələbə axtar</span>
        <input
          name="q"
          placeholder="Ad, telefon və ya ART kodu üzrə axtar"
          defaultValue={query}
        />
      </label>
      <div className="crm-filter-grid student-filter-grid">
        <label>
          <span>Status</span>
          <FormSelect
            name="status"
            defaultValue={filters.status}
            emptyLabel="Bütün statuslar"
            options={filterOptions.statuses}
          />
        </label>
        <label>
          <span>Ödəniş</span>
          <FormSelect
            name="payment"
            defaultValue={filters.payment}
            options={filterOptions.payments}
          />
        </label>
        <label>
          <span>Proqram</span>
          <FormSelect
            name="program"
            defaultValue={filters.program}
            emptyLabel="Bütün proqramlar"
            options={filterOptions.programs}
          />
        </label>
        <label>
          <span>Müəllim</span>
          <FormSelect
            name="teacher"
            defaultValue={filters.teacher}
            emptyLabel="Bütün müəllimlər"
            options={filterOptions.teachers}
          />
        </label>
      </div>
      <div className="toolbar-actions">
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          <Filter data-icon="inline-start" />
          Axtar
        </Button>
        <Link className="ui-button ui-button-ghost ui-button-sm" href={"/students" as Route}>
          <X data-icon="inline-start" />
          Təmizlə
        </Link>
      </div>
    </form>
  );
}

function cleanValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== EMPTY_SELECT_VALUE ? trimmed : "";
}
