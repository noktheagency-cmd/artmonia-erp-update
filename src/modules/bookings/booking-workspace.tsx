"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BarChart3,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  History,
  List,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";

type AttendanceStatus = "reserved" | "attended" | "absent";
type BookingView = "schedule" | "list" | "journal";
type BookingStatusFilter = "all" | AttendanceStatus;

type StudentOption = {
  id: string;
  name: string;
  code: string;
  program: string;
  teacher: string;
};

type BookingDay = {
  id: string;
  label: string;
  shortLabel: string;
  dateLabel: string;
};

type Booking = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  program: string;
  teacher: string;
  room: string;
  date: string;
  dayId: string;
  time: string;
  duration: string;
  note: string;
  status: AttendanceStatus;
  createdAt: string;
};

type HistoryEvent = {
  id: string;
  kind: "created" | "attended" | "absent" | "updated";
  title: string;
  description: string;
  time: string;
};

type DraftState = {
  studentId: string;
  date: string;
  dayId: string;
  time: string;
  duration: string;
  room: string;
  note: string;
};

type BookingFilters = {
  query: string;
  dateFrom: string;
  dateTo: string;
  status: BookingStatusFilter;
  room: string;
};

type StoredWorkspace = {
  bookings: Booking[];
  history: HistoryEvent[];
  selectedBookingId?: string;
};

const storageKey = "artmonia-booking-workspace-v1";

const students: StudentOption[] = [
  {
    id: "stu-001",
    name: "Aylin Həsənli",
    code: "ART-1042",
    program: "Rəsm əsasları",
    teacher: "Nigar M.",
  },
  {
    id: "stu-002",
    name: "Murad Əliyev",
    code: "ART-1057",
    program: "Digital Art",
    teacher: "Rauf S.",
  },
  {
    id: "stu-003",
    name: "Leyla Məmmədova",
    code: "ART-1061",
    program: "Akademik rəsm",
    teacher: "Aysel H.",
  },
  {
    id: "stu-004",
    name: "Tunar Qasımov",
    code: "ART-1070",
    program: "Heykəltəraşlıq",
    teacher: "Kamal B.",
  },
  {
    id: "stu-005",
    name: "Zəhra Nuriyeva",
    code: "ART-1084",
    program: "İllüstrasiya",
    teacher: "Nigar M.",
  },
  {
    id: "stu-006",
    name: "Səid Rzayev",
    code: "ART-1092",
    program: "Portret",
    teacher: "Rauf S.",
  },
];

const days: BookingDay[] = [
  { id: "mon", label: "Bazar ertəsi", shortLabel: "B.e", dateLabel: "Plan" },
  { id: "tue", label: "Çərşənbə axşamı", shortLabel: "Ç.a", dateLabel: "Plan" },
  { id: "wed", label: "Çərşənbə", shortLabel: "Ç", dateLabel: "Plan" },
  { id: "thu", label: "Cümə axşamı", shortLabel: "C.a", dateLabel: "Plan" },
  { id: "fri", label: "Cümə", shortLabel: "C", dateLabel: "Plan" },
  { id: "sat", label: "Şənbə", shortLabel: "Ş", dateLabel: "Studio" },
];

const dayOrder = new Map(days.map((day, index) => [day.id, index]));

const timeSlots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];
const roomOptions = ["A Studio", "B Studio", "Digital otaq", "Portret zalı", "Workshop"];
const durationOptions = ["60 dəq", "90 dəq", "120 dəq"];
const studentSelectOptions = students.map((student) => ({
  value: student.id,
  label: `${student.name} - ${student.code}`,
}));
const durationSelectOptions = durationOptions.map((duration) => ({
  value: duration,
  label: duration,
}));
const roomSelectOptions = roomOptions.map((room) => ({ value: room, label: room }));
const roomFilterOptions = [
  { value: "all", label: "Bütün otaqlar" },
  ...roomSelectOptions,
];
const statusFilterOptions: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "Bütün statuslar" },
  { value: "reserved", label: "Bron" },
  { value: "attended", label: "Gəldi" },
  { value: "absent", label: "Gəlmədi" },
];

const initialDraft: DraftState = {
  studentId: students[0]?.id ?? "",
  date: getDateForDayId("mon"),
  dayId: "mon",
  time: "10:00",
  duration: "90 dəq",
  room: "A Studio",
  note: "",
};

const initialFilters: BookingFilters = {
  query: "",
  dateFrom: "",
  dateTo: "",
  status: "all",
  room: "all",
};

const statusMeta: Record<
  AttendanceStatus,
  {
    label: string;
    className: string;
    tone: "success" | "warning" | "danger" | "neutral" | "info";
    icon: LucideIcon;
  }
> = {
  reserved: { label: "Bron", className: "is-reserved", tone: "info", icon: Clock3 },
  attended: { label: "Gəldi", className: "is-attended", tone: "success", icon: CheckCircle2 },
  absent: { label: "Gəlmədi", className: "is-absent", tone: "danger", icon: XCircle },
};

const initialBookings: Booking[] = [
  createSeedBooking({
    id: "booking-seed-1",
    student: students[0],
    dayId: "mon",
    time: "10:00",
    room: "A Studio",
    status: "attended",
  }),
  createSeedBooking({
    id: "booking-seed-2",
    student: students[2],
    dayId: "mon",
    time: "13:00",
    room: "Portret zalı",
    status: "reserved",
  }),
  createSeedBooking({
    id: "booking-seed-3",
    student: students[1],
    dayId: "tue",
    time: "16:00",
    room: "Digital otaq",
    status: "absent",
  }),
  createSeedBooking({
    id: "booking-seed-4",
    student: students[4],
    dayId: "wed",
    time: "11:30",
    room: "B Studio",
    status: "reserved",
  }),
  createSeedBooking({
    id: "booking-seed-5",
    student: students[3],
    dayId: "fri",
    time: "17:30",
    room: "Workshop",
    status: "reserved",
  }),
];

