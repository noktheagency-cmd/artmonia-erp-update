"use client";

import { FormEvent, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search, X, Calendar, CalendarDays, Clock, Activity, BookOpen, Users, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(filters.dateFrom);
  const [dateTo, setDateTo] = useState(filters.dateTo);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const search = cleanValue(formData.get("q"));
    const status = cleanValue(formData.get("status"));
    const payment = cleanValue(formData.get("payment"));
    const program = cleanValue(formData.get("program"));
    const teacher = cleanValue(formData.get("teacher"));
    const from = cleanValue(formData.get("from"));
    const to = cleanValue(formData.get("to"));

    // Preserve the current tab
    const currentTab = searchParams.get("tab");
    if (currentTab) {
      params.set("tab", currentTab);
    }

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

    if (from) {
      params.set("from", from);
    }

    if (to) {
      params.set("to", to);
    }

    const nextUrl = (params.size > 0 ? `/students?${params.toString()}` : "/students") as Route;
    startTransition(() => router.push(nextUrl));
  }

  function handleClear() {
    const params = new URLSearchParams();
    const currentTab = searchParams.get("tab");
    if (currentTab) {
      params.set("tab", currentTab);
    }
    const nextUrl = (params.size > 0 ? `/students?${params.toString()}` : "/students") as Route;
    router.push(nextUrl);
  }

  // Helper to dynamically set date picker inputs
  function setQuickDateRange(periodType: "today" | "month" | "thirty") {
    // Use local time zones to construct exact date strings
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (periodType === "today") {
      const todayStr = formatDate(today);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (periodType === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateFrom(formatDate(firstDay));
      setDateTo(formatDate(lastDay));
    } else if (periodType === "thirty") {
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateFrom(formatDate(thirtyDaysAgo));
      setDateTo(formatDate(today));
    }
  }

  return (
    <form className="student-unified-filter-panel-inner student-unified-filter-panel" onSubmit={handleSubmit}>
      {/* Inputs Row */}
      <div className="filter-main-row">
        {/* Search Bar */}
        <div className="search-input-wrapper" style={{ flex: "1.5", minWidth: "220px" }}>
          <Search size={18} className="search-icon" />
          <input
            name="q"
            placeholder="Tələbə, kateqoriya..."
            defaultValue={query}
            className="filter-search-input"
          />
        </div>

        {/* Date From */}
        <DatePicker
          name="from"
          value={dateFrom}
          onValueChange={setDateFrom}
          placeholder="Başlanğıc"
          aria-label="Başlanğıc tarixi"
        />

        {/* Date To */}
        <DatePicker
          name="to"
          value={dateTo}
          onValueChange={setDateTo}
          placeholder="Son tarix"
          aria-label="Son tarix"
        />
        {/* Actions Button */}
        <div className="filter-actions-group" style={{ marginTop: 0 }}>
          <Button type="submit" variant="default" size="sm" className="crm-search-submit-btn" disabled={isPending}>
            <Filter size={16} />
            Göstər
          </Button>
          
          <button type="button" onClick={handleClear} className="advanced-toggle-btn">
            Təmizlə
          </button>
        </div>
      </div>

      {/* Quick Period Buttons & Selects Row */}
      <div className="period-quick-row">
        <button
          type="button"
          onClick={() => setQuickDateRange("today")}
          className="period-quick-btn"
        >
          <Calendar size={13} className="text-tone-primary" />
          <span>Bugün</span>
        </button>
        <button
          type="button"
          onClick={() => setQuickDateRange("month")}
          className="period-quick-btn"
        >
          <CalendarDays size={13} className="text-tone-success" />
          <span>Bu ay</span>
        </button>
        <button
          type="button"
          onClick={() => setQuickDateRange("thirty")}
          className="period-quick-btn"
        >
          <Clock size={13} className="text-tone-warning" />
          <span>Son 30 gün</span>
        </button>
        
        {/* Selects Grid with Icons */}
        <div className="quick-selects-grid">
          <FormSelect
            name="status"
            defaultValue={filters.status}
            emptyLabel="Bütün statuslar"
            options={filterOptions.statuses}
            icon={Activity}
          />

          <FormSelect
            name="program"
            defaultValue={filters.program}
            emptyLabel="Bütün proqramlar"
            options={filterOptions.programs}
            icon={BookOpen}
          />

          <FormSelect
            name="teacher"
            defaultValue={filters.teacher}
            emptyLabel="Bütün müəllimlər"
            options={filterOptions.teachers}
            icon={Users}
          />

          <FormSelect
            name="payment"
            defaultValue={filters.payment}
            options={filterOptions.payments}
            icon={CreditCard}
          />
        </div>
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
