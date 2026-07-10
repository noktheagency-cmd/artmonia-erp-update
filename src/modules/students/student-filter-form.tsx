"use client";

import { useState, useTransition, type FormEvent } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BookOpen,
  Calendar,
  CalendarDays,
  Clock3,
  CreditCard,
  Filter,
  Search,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldGroup } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";
import type { StudentListData } from "@/modules/students/queries";

type StudentFilterFormProps = Pick<StudentListData, "filterOptions" | "filters" | "query">;
type QuickPeriod = "today" | "month" | "thirty";

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

  function setQuickDateRange(period: QuickPeriod) {
    const today = new Date();

    if (period === "today") {
      const value = formatDate(today);
      setDateFrom(value);
      setDateTo(value);
      return;
    }

    if (period === "month") {
      setDateFrom(formatDate(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
      return;
    }

    setDateFrom(formatDate(new Date(today.getTime() - 29 * 86_400_000)));
    setDateTo(formatDate(today));
  }

  const activePeriod = getActivePeriod(dateFrom, dateTo);

  return (
    <form className="students-filter-form" onSubmit={handleSubmit} aria-label="Tələbə filtrləri">
      <FieldGroup className="students-filter-primary">
        <Field className="students-search-field">
          <InputGroup>
            <InputGroupAddon aria-hidden="true"><Search /></InputGroupAddon>
            <InputGroupInput
              name="q"
              placeholder="Tələbə, kod və ya telefon..."
              defaultValue={query}
              aria-label="Tələbə axtar"
            />
          </InputGroup>
        </Field>
        <Field className="students-date-field">
          <DatePicker
            name="from"
            value={dateFrom}
            onValueChange={setDateFrom}
            placeholder="Başlanğıc"
            aria-label="Başlanğıc tarixi"
          />
        </Field>
        <Field className="students-date-field">
          <DatePicker
            name="to"
            value={dateTo}
            onValueChange={setDateTo}
            placeholder="Son tarix"
            aria-label="Son tarix"
          />
        </Field>
        <Button type="submit" size="sm" disabled={isPending}>
          <Filter data-icon="inline-start" />
          {isPending ? "Göstərilir..." : "Göstər"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleClear}>
          <X data-icon="inline-start" />
          Təmizlə
        </Button>
      </FieldGroup>

      <div className="students-filter-secondary">
        <div className="students-period-group" aria-label="Sürətli tarix aralığı">
          <QuickPeriodButton
            active={activePeriod === "today"}
            icon={Calendar}
            label="Bugün"
            onClick={() => setQuickDateRange("today")}
          />
          <QuickPeriodButton
            active={activePeriod === "month"}
            icon={CalendarDays}
            label="Bu ay"
            onClick={() => setQuickDateRange("month")}
          />
          <QuickPeriodButton
            active={activePeriod === "thirty"}
            icon={Clock3}
            label="Son 30 gün"
            onClick={() => setQuickDateRange("thirty")}
          />
        </div>

        <FieldGroup className="students-filter-selects">
          <Field>
            <FormSelect
              name="status"
              defaultValue={filters.status}
              emptyLabel="Bütün statuslar"
              options={filterOptions.statuses}
              icon={Activity}
            />
          </Field>
          <Field>
            <FormSelect
              name="program"
              defaultValue={filters.program}
              emptyLabel="Bütün proqramlar"
              options={filterOptions.programs}
              icon={BookOpen}
            />
          </Field>
          <Field>
            <FormSelect
              name="teacher"
              defaultValue={filters.teacher}
              emptyLabel="Bütün müəllimlər"
              options={filterOptions.teachers}
              icon={Users}
            />
          </Field>
          <Field>
            <FormSelect
              name="payment"
              defaultValue={filters.payment}
              options={filterOptions.payments}
              icon={CreditCard}
            />
          </Field>
        </FieldGroup>
      </div>
    </form>
  );
}

function QuickPeriodButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Calendar;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="students-period-button"
      data-active={active}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon data-icon="inline-start" />
      {label}
    </Button>
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

function formatDate(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function getActivePeriod(dateFrom: string, dateTo: string): QuickPeriod | null {
  const today = new Date();
  const todayValue = formatDate(today);
  if (dateFrom === todayValue && dateTo === todayValue) return "today";

  const monthStart = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEnd = formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  if (dateFrom === monthStart && dateTo === monthEnd) return "month";

  const thirtyStart = formatDate(new Date(today.getTime() - 29 * 86_400_000));
  if (dateFrom === thirtyStart && dateTo === todayValue) return "thirty";
  return null;
}