const initialHistory: HistoryEvent[] = [
  {
    id: "history-seed-1",
    kind: "attended",
    title: "Aylin Həsənli jurnalda Gəldi edildi",
    description: "Bazar ertəsi, 10:00 dərsi tamamlandı.",
    time: "09:58",
  },
  {
    id: "history-seed-2",
    kind: "absent",
    title: "Murad Əliyev üçün Gəlmədi qeyd olundu",
    description: "Çərşənbə axşamı, 16:00 bronu jurnal statusu dəyişdi.",
    time: "Dünən",
  },
  {
    id: "history-seed-3",
    kind: "created",
    title: "Zəhra Nuriyeva üçün bron yaradıldı",
    description: "Çərşənbə, 11:30 - B Studio.",
    time: "Dünən",
  },
];

export function BookingWorkspace() {
  const nextIdRef = useRef(initialBookings.length + initialHistory.length + 1);
  const canPersistRef = useRef(false);
  const [bookings, setBookings] = useState(initialBookings);
  const [history, setHistory] = useState(initialHistory);
  const [draft, setDraft] = useState<DraftState>(initialDraft);
  const [selectedDayId, setSelectedDayId] = useState("mon");
  const [selectedDate, setSelectedDate] = useState(getDateForDayId("mon"));
  const [selectedBookingId, setSelectedBookingId] = useState(initialBookings[0]?.id ?? "");
  const [notice, setNotice] = useState("Günlük bron rejimi aktivdir.");
  const [activeView, setActiveView] = useState<BookingView>("schedule");
  const [filters, setFilters] = useState<BookingFilters>(initialFilters);
  const [reservationOpen, setReservationOpen] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedWorkspace = readStoredWorkspace();
      const firstBooking = storedWorkspace.bookings[0];

      setBookings(storedWorkspace.bookings);
      setHistory(storedWorkspace.history);
      setSelectedBookingId(storedWorkspace.selectedBookingId ?? firstBooking?.id ?? "");
      setSelectedDayId(firstBooking?.dayId ?? "mon");
      setSelectedDate(firstBooking?.date ?? getDateForDayId(firstBooking?.dayId ?? "mon"));
      setDraft((current) => ({
        ...current,
        date: firstBooking?.date ?? current.date,
        dayId: firstBooking?.dayId ?? current.dayId,
      }));
      nextIdRef.current =
        storedWorkspace.bookings.length + storedWorkspace.history.length + 1;
      canPersistRef.current = true;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!canPersistRef.current) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ bookings, history, selectedBookingId })
    );
  }, [bookings, history, selectedBookingId]);

  const bookingBySlot = useMemo(() => {
    return new Map(bookings.map((booking) => [slotKey(booking.date, booking.time), booking]));
  }, [bookings]);

  const selectedDayBookings = useMemo(() => {
    return bookings
      .filter((booking) => booking.date === selectedDate)
      .sort(compareBookingsBySlot);
  }, [bookings, selectedDate]);

  const filteredBookings = useMemo(() => {
    const hasDateRange = filters.dateFrom || filters.dateTo;

    return bookings
      .filter((booking) =>
        hasDateRange ? matchesBookingDateRange(booking, filters) : booking.date === selectedDate
      )
      .filter((booking) => matchesBookingFilters(booking, filters))
      .sort(compareBookingsBySlot);
  }, [bookings, filters, selectedDate]);

  const selectedDay = getDay(selectedDayId);
  const selectedDayCapacity = timeSlots.length;
  const selectedDayUtilization = Math.round((selectedDayBookings.length / selectedDayCapacity) * 100);
  const activeFiltersCount = countActiveFilters(filters);

  const stats = useMemo(() => {
    const attended = bookings.filter((booking) => booking.status === "attended").length;
    const absent = bookings.filter((booking) => booking.status === "absent").length;
    const reserved = bookings.filter((booking) => booking.status === "reserved").length;
    const utilization = Math.round((bookings.length / (days.length * timeSlots.length)) * 100);
    const attendanceBase = attended + absent;
    const attendanceRate =
      attendanceBase > 0 ? Math.round((attended / attendanceBase) * 100) : 100;
    const activeRooms = new Set(bookings.map((booking) => booking.room)).size;

    return { attended, absent, reserved, utilization, attendanceRate, activeRooms };
  }, [bookings]);

  function updateDraft(key: keyof DraftState, value: string) {
    if (key === "date") {
      const nextDayId = getDayIdFromDate(value);

      setDraft((current) => ({ ...current, date: value, dayId: nextDayId }));
      return;
    }

    setDraft((current) => ({ ...current, [key]: value }));

    if (key === "dayId") {
      setSelectedDayId(value);
    }
  }

  function updateFilter(key: keyof BookingFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value } as BookingFilters));
  }

  function selectDate(date: string) {
    if (!date) {
      return;
    }

    const nextDayId = getDayIdFromDate(date);

    setSelectedDate(date);
    setSelectedDayId(nextDayId);
    setDraft((current) => ({ ...current, date, dayId: nextDayId }));
    setActiveView("schedule");
    setNotice(`${formatDateDisplay(date)} üçün canlı saatlar göstərilir.`);
  }

  function clearFilters() {
    setFilters(initialFilters);
    setActiveView("schedule");
    setNotice("Bron filtrləri sıfırlandı.");
  }

  function clearFilter(key: keyof BookingFilters) {
    setFilters((current) => ({
      ...current,
      [key]: key === "query" || key === "dateFrom" || key === "dateTo" ? "" : "all",
    } as BookingFilters));
  }

  function updateDateFilter(key: "dateFrom" | "dateTo", value: string) {
    updateFilter(key, value);

    if (key === "dateFrom" && value) {
      selectDate(value);
    }
  }

  function setQuickDateRange(periodType: "today" | "month" | "thirty") {
    const today = new Date();
    const todayValue = toIsoDate(today);

    if (periodType === "today") {
      setFilters((current) => ({ ...current, dateFrom: todayValue, dateTo: todayValue }));
      selectDate(todayValue);
      return;
    }

    if (periodType === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setFilters((current) => ({
        ...current,
        dateFrom: toIsoDate(firstDay),
        dateTo: toIsoDate(lastDay),
      }));
      selectDate(todayValue);
      return;
    }

    const thirtyDaysAgo = addDays(today, -30);
    setFilters((current) => ({
      ...current,
      dateFrom: toIsoDate(thirtyDaysAgo),
      dateTo: todayValue,
    }));
    selectDate(todayValue);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveView(activeFiltersCount > 0 ? "list" : "schedule");
    setNotice(
      activeFiltersCount > 0
        ? `${filteredBookings.length} bron filtrə uyğun göstərilir.`
        : `${selectedDay.label} üçün saatlar göstərilir.`
    );
  }

  function openReservationDialog(overrides: Partial<Pick<DraftState, "date" | "dayId" | "time">> = {}) {
    const nextDate = overrides.date ?? selectedDate;
    const nextDayId = overrides.dayId ?? getDayIdFromDate(nextDate);
    const nextTime =
      overrides.time ?? getFirstAvailableTime(nextDate, draft.time) ?? timeSlots[0];

    setDraft((current) => ({
      ...current,
      date: nextDate,
      dayId: nextDayId,
      time: nextTime,
    }));
    setSelectedDayId(nextDayId);
    setSelectedDate(nextDate);
    setReservationOpen(true);
  }

  function addHistory(event: Omit<HistoryEvent, "id" | "time">) {
    setHistory((current) => [
      {
        ...event,
        id: getNextId("history"),
        time: new Intl.DateTimeFormat("az-AZ", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      },
      ...current,
    ].slice(0, 16));
  }

  function createBooking() {
    const selectedStudent = students.find((student) => student.id === draft.studentId);

    if (!selectedStudent) {
      setNotice("Bron üçün tələbə seçin.");
      return;
    }

    const existing = bookingBySlot.get(slotKey(draft.date, draft.time));

    if (existing) {
      setSelectedBookingId(existing.id);
      setNotice(`${formatDateDisplay(draft.date)} ${draft.time} artıq bron olunub.`);
      return;
    }

    const nextBooking: Booking = {
      id: getNextId("booking"),
      studentId: selectedStudent.id,
      studentName: selectedStudent.name,
      studentCode: selectedStudent.code,
      program: selectedStudent.program,
      teacher: selectedStudent.teacher,
      room: draft.room,
      date: draft.date,
      dayId: draft.dayId,
      time: draft.time,
      duration: draft.duration,
      note: draft.note.trim(),
      status: "reserved",
      createdAt: new Date().toISOString(),
    };

    setBookings((current) => [nextBooking, ...current]);
    setSelectedBookingId(nextBooking.id);
    setSelectedDayId(nextBooking.dayId);
    setSelectedDate(nextBooking.date);
    setFilters(initialFilters);
    setActiveView("schedule");
    setReservationOpen(false);
    setNotice(`${selectedStudent.name} üçün ${formatDateDisplay(nextBooking.date)} ${nextBooking.time} bron edildi.`);
    addHistory({
      kind: "created",
      title: `${selectedStudent.name} üçün bron yaradıldı`,
      description: `${formatDateDisplay(nextBooking.date)}, ${nextBooking.time} - ${draft.room}.`,
    });
  }

  function handleSlotClick(dayId: string, time: string) {
    const booking = bookingBySlot.get(slotKey(selectedDate, time));

    if (booking) {
      setSelectedBookingId(booking.id);
      setNotice(`${booking.studentName} bronu: ${formatDateDisplay(booking.date)} ${time}, ${booking.room}.`);
      return;
    }

    openReservationDialog({ date: selectedDate, dayId, time });
  }

  function handleMetricClick(status: BookingStatusFilter) {
    setFilters((current) => ({ ...current, status }));
    setActiveView(status === "all" ? "schedule" : "list");
    setNotice(status === "all" ? "Günlük saatlar göstərilir." : `${getStatusLabel(status)} bronları süzgəcdədir.`);
  }

  function markAttendance(bookingId: string, status: Exclude<AttendanceStatus, "reserved">) {
    const target = bookings.find((booking) => booking.id === bookingId);

    if (!target) {
      return;
    }

    setBookings((current) =>
      current.map((booking) =>
        booking.id === bookingId ? { ...booking, status } : booking
      )
    );
    setSelectedBookingId(bookingId);
    setNotice(`${target.studentName} jurnalda "${statusMeta[status].label}" edildi.`);
    addHistory({
      kind: status,
      title: `${target.studentName} jurnalda ${statusMeta[status].label} edildi`,
      description: `${formatDateDisplay(target.date)}, ${target.time} bron statusu yeniləndi.`,
    });
  }

  function resetWorkspace() {
    setBookings(initialBookings);
    setHistory(initialHistory);
    setSelectedBookingId(initialBookings[0]?.id ?? "");
    setSelectedDayId("mon");
    setSelectedDate(getDateForDayId("mon"));
    setDraft(initialDraft);
    setFilters(initialFilters);
    setActiveView("schedule");
    setReservationOpen(false);
    setNotice("Demo bronlar bərpa olundu.");
    window.localStorage.removeItem(storageKey);
  }

  function getNextId(prefix: string) {
    const nextId = `${prefix}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return nextId;
  }

  function getFirstAvailableTime(date: string, preferredTime?: string) {
    if (preferredTime && !bookingBySlot.has(slotKey(date, preferredTime))) {
      return preferredTime;
    }

    return timeSlots.find((time) => !bookingBySlot.has(slotKey(date, time)));
  }

  return (
    <section className="page-stack operational-page booking-redesign-page booking-day-redesign-page">
      <div className="crm-unified-filter-panel booking-command-panel booking-day-command-panel">
        <div className="student-header-compact booking-header-compact" style={{ marginBottom: 0 }}>
          <div className="header-title-wrapper-compact">
            <div className="crm-eyebrow-compact">
              <span className="eyebrow-pill pill-primary">Artmonia ERP</span>
              <span className="eyebrow-pill pill-date">Günlük bron</span>
            </div>
            <div className="title-row-compact">
              <h1>Bronlar və Dərs Jurnalı</h1>
            </div>
            <p className="crm-header-desc" style={{ marginBottom: 0 }}>
              Seçilmiş günün saatları, doluluğu və rezerv statusları.
            </p>
          </div>

          <div className="header-actions-wrapper-compact">
            <div className="financial-summary-badge-compact booking-summary-badge-compact">
              <Sparkles size={14} className="text-tone-success" />
              <span className="label-text">Canlı status:</span>
              <strong className="value-text">{notice}</strong>
            </div>
            <Button type="button" variant="default" size="sm" onClick={() => openReservationDialog()}>
              <Plus size={15} />
              Bron yarat
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetWorkspace}>
              <RefreshCw size={15} />
              Sıfırla
            </Button>
          </div>
        </div>

        <div className="filter-header-divider" />

        <form className="student-unified-filter-panel-inner booking-filter-panel" onSubmit={applyFilters}>
          <div className="filter-main-row booking-day-filter-row">
            <div className="search-input-wrapper booking-search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                name="q"
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                onInput={(event) => updateFilter("query", event.currentTarget.value)}
                placeholder="Tələbə, kod, müəllim, otaq..."
                className="filter-search-input"
              />
              {filters.query && (
                <button
                  type="button"
                  className="clear-search-btn"
                  aria-label="Axtarışı təmizlə"
                  onClick={() => clearFilter("query")}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <DatePicker
              name="from"
              value={filters.dateFrom}
              onValueChange={(nextValue) => updateDateFilter("dateFrom", nextValue)}
              placeholder="Başlanğıc"
              aria-label="Başlanğıc tarixi"
              className="booking-date-input-container"
            />

            <DatePicker
              name="to"
              value={filters.dateTo}
              onValueChange={(nextValue) => updateDateFilter("dateTo", nextValue)}
              placeholder="Son tarix"
              aria-label="Son tarix"
              className="booking-date-input-container"
            />

            <label className="booking-filter-select">
              <span>Status</span>
              <FormSelect
                name="status"
                value={filters.status}
                onValueChange={(value) => updateFilter("status", value as BookingStatusFilter)}
                options={statusFilterOptions}
                icon={CheckCircle2}
                className="booking-filter-trigger"
                contentClassName="booking-select-content"
                aria-label="Status seç"
              />
            </label>

            <label className="booking-filter-select">
              <span>Otaq</span>
              <FormSelect
                name="room"
                value={filters.room}
                onValueChange={(value) => updateFilter("room", value)}
                options={roomFilterOptions}
                icon={MapPin}
                className="booking-filter-trigger"
                contentClassName="booking-select-content"
                aria-label="Otaq seç"
              />
            </label>

            <div className="filter-actions-group" style={{ marginTop: 0 }}>
              <Button type="submit" variant="default" size="sm" className="crm-search-submit-btn">
                <Filter size={16} />
                Göstər
              </Button>
              <button type="button" onClick={clearFilters} className="advanced-toggle-btn">
                Təmizlə
              </button>
            </div>
          </div>

          <div className="period-quick-row booking-period-quick-row">
            <button type="button" onClick={() => setQuickDateRange("today")} className="period-quick-btn">
              <Calendar size={13} className="text-tone-primary" />
              <span>Bugün</span>
            </button>
            <button type="button" onClick={() => setQuickDateRange("month")} className="period-quick-btn">
              <CalendarDays size={13} className="text-tone-success" />
              <span>Bu ay</span>
            </button>
            <button type="button" onClick={() => setQuickDateRange("thirty")} className="period-quick-btn">
              <Clock3 size={13} className="text-tone-warning" />
              <span>Son 30 gün</span>
            </button>
          </div>
        </form>
      </div>

      <div className="metrics-grid-premium booking-metrics-premium" aria-label="Bron statistika kartları">
        <MetricSummaryCard
          label="Cəmi bronlar"
          value={bookings.length.toString()}
          delta={`${stats.utilization}% həftəlik`}
          tone="blue"
          icon={CalendarDays}
          onClick={() => handleMetricClick("all")}
        />
        <MetricSummaryCard
          label="Seçilmiş gün"
          value={selectedDayBookings.length.toString()}
          delta={`${selectedDayUtilization}% dolu`}
          tone={selectedDayUtilization > 65 ? "coral" : selectedDayUtilization > 30 ? "yellow" : "mint"}
          icon={Clock3}
          onClick={() => setActiveView("schedule")}
        />
        <MetricSummaryCard
          label="Gəldi"
          value={stats.attended.toString()}
          delta={`${stats.attendanceRate}% iştirak`}
          tone="mint"
          icon={CheckCircle2}
          onClick={() => handleMetricClick("attended")}
        />
        <MetricSummaryCard
          label="Gözləyir"
          value={stats.reserved.toString()}
          delta="Bron statusunda"
          tone="yellow"
          icon={Clock3}
          onClick={() => handleMetricClick("reserved")}
        />
        <MetricSummaryCard
          label="Gəlmədi"
          value={stats.absent.toString()}
          delta="Jurnal riski"
          tone="coral"
          icon={XCircle}
          onClick={() => handleMetricClick("absent")}
        />
      </div>

      <div className="crm-tabs-navigation student-tabs-navigation booking-tabs-navigation">
        <div className="tabs-segmented-container">
          <button
            type="button"
            onClick={() => setActiveView("schedule")}
            className={cx("tab-segmented-item", activeView === "schedule" && "is-active")}
          >
            <CalendarDays size={15} />
            <span>Günlük saatlar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("list")}
            className={cx("tab-segmented-item", activeView === "list" && "is-active")}
          >
            <List size={15} />
            <span>Bron siyahısı</span>
            <span className="tab-segmented-badge">{filteredBookings.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("journal")}
            className={cx("tab-segmented-item", activeView === "journal" && "is-active")}
          >
            <History size={15} />
            <span>Jurnal</span>
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <button type="button" onClick={clearFilters} className="crm-reset-filters-btn">
            <SlidersHorizontal size={14} />
            <span>Filtrləri sıfırla ({activeFiltersCount})</span>
          </button>
        )}
      </div>

      {activeFiltersCount > 0 && (
        <div className="crm-active-chips-wrapper booking-active-chips" aria-label="Aktiv filtrlər">
          <span className="chips-title">Aktiv süzgəclər:</span>
          <div className="chips-container">
            <span>{filteredBookings.length} / {selectedDayBookings.length} bron</span>
            {filters.query && (
              <span className="filter-chip-item">
                Axtarış: {filters.query}
                <button type="button" onClick={() => clearFilter("query")}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filters.dateFrom && (
              <span className="filter-chip-item">
                Başlanğıc: {formatDateDisplay(filters.dateFrom)}
                <button type="button" onClick={() => clearFilter("dateFrom")}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filters.dateTo && (
              <span className="filter-chip-item">
                Son: {formatDateDisplay(filters.dateTo)}
                <button type="button" onClick={() => clearFilter("dateTo")}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filters.status !== "all" && (
              <span className="filter-chip-item">
                Status: {getStatusLabel(filters.status)}
                <button type="button" onClick={() => clearFilter("status")}>
                  <X size={12} />
                </button>
              </span>
            )}
            {filters.room !== "all" && (
              <span className="filter-chip-item">
                Otaq: {filters.room}
                <button type="button" onClick={() => clearFilter("room")}>
                  <X size={12} />
                </button>
              </span>
            )}
            <button type="button" onClick={clearFilters} className="clear-all-chips-btn">
              Hamısını təmizlə
            </button>
          </div>
        </div>
      )}

      {activeView === "schedule" && (
        <article className="booking-day-schedule-panel animate-fade-in">
          <div className="booking-day-schedule-head">
            <div>
              <h2>{selectedDay.label} saatları</h2>
              <p>
                Seçilmiş gün üçün canlı slotlar və doluluq vəziyyəti.
              </p>
            </div>
            <div className="booking-day-head-actions">
              <span className={cx("booking-density", getDensityClass(selectedDayUtilization))}>
                {selectedDayUtilization}% doluluq
              </span>
              <Button type="button" size="sm" onClick={() => openReservationDialog()}>
                <Plus size={15} />
                Bron yarat
              </Button>
            </div>
          </div>

          <div className="booking-selected-day-card">
            <div>
              <span>{selectedDay.shortLabel}</span>
              <strong>{selectedDay.label}</strong>
              <small>{formatDateDisplay(selectedDate)}</small>
            </div>
            <b className={cx("booking-density", getDensityClass(selectedDayUtilization))}>
              {selectedDayBookings.length} bron · {selectedDayUtilization}% dolu
            </b>
          </div>

          <div className="booking-day-summary-row">
            <div>
              <span className="dot dot-info" />
              <strong>{selectedDayCapacity - selectedDayBookings.length}</strong>
              <small>boş saat</small>
            </div>
            <div>
              <span className="dot dot-warning" />
              <strong>{selectedDayBookings.length}</strong>
              <small>rezerv</small>
            </div>
            <div>
              <span className="dot dot-success" />
              <strong>{selectedDayBookings.filter((booking) => booking.status === "attended").length}</strong>
              <small>gəldi</small>
            </div>
            <div>
              <span className="dot dot-danger" />
              <strong>{selectedDayBookings.filter((booking) => booking.status === "absent").length}</strong>
              <small>gəlmədi</small>
            </div>
          </div>

          <div className="booking-day-slots-grid">
            {timeSlots.map((time) => {
              const booking = bookingBySlot.get(slotKey(selectedDate, time));
              const StatusIcon = booking ? statusMeta[booking.status].icon : Plus;

              return (
                <button
                  key={`${selectedDate}-${time}`}
                  type="button"
                  className={cx(
                    "booking-day-slot-card",
                    booking ? statusMeta[booking.status].className : "is-free",
                    selectedBookingId === booking?.id && "is-selected"
                  )}
                  onClick={() => handleSlotClick(selectedDayId, time)}
                  aria-label={booking ? `${booking.studentName} bronu` : `${selectedDay.label} ${time} boş slot`}
                >
                  <span className="booking-slot-status-icon">
                    <StatusIcon size={16} />
                  </span>
                  <span className="booking-day-slot-time">{time}</span>
                  <strong>{booking ? booking.studentName : "Boş saat"}</strong>
                  <small>{booking ? `${booking.room} · ${statusMeta[booking.status].label}` : "Müsait"}</small>
                </button>
              );
            })}
          </div>
        </article>
      )}

      {activeView === "list" && (
        <article className="panel table-panel crm-table-panel-redesign booking-table-panel-redesign animate-fade-in">
          <div className="table-panel-header-new">
            <h2>Bron məlumatları və slot ledger-i</h2>
            <span className="table-count-indicator">{filteredBookings.length} / {selectedDayBookings.length} bron</span>
          </div>

          <div className="data-table-wrap-redesign">
            <table className="data-table-redesign booking-table-redesign">
              <thead>
                <tr>
                  <th>Tələbə</th>
                  <th>Gün / Saat</th>
                  <th>Proqram</th>
                  <th>Müəllim</th>
                  <th>Otaq</th>
                  <th>Status</th>
                  <th>Qeyd</th>
                  <th>Jurnal</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map((booking) => (
                    <tr key={booking.id} className="table-row-interactive">
                      <td>
                        <button
                          type="button"
                          className="booking-open-row-button"
                          onClick={() => {
                            setSelectedBookingId(booking.id);
                            selectDate(booking.date);
                          }}
                        >
                          <strong>{booking.studentName}</strong>
                          <span>{booking.studentCode} · {booking.room}</span>
                        </button>
                      </td>
                      <td>
                        <div className="student-date-cell booking-table-time">
                          <CalendarDays size={12} className="date-calendar-icon" />
                          <span>{formatDateDisplay(booking.date)} / {booking.time}</span>
                        </div>
                      </td>
                      <td>
                        <div className="student-program-cell">
                          <strong>{booking.program}</strong>
                        </div>
                      </td>
                      <td>
                        <div className="student-teacher-cell">
                          <UserRound size={12} className="teacher-avatar-icon" />
                          <span>{booking.teacher}</span>
                        </div>
                      </td>
                      <td>
                        <span className="booking-room-tag">{booking.room}</span>
                      </td>
                      <td>
                        <StatusChip tone={statusMeta[booking.status].tone}>
                          {statusMeta[booking.status].label}
                        </StatusChip>
                      </td>
                      <td>
                        <span className="booking-note-preview">{booking.note || "Qeyd yoxdur"}</span>
                      </td>
                      <td>
                        <div className="booking-row-actions">
                          <button
                            className={cx(booking.status === "attended" && "is-active")}
                            type="button"
                            onClick={() => markAttendance(booking.id, "attended")}
                          >
                            Gəldi
                          </button>
                          <button
                            className={cx("is-absent-action", booking.status === "absent" && "is-active")}
                            type="button"
                            onClick={() => markAttendance(booking.id, "absent")}
                          >
                            Gəlmədi
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state-redesign">
                        <CalendarCheck size={40} className="empty-icon" />
                        <h3>Bron tapılmadı</h3>
                        <p>Seçilmiş filtrlərə uyğun bron yoxdur. Süzgəcləri dəyişərək yenidən yoxlayın.</p>
                        <button type="button" onClick={clearFilters} className="ui-button ui-button-secondary ui-button-sm">
                          Filtrləri təmizlə
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      )}

      {activeView === "journal" && (
        <div className="student-dashboard-details-grid booking-journal-dashboard booking-journal-dashboard-modern animate-fade-in">
          <div className="student-dashboard-column">
            <div className="shadcn-card">
              <div className="shadcn-card-header">
                <div className="shadcn-card-title-area">
                  <BarChart3 size={18} className="text-primary" />
                  <h3>Jurnal icmalı</h3>
                </div>
                <span className="shadcn-card-badge bg-primary-light">{stats.attendanceRate}% iştirak</span>
              </div>
              <div className="shadcn-card-content">
                <div className="booking-status-distribution">
                  <StatusLine label="Gəldi" value={stats.attended} total={bookings.length} tone="success" />
                  <StatusLine label="Bron" value={stats.reserved} total={bookings.length} tone="info" />
                  <StatusLine label="Gəlmədi" value={stats.absent} total={bookings.length} tone="danger" />
                </div>
              </div>
            </div>

            <article className="booking-journal-panel">
              <PanelTitle icon={CalendarCheck} title="Dərs jurnalı" subtitle="Filtrə uyğun iştirak statusları" />
              <div className="booking-journal-list">
                {filteredBookings.map((booking) => (
                  <div className="booking-journal-row" key={booking.id}>
                    <div className="booking-journal-person">
                      <div className="booking-mini-avatar">{getInitials(booking.studentName)}</div>
                      <div>
                        <strong>{booking.studentName}</strong>
                        <span>
                          {formatDateDisplay(booking.date)} - {booking.time} · {booking.room}
                        </span>
                      </div>
                    </div>
                    <div className="booking-journal-actions">
                      <button
                        className={cx(booking.status === "attended" && "is-active")}
                        type="button"
                        onClick={() => markAttendance(booking.id, "attended")}
                      >
                        Gəldi
                      </button>
                      <button
                        className={cx("is-absent-action", booking.status === "absent" && "is-active")}
                        type="button"
                        onClick={() => markAttendance(booking.id, "absent")}
                      >
                        Gəlmədi
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="booking-history-panel">
            <PanelTitle icon={History} title="Tarixçə" subtitle="Bron və jurnal qeydləri" />
            <div className="booking-history-list">
              {history.map((event) => (
                <div className={cx("booking-history-row", `is-${event.kind}`)} key={event.id}>
                  <span />
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.description}</p>
                  </div>
                  <time>{event.time}</time>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}

      <ReservationDialog
        bookingBySlot={bookingBySlot}
        draft={draft}
        isOpen={reservationOpen}
        onCreate={createBooking}
        onOpenChange={setReservationOpen}
        onUpdateDraft={updateDraft}
      />
    </section>
  );
}

function ReservationDialog({
  bookingBySlot,
  draft,
  isOpen,
  onCreate,
  onOpenChange,
  onUpdateDraft,
}: {
  bookingBySlot: Map<string, Booking>;
  draft: DraftState;
  isOpen: boolean;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
  onUpdateDraft: (key: keyof DraftState, value: string) => void;
}) {
  const selectedStudent = students.find((student) => student.id === draft.studentId);
  const selectedDayBookings = getBookingsForDate(Array.from(bookingBySlot.values()), draft.date);
  const draftSlotBooking = bookingBySlot.get(slotKey(draft.date, draft.time));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="booking-reserve-dialog">
        <DialogHeader>
          <DialogTitle>Bron yarat</DialogTitle>
          <DialogDescription>
            Tələbə, gün, saat və otaq məlumatları.
          </DialogDescription>
        </DialogHeader>

        <div className="booking-reserve-layout">
          <div className="booking-reserve-fields">
            <label className="booking-field">
              <span>Tələbə</span>
              <FormSelect
                name="studentId"
                value={draft.studentId}
                onValueChange={(value) => onUpdateDraft("studentId", value)}
                options={studentSelectOptions}
                icon={UserRound}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
                aria-label="Tələbə seç"
              />
            </label>

            <label className="booking-field">
              <span>Tarix</span>
              <DatePicker
                name="bookingDate"
                value={draft.date}
                onValueChange={(nextValue) => onUpdateDraft("date", nextValue)}
                aria-label="Bron tarixi"
                allowClear={false}
                className="booking-dialog-date-input"
              />
            </label>

            <label className="booking-field">
              <span>Müddət</span>
              <FormSelect
                name="duration"
                value={draft.duration}
                onValueChange={(value) => onUpdateDraft("duration", value)}
                options={durationSelectOptions}
                icon={Clock3}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
                aria-label="Müddət seç"
              />
            </label>

            <label className="booking-field">
              <span>Otaq</span>
              <FormSelect
                name="room"
                value={draft.room}
                onValueChange={(value) => onUpdateDraft("room", value)}
                options={roomSelectOptions}
                icon={MapPin}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
                aria-label="Otaq seç"
              />
            </label>

            <label className="booking-field booking-field-note">
              <span>Qeyd</span>
              <input
                value={draft.note}
                onChange={(event) => onUpdateDraft("note", event.target.value)}
                placeholder="Məs: portfolio baxışı"
              />
            </label>
          </div>

          <div className="booking-reserve-slots">
            <div className="booking-reserve-slots-head">
              <div>
                <strong>{formatDateDisplay(draft.date)} saatları</strong>
                <span>{selectedDayBookings.length} / {timeSlots.length} dolu</span>
              </div>
              {selectedStudent && <small>{selectedStudent.program} · {selectedStudent.teacher}</small>}
            </div>

            <div className="booking-reserve-slot-grid">
              {timeSlots.map((time) => {
                const booking = bookingBySlot.get(slotKey(draft.date, time));
                const selected = draft.time === time;

                return (
                  <button
                    key={time}
                    type="button"
                    className={cx(
                      "booking-reserve-slot-option",
                      booking ? statusMeta[booking.status].className : "is-free",
                      selected && "is-selected"
                    )}
                    disabled={Boolean(booking)}
                    onClick={() => onUpdateDraft("time", time)}
                  >
                    <strong>{time}</strong>
                    <span>{booking ? booking.studentName : "Müsait"}</span>
                  </button>
                );
              })}
            </div>

            {draftSlotBooking ? (
              <div className="booking-slot-warning">
                {draft.time} artıq {draftSlotBooking.studentName} üçün bron olunub.
              </div>
            ) : (
              <div className="booking-slot-ready">
                {draft.time} saatı rezerv üçün hazırdır.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Bağla
          </Button>
          <Button type="button" onClick={onCreate} disabled={Boolean(draftSlotBooking)}>
            <CalendarCheck size={16} />
            Rezerv et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricSummaryCard({
  label,
  value,
  delta,
  tone,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "blue" | "coral" | "yellow" | "mint" | "neutral";
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`metric-card-premium tone-${tone}`}
      title={`${label} - siyahıya bax`}
    >
      <div className="card-top-row">
        <span className="card-label">{label}</span>
        <div className="card-icon-square">
          <Icon size={16} />
        </div>
      </div>
      <div className="card-value-row">
        <strong>{value}</strong>
      </div>
      <div className="card-bottom-row">
        <span>{delta}</span>
        <span className="card-action-text">Bax →</span>
      </div>
    </button>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="booking-panel-title">
      <div className="booking-panel-icon">
        <Icon size={17} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function StatusLine({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "success" | "info" | "danger";
}) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className={`booking-status-line is-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value} bron</strong>
      </div>
      <div className="booking-status-track">
        <span style={{ width: `${percentage}%` }} />
      </div>
      <b>{percentage}%</b>
    </div>
  );
}

