"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Filter,
  History,
  List,
  MapPin,
  Plus,
  Search,
  Sparkles,
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
import type {
  AttendanceStatus,
  BookingData,
  BookingRow,
} from "@/modules/bookings/queries";

type BookingView = "schedule" | "list" | "journal";
type BookingStatusFilter = "all" | AttendanceStatus;

type DraftState = {
  studentId: string;
  date: string;
  time: string;
  durationMinutes: string;
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
  cancelled: { label: "Ləğv", className: "is-cancelled", tone: "neutral", icon: XCircle },
};

const statusFilterOptions: { value: BookingStatusFilter; label: string }[] = [
  { value: "all", label: "Bütün statuslar" },
  { value: "reserved", label: "Bron" },
  { value: "attended", label: "Gəldi" },
  { value: "absent", label: "Gəlmədi" },
  { value: "cancelled", label: "Ləğv" },
];

const tabs: Array<{ id: BookingView; label: string; icon: LucideIcon }> = [
  { id: "schedule", label: "Gün planı", icon: CalendarCheck },
  { id: "list", label: "Bron siyahısı", icon: List },
  { id: "journal", label: "Tarixçə", icon: History },
];

export function BookingWorkspace({
  data,
  createLessonReservationAction,
  markLessonAttendanceAction,
}: {
  data: BookingData;
  createLessonReservationAction: (formData: FormData) => void | Promise<void>;
  markLessonAttendanceAction: (formData: FormData) => void | Promise<void>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeView, setActiveView] = useState<BookingView>("schedule");
  const [selectedDate, setSelectedDate] = useState(data.defaultDate);
  const [selectedBookingId, setSelectedBookingId] = useState(data.bookings[0]?.id ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState<BookingFilters>(initialFilters);
  const [draft, setDraft] = useState<DraftState>(() => buildInitialDraft(data, data.defaultDate));

  const activeSelectedBookingId =
    selectedBookingId && data.bookings.some((booking) => booking.id === selectedBookingId)
      ? selectedBookingId
      : data.bookings[0]?.id ?? "";

  const roomFilterOptions = useMemo(
    () => [{ value: "all", label: "Bütün otaqlar" }, ...data.rooms.map((room) => ({ value: room, label: room }))],
    [data.rooms]
  );
  const bookingBySlot = useMemo(() => {
    const map = new Map<string, BookingRow>();
    for (const booking of data.bookings) {
      if (booking.status !== "cancelled") {
        map.set(slotKey(booking.date, booking.time, booking.room), booking);
      }
    }
    return map;
  }, [data.bookings]);
  const selectedDateBookings = useMemo(
    () =>
      data.bookings
        .filter((booking) => booking.date === selectedDate)
        .sort((left, right) => `${left.time} ${left.room}`.localeCompare(`${right.time} ${right.room}`)),
    [data.bookings, selectedDate]
  );
  const filteredBookings = useMemo(
    () => data.bookings.filter((booking) => matchesBookingFilters(booking, filters, selectedDate)),
    [data.bookings, filters, selectedDate]
  );
  const selectedBooking =
    data.bookings.find((booking) => booking.id === activeSelectedBookingId) ??
    selectedDateBookings[0] ??
    data.bookings[0];
  const stats = useMemo(() => buildStats(data.bookings), [data.bookings]);
  const selectedDayStats = useMemo(
    () => buildDayStats(selectedDateBookings, data.rooms.length * data.timeSlots.length),
    [selectedDateBookings, data.rooms.length, data.timeSlots.length]
  );
  const activeFilterCount = countActiveFilters(filters);

  function updateDraft<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function openReservation(date = selectedDate, time = data.timeSlots[0] ?? "10:00") {
    const room = data.rooms[0] ?? "";
    setDraft((current) => ({
      ...current,
      studentId: current.studentId || data.students[0]?.id || "",
      date,
      time,
      room,
      note: "",
    }));
    setDialogOpen(true);
  }

  function createReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const existing = bookingBySlot.get(slotKey(draft.date, draft.time, draft.room));

    if (existing) {
      setNotice(`${draft.room} otağında ${formatDateDisplay(draft.date)} ${draft.time} artıq doludur.`);
      return;
    }

    const formData = new FormData();
    formData.set("studentId", draft.studentId);
    formData.set("bookingDate", draft.date);
    formData.set("bookingTime", draft.time);
    formData.set("durationMinutes", draft.durationMinutes);
    formData.set("room", draft.room);
    formData.set("note", draft.note);

    startTransition(() => {
      void (async () => {
        try {
          await createLessonReservationAction(formData);
          setDialogOpen(false);
          setNotice("Bron yaradıldı. Tələbə qrup gözləyirdisə aktiv statusa keçirildi.");
          router.refresh();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Bron yaratmaq mümkün olmadı");
        }
      })();
    });
  }

  function markAttendance(bookingId: string, status: "attended" | "absent") {
    const formData = new FormData();
    formData.set("lessonId", bookingId);
    formData.set("status", status);

    startTransition(() => {
      void (async () => {
        try {
          await markLessonAttendanceAction(formData);
          setSelectedBookingId(bookingId);
          setNotice(status === "attended" ? "Davamiyyət gəldi kimi saxlanıldı." : "Davamiyyət gəlmədi kimi saxlanıldı.");
          router.refresh();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Davamiyyəti yeniləmək mümkün olmadı");
        }
      })();
    });
  }

  function resetFilters() {
    setFilters(initialFilters);
  }

  return (
    <section className="page-stack operational-page booking-redesign-page booking-day-redesign-page">
      <div className="crm-unified-filter-panel booking-command-panel booking-day-command-panel">
        <div className="student-header-compact booking-header-compact" style={{ marginBottom: 0 }}>
          <div className="header-title-wrapper-compact booking-legacy-title-block">
            <p className="eyebrow">Dərs bronları</p>
            <h1>Real rezervasiya planı</h1>
            <p>Bron yarandıqda qrup gözləyən tələbə aktivləşir, dərs və davamiyyət DB-də saxlanılır.</p>
          </div>
          <div className="header-actions-wrapper-compact booking-header-actions">
            <div className="financial-summary-badge-compact booking-summary-badge-compact">
              <Sparkles size={15} />
              <div>
                <span>Bugünkü fokus</span>
                <strong>{selectedDayStats.active} bron</strong>
              </div>
            </div>
            <Button type="button" onClick={() => openReservation()} disabled={!data.permissions.canCreateReservation || data.students.length === 0}>
              <Plus data-icon="inline-start" />
              Bron yarat
            </Button>
          </div>
        </div>

        <div className="filter-header-divider" />

        <div className="student-unified-filter-panel-inner booking-filter-panel">
          <div className="filter-main-row booking-day-filter-row">
            <label className="search-input-wrapper booking-search-input-wrapper booking-command-search">
              <Search size={16} />
              <input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Tələbə, kod, müəllim, proqram və otaq üzrə axtar"
              />
            </label>
            <label className="booking-date-input-container">
              <span>Gün</span>
              <DatePicker name="selectedDate" value={selectedDate} onValueChange={setSelectedDate} allowClear={false} />
            </label>
            <label className="booking-date-input-container">
              <span>Başlanğıc</span>
              <DatePicker name="bookingFrom" value={filters.dateFrom} onValueChange={(value) => setFilters((current) => ({ ...current, dateFrom: value }))} />
            </label>
            <label className="booking-date-input-container">
              <span>Son</span>
              <DatePicker name="bookingTo" value={filters.dateTo} onValueChange={(value) => setFilters((current) => ({ ...current, dateTo: value }))} />
            </label>
            <label className="booking-filter-select">
              <span>Status</span>
              <FormSelect
                name="bookingStatusFilter"
                value={filters.status}
                onValueChange={(value) => setFilters((current) => ({ ...current, status: value as BookingStatusFilter }))}
                options={statusFilterOptions}
                className="booking-filter-trigger"
                contentClassName="booking-select-content"
              />
            </label>
            <label className="booking-filter-select">
              <span>Otaq</span>
              <FormSelect
                name="bookingRoomFilter"
                value={filters.room}
                onValueChange={(value) => setFilters((current) => ({ ...current, room: value }))}
                options={roomFilterOptions}
                className="booking-filter-trigger"
                contentClassName="booking-select-content"
              />
            </label>
            {activeFilterCount > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
                <Filter data-icon="inline-start" />
                Sıfırla
              </Button>
            ) : null}
          </div>
          {notice ? (
            <div className="booking-notice" role="status">
              <AlertCircle size={14} />
              <span>{notice}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="metrics-grid-premium booking-metrics-premium" aria-label="Bron statistika kartları">
        <MetricCard icon={CalendarCheck} label="Cəmi bron" value={data.bookings.length.toString()} helper={`${selectedDateBookings.length} seçilən gündə`} />
        <MetricCard icon={CheckCircle2} label="Gəldi" value={stats.attended.toString()} helper={`${stats.attendanceRate}% davamiyyət`} />
        <MetricCard icon={XCircle} label="Gəlmədi" value={stats.absent.toString()} helper="DB-də saxlanılır" />
        <MetricCard icon={MapPin} label="Otaqlar" value={stats.activeRooms.toString()} helper="aktiv istifadə" />
      </div>

      <div className="crm-tabs-navigation student-tabs-navigation booking-tabs-navigation">
        <div className="tabs-segmented-container booking-tabs-segmented">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const count =
              tab.id === "schedule"
                ? selectedDayStats.active
                : tab.id === "list"
                  ? filteredBookings.length
                  : data.history.length;

            return (
              <button
                key={tab.id}
                type="button"
                className={cx("tab-segmented-item booking-tab-item", activeView === tab.id && "is-active")}
                onClick={() => setActiveView(tab.id)}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                <span className="tab-segmented-badge booking-tab-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeView === "schedule" ? (
        <article className="booking-day-schedule-panel animate-fade-in">
          <div className="booking-day-schedule-head">
            <div className="booking-panel-title">
              <div className="booking-panel-icon">
                <Clock3 size={17} />
              </div>
              <div>
                <h2>{formatDateDisplay(selectedDate)}</h2>
                <p>{selectedDayStats.active} aktiv bron, {data.rooms.length} otaq, {selectedDayStats.free} boş slot</p>
              </div>
            </div>
            <div className="booking-day-head-actions">
              <span className={cx("booking-density", getDensityClass(selectedDayStats.occupancy))}>
                {selectedDayStats.occupancy}% doluluq
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => openReservation()}>
                <Plus data-icon="inline-start" />
                Slot əlavə et
              </Button>
            </div>
          </div>

          <div className="booking-day-summary-row">
            <div>
              <span className="dot dot-info" />
              <strong>{selectedDayStats.reserved}</strong>
              <small>Bron</small>
            </div>
            <div>
              <span className="dot dot-success" />
              <strong>{selectedDayStats.attended}</strong>
              <small>Gəldi</small>
            </div>
            <div>
              <span className="dot dot-danger" />
              <strong>{selectedDayStats.absent}</strong>
              <small>Gəlmədi</small>
            </div>
            <div>
              <span className="dot dot-warning" />
              <strong>{selectedDayStats.free}</strong>
              <small>Boş slot</small>
            </div>
          </div>

          <div className="booking-day-slots-grid">
            {data.timeSlots.flatMap((time) =>
              data.rooms.map((room) => {
                const booking = bookingBySlot.get(slotKey(selectedDate, time, room));
                const StatusIcon = booking ? statusMeta[booking.status].icon : Plus;

                return (
                  <button
                    key={`${time}-${room}`}
                    type="button"
                    className={cx(
                      "booking-day-slot-card booking-compact-slot-card",
                      booking ? statusMeta[booking.status].className : "is-free",
                      activeSelectedBookingId === booking?.id && "is-selected"
                    )}
                    onClick={() => {
                      if (booking) {
                        setSelectedBookingId(booking.id);
                        setNotice(`${booking.studentName}: ${formatDateDisplay(booking.date)} ${booking.time}, ${booking.room}.`);
                        return;
                      }

                      openReservation(selectedDate, time);
                      setDraft((current) => ({ ...current, room }));
                    }}
                  >
                    <span className="booking-slot-status-icon">
                      <StatusIcon size={15} />
                    </span>
                    <span className="booking-day-slot-time">{time}</span>
                    <strong>{booking ? booking.studentName : "Boş saat"}</strong>
                    <small>{booking ? `${room} · ${statusMeta[booking.status].label}` : room}</small>
                  </button>
                );
              })
            )}
          </div>
        </article>
      ) : null}

      {activeView === "list" ? (
        <article className="panel table-panel crm-table-panel-redesign booking-table-panel-redesign animate-fade-in">
          <div className="table-wrap">
            <table className="data-table-redesign booking-table-redesign">
              <thead>
                <tr>
                  <th>Tələbə</th>
                  <th>Tarix / Saat</th>
                  <th>Proqram</th>
                  <th>Müəllim</th>
                  <th>Otaq</th>
                  <th>Status</th>
                  <th>Qeyd</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map((booking) => (
                    <BookingTableRow
                      booking={booking}
                      key={booking.id}
                      disabled={isPending || !data.permissions.canMarkAttendance}
                      onOpen={() => {
                        setSelectedBookingId(booking.id);
                        setSelectedDate(booking.date);
                      }}
                      onMark={markAttendance}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state compact">Filtrlərə uyğun bron tapılmadı</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {activeView === "journal" ? (
        <div className="student-dashboard-details-grid booking-journal-dashboard booking-journal-dashboard-modern animate-fade-in">
          <article className="booking-journal-panel">
            <PanelTitle icon={BarChart3} title="Seçilən bron" subtitle={selectedBooking ? selectedBooking.studentName : "Bron seçilməyib"} />
            {selectedBooking ? (
              <div className="booking-journal-row">
                <div className="booking-journal-person">
                  <div className="booking-mini-avatar">{getInitials(selectedBooking.studentName)}</div>
                  <div>
                    <strong>{selectedBooking.studentName}</strong>
                    <span>{selectedBooking.studentCode} · {selectedBooking.program}</span>
                    <small>{formatDateDisplay(selectedBooking.date)} - {selectedBooking.time} · {selectedBooking.room}</small>
                  </div>
                </div>
                <div className="booking-journal-actions">
                  <StatusChip tone={statusMeta[selectedBooking.status].tone}>{statusMeta[selectedBooking.status].label}</StatusChip>
                  <Button type="button" size="sm" variant="outline" disabled={isPending || !data.permissions.canMarkAttendance} onClick={() => markAttendance(selectedBooking.id, "attended")}>
                    Gəldi
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={isPending || !data.permissions.canMarkAttendance} onClick={() => markAttendance(selectedBooking.id, "absent")}>
                    Gəlmədi
                  </Button>
                </div>
              </div>
            ) : (
              <div className="empty-state compact">Dərs bronu yoxdur</div>
            )}
          </article>

          <article className="booking-history-panel">
            <PanelTitle icon={History} title="Dərs tarixçəsi" subtitle={`${data.history.length} son əməliyyat`} />
            <div className="booking-history-list">
              {data.history.length > 0 ? (
                data.history.map((event) => (
                  <div className={cx("booking-history-row", `is-${event.kind}`)} key={event.id}>
                    <span />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.description}</p>
                    </div>
                    <time>{event.time}</time>
                  </div>
                ))
              ) : (
                <div className="empty-state compact">Tarixçə yoxdur</div>
              )}
            </div>
          </article>
        </div>
      ) : null}

      <ReservationDialog
        data={data}
        draft={draft}
        isPending={isPending}
        open={dialogOpen}
        bookingBySlot={bookingBySlot}
        onOpenChange={setDialogOpen}
        onSubmit={createReservation}
        onDraftChange={updateDraft}
      />
    </section>
  );
}