function readStoredWorkspace(): StoredWorkspace {
  const fallback = getDefaultStoredWorkspace();

  if (typeof window === "undefined") {
    return fallback;
  }

  const saved = window.localStorage.getItem(storageKey);

  if (!saved) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(saved) as Partial<StoredWorkspace>;
    const bookings =
      Array.isArray(parsed.bookings) && parsed.bookings.length > 0
        ? normalizeStoredBookings(parsed.bookings)
        : fallback.bookings;
    const history = Array.isArray(parsed.history) ? parsed.history : fallback.history;
    const selectedBookingId =
      typeof parsed.selectedBookingId === "string" &&
      bookings.some((booking) => booking.id === parsed.selectedBookingId)
        ? parsed.selectedBookingId
        : bookings[0]?.id ?? "";

    return { bookings, history, selectedBookingId };
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

function getDefaultStoredWorkspace(): StoredWorkspace {
  return {
    bookings: initialBookings,
    history: initialHistory,
    selectedBookingId: initialBookings[0]?.id ?? "",
  };
}

function createSeedBooking({
  id,
  student,
  dayId,
  time,
  room,
  status,
}: {
  id: string;
  student: StudentOption;
  dayId: string;
  time: string;
  room: string;
  status: AttendanceStatus;
}): Booking {
  return {
    id,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.code,
    program: student.program,
    teacher: student.teacher,
    room,
    date: getDateForDayId(dayId),
    dayId,
    time,
    duration: "90 dəq",
    note: status === "reserved" ? "Hazırlıq materialı göndəriləcək" : "Dərs jurnala işlənib",
    status,
    createdAt: new Date().toISOString(),
  };
}

function matchesBookingFilters(booking: Booking, filters: BookingFilters) {
  const query = normalizeSearch(filters.query);
  const haystack = [
    booking.studentName,
    booking.studentCode,
    booking.program,
    booking.teacher,
    booking.room,
    booking.note,
    formatDateDisplay(booking.date),
    getDayLabel(booking.dayId),
  ]
    .map(normalizeSearch)
    .join(" ");

  const matchesQuery = !query || haystack.includes(query);
  const matchesStatus = filters.status === "all" || booking.status === filters.status;
  const matchesRoom = filters.room === "all" || booking.room === filters.room;

  return matchesQuery && matchesStatus && matchesRoom;
}

function matchesBookingDateRange(booking: Booking, filters: BookingFilters) {
  const bookingDate = booking.date;
  const afterStart = !filters.dateFrom || bookingDate >= filters.dateFrom;
  const beforeEnd = !filters.dateTo || bookingDate <= filters.dateTo;

  return afterStart && beforeEnd;
}

function compareBookingsBySlot(a: Booking, b: Booking) {
  const dateDiff = a.date.localeCompare(b.date);

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return a.time.localeCompare(b.time);
}

function countActiveFilters(filters: BookingFilters) {
  return [
    filters.query.trim().length > 0,
    filters.dateFrom.length > 0,
    filters.dateTo.length > 0,
    filters.status !== "all",
    filters.room !== "all",
  ].filter(Boolean).length;
}

function getBookingsForDate(bookings: Booking[], date: string) {
  return bookings
    .filter((booking) => booking.date === date)
    .sort(compareBookingsBySlot);
}

function getDay(dayId: string) {
  return days.find((day) => day.id === dayId) ?? days[0];
}

function getDensityClass(utilization: number) {
  if (utilization >= 70) {
    return "is-high";
  }

  if (utilization >= 35) {
    return "is-medium";
  }

  return "is-low";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("az-AZ");
}

function getStatusLabel(status: BookingStatusFilter) {
  return status === "all" ? "Bütün statuslar" : statusMeta[status].label;
}

function slotKey(date: string, time: string) {
  return `${date}-${time}`;
}

function getDayLabel(dayId: string) {
  return getDay(dayId).label;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function normalizeStoredBookings(bookings: Booking[]) {
  return bookings.map((booking) => {
    const date = booking.date || getDateForDayId(booking.dayId || "mon");
    const dayId = booking.dayId || getDayIdFromDate(date);

    return { ...booking, date, dayId };
  });
}

function getDayIdFromDate(value: string) {
  const date = parseIsoDate(value);
  const day = date.getDay();

  if (day === 2) {
    return "tue";
  }

  if (day === 3) {
    return "wed";
  }

  if (day === 4) {
    return "thu";
  }

  if (day === 5) {
    return "fri";
  }

  if (day === 6) {
    return "sat";
  }

  return "mon";
}

function getDateForDayId(dayId: string, anchorValue?: string) {
  const anchor = anchorValue ? parseIsoDate(anchorValue) : new Date();
  const monday = addDays(anchor, -((anchor.getDay() + 6) % 7));
  const dayIndex = Math.max(dayOrder.get(dayId) ?? 0, 0);

  return toIsoDate(addDays(monday, dayIndex));
}

function formatDateDisplay(value: string) {
  const date = parseIsoDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function addDays(date: Date, daysCount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + daysCount);

  return nextDate;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