function BookingTableRow({
  booking,
  disabled,
  onOpen,
  onMark,
}: {
  booking: BookingRow;
  disabled: boolean;
  onOpen: () => void;
  onMark: (bookingId: string, status: "attended" | "absent") => void;
}) {
  return (
    <tr className="table-row-interactive">
      <td>
        <button className="booking-open-row-button" type="button" onClick={onOpen}>
          <strong>{booking.studentName}</strong>
          <span>{booking.studentCode} · {booking.room}</span>
        </button>
      </td>
      <td>
        <div className="student-date-cell booking-table-time">
          <Clock3 size={14} />
          <span>{formatDateDisplay(booking.date)} / {booking.time}</span>
        </div>
      </td>
      <td><strong>{booking.program}</strong></td>
      <td><span>{booking.teacher}</span></td>
      <td><span className="booking-room-tag">{booking.room}</span></td>
      <td><StatusChip tone={statusMeta[booking.status].tone}>{statusMeta[booking.status].label}</StatusChip></td>
      <td><span className="booking-note-preview">{booking.note || "Qeyd yoxdur"}</span></td>
      <td>
        <div className="booking-row-actions">
          <button className={cx(booking.status === "attended" && "is-active")} type="button" disabled={disabled} onClick={() => onMark(booking.id, "attended")}>
            Gəldi
          </button>
          <button className={cx("is-absent-action", booking.status === "absent" && "is-active")} type="button" disabled={disabled} onClick={() => onMark(booking.id, "absent")}>
            Gəlmədi
          </button>
        </div>
      </td>
    </tr>
  );
}

function ReservationDialog({
  data,
  draft,
  isPending,
  open,
  bookingBySlot,
  onOpenChange,
  onSubmit,
  onDraftChange,
}: {
  data: BookingData;
  draft: DraftState;
  isPending: boolean;
  open: boolean;
  bookingBySlot: Map<string, BookingRow>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
}) {
  const draftSlotBooking = bookingBySlot.get(slotKey(draft.date, draft.time, draft.room));
  const studentOptions = data.students.map((student) => ({
    value: student.id,
    label: `${student.name} - ${student.code}`,
    searchText: [student.phone, student.program, student.teacher, student.lifecycleStatus].join(" "),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="booking-reserve-dialog">
        <DialogHeader>
          <DialogTitle>Dərs bronu yarat</DialogTitle>
          <DialogDescription>
            Tələbə, tarix, saat və otaq seçin. Qrup gözləyən tələbə bronla aktivləşəcək.
          </DialogDescription>
        </DialogHeader>

        <form className="booking-reserve-layout" onSubmit={onSubmit}>
          <div className="booking-reserve-fields">
            <label className="booking-field">
              <span>Tələbə</span>
              <FormSelect
                name="bookingStudent"
                value={draft.studentId}
                onValueChange={(value) => onDraftChange("studentId", value)}
                options={studentOptions}
                emptyLabel={data.students.length > 0 ? "Tələbə seçin" : "Tələbə yoxdur"}
                searchable
                searchPlaceholder="Ad, kod, telefon, proqram, müəllim..."
                className="booking-dialog-select"
                contentClassName="booking-select-content"
              />
            </label>
            <label className="booking-field">
              <span>Tarix</span>
              <DatePicker
                name="bookingDateDraft"
                value={draft.date}
                onValueChange={(value) => onDraftChange("date", value)}
                allowClear={false}
                className="booking-dialog-date-input"
              />
            </label>
            <label className="booking-field">
              <span>Saat</span>
              <FormSelect
                name="bookingTime"
                value={draft.time}
                onValueChange={(value) => onDraftChange("time", value)}
                options={data.timeSlots.map((time) => ({ value: time, label: time }))}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
              />
            </label>
            <label className="booking-field">
              <span>Müddət</span>
              <FormSelect
                name="bookingDuration"
                value={draft.durationMinutes}
                onValueChange={(value) => onDraftChange("durationMinutes", value)}
                options={data.durationOptions.map((duration) => ({
                  value: duration.value,
                  label: duration.label,
                }))}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
              />
            </label>
            <label className="booking-field">
              <span>Otaq</span>
              <FormSelect
                name="bookingRoom"
                value={draft.room}
                onValueChange={(value) => onDraftChange("room", value)}
                options={data.rooms.map((room) => ({ value: room, label: room }))}
                className="booking-dialog-select"
                contentClassName="booking-select-content"
              />
            </label>
            <label className="booking-field booking-field-note">
              <span>Qeyd</span>
              <textarea
                value={draft.note}
                maxLength={500}
                onChange={(event) => onDraftChange("note", event.target.value)}
                placeholder="Dərs mövzusu, xüsusi qeyd və ya otaq qeydi"
              />
            </label>
          </div>

          <div className="booking-reserve-slots">
            <div className="booking-reserve-slots-head">
              <strong>{formatDateDisplay(draft.date)}</strong>
              <span>{draft.room}</span>
            </div>
            <div className="booking-reserve-slot-grid">
              {data.timeSlots.map((time) => {
                const booking = bookingBySlot.get(slotKey(draft.date, time, draft.room));
                return (
                  <button
                    type="button"
                    key={time}
                    className={cx(
                      "booking-reserve-slot-option",
                      booking ? statusMeta[booking.status].className : "is-free",
                      draft.time === time && "is-selected"
                    )}
                    disabled={Boolean(booking)}
                    onClick={() => onDraftChange("time", time)}
                  >
                    <strong>{time}</strong>
                    <span>{booking ? booking.studentName : "Müsait"}</span>
                  </button>
                );
              })}
            </div>
            {draftSlotBooking ? (
              <div className="booking-slot-warning">
                <AlertCircle size={14} />
                Bu slot artıq {draftSlotBooking.studentName} üçün bronlanıb.
              </div>
            ) : (
              <div className="booking-slot-ready">
                <CheckCircle2 size={14} />
                Slot müsaitdir və DB-yə yazılacaq.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Ləğv et
            </Button>
            <Button
              type="submit"
              disabled={
                isPending ||
                Boolean(draftSlotBooking) ||
                !draft.studentId ||
                data.students.length === 0 ||
                !data.permissions.canCreateReservation
              }
            >
              <Plus data-icon="inline-start" />
              Bron yarat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="metric-card-premium booking-metric-card">
      <div className="metric-card-head">
        <span className="metric-card-icon">
          <Icon size={18} />
        </span>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
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

function buildInitialDraft(data: BookingData, date: string): DraftState {
  return {
    studentId: data.students[0]?.id ?? "",
    date,
    time: data.timeSlots[0] ?? "10:00",
    durationMinutes: data.durationOptions[1]?.value ?? data.durationOptions[0]?.value ?? "90",
    room: data.rooms[0] ?? "",
    note: "",
  };
}

function buildStats(bookings: BookingRow[]) {
  const attended = bookings.filter((booking) => booking.status === "attended").length;
  const absent = bookings.filter((booking) => booking.status === "absent").length;
  const activeRooms = new Set(bookings.map((booking) => booking.room)).size;
  const attendanceRate = bookings.length > 0 ? Math.round((attended / bookings.length) * 100) : 0;

  return { attended, absent, activeRooms, attendanceRate };
}

function buildDayStats(bookings: BookingRow[], totalSlots: number) {
  const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const attended = activeBookings.filter((booking) => booking.status === "attended").length;
  const absent = activeBookings.filter((booking) => booking.status === "absent").length;
  const reserved = activeBookings.filter((booking) => booking.status === "reserved").length;
  const free = Math.max(totalSlots - activeBookings.length, 0);
  const occupancy = totalSlots > 0 ? Math.round((activeBookings.length / totalSlots) * 100) : 0;

  return {
    active: activeBookings.length,
    attended,
    absent,
    reserved,
    free,
    occupancy,
  };
}

function getDensityClass(occupancy: number) {
  if (occupancy >= 72) {
    return "is-high";
  }

  if (occupancy >= 38) {
    return "is-medium";
  }

  return "is-low";
}

function matchesBookingFilters(booking: BookingRow, filters: BookingFilters, selectedDate: string) {
  const query = filters.query.trim().toLocaleLowerCase("az");
  const searchable = [
    booking.studentName,
    booking.studentCode,
    booking.program,
    booking.teacher,
    booking.room,
    booking.note,
    formatDateDisplay(booking.date),
  ]
    .join(" ")
    .toLocaleLowerCase("az");
  const hasDateRange = Boolean(filters.dateFrom || filters.dateTo);
  const matchesQuery = !query || searchable.includes(query);
  const matchesDate = hasDateRange
    ? (!filters.dateFrom || booking.date >= filters.dateFrom) && (!filters.dateTo || booking.date <= filters.dateTo)
    : booking.date === selectedDate;
  const matchesStatus = filters.status === "all" || booking.status === filters.status;
  const matchesRoom = filters.room === "all" || booking.room === filters.room;

  return matchesQuery && matchesDate && matchesStatus && matchesRoom;
}

function countActiveFilters(filters: BookingFilters) {
  return [
    filters.query,
    filters.dateFrom,
    filters.dateTo,
    filters.status !== "all" ? filters.status : "",
    filters.room !== "all" ? filters.room : "",
  ].filter(Boolean).length;
}

function slotKey(date: string, time: string, room: string) {
  return `${date}|${time}|${room}`;
}

function formatDateDisplay(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
