"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Gift,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Ticket,
  UserPlus,
  UsersRound,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { studentPaymentMethodOptions } from "@/modules/students/payment-method";
import type {
  WorkshopData,
  WorkshopEventRow,
  WorkshopParticipantRow,
} from "@/modules/workshops/queries";

type WorkshopAction = (formData: FormData) => void | Promise<void>;
type WorkshopView = "participants" | "ledger";

const eventTypeOptions = [
  { value: "WORKSHOP", label: "Workshop" },
  { value: "MASTERCLASS", label: "Masterclass" },
];

const eventStatusOptions = [
  { value: "SCHEDULED", label: "Planlı" },
  { value: "DRAFT", label: "Qaralama" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
];

const durationOptions = [
  { value: "90", label: "90 dəq" },
  { value: "120", label: "120 dəq" },
  { value: "180", label: "180 dəq" },
  { value: "240", label: "240 dəq" },
];

const kpiIcons = [Banknote, Ticket, UsersRound, CalendarDays];

export function WorkshopWorkspace({
  data,
  createWorkshopEventAction,
  assignWorkshopParticipantAction,
}: {
  data: WorkshopData;
  createWorkshopEventAction: WorkshopAction;
  assignWorkshopParticipantAction: WorkshopAction;
}) {
  const [selectedEventId, setSelectedEventId] = useState(data.events[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [activeView, setActiveView] = useState<WorkshopView>("participants");
  const [notice, setNotice] = useState("");

  const selectedEvent =
    data.events.find((event) => event.id === selectedEventId) ?? data.events[0] ?? null;
  const normalizedQuery = normalizeSearch(query);
  const filteredEvents = useMemo(
    () =>
      data.events.filter((event) =>
        normalizeSearch(
          [
            event.title,
            event.eventTypeLabel,
            event.statusLabel,
            event.room,
            event.instructor,
            event.entryPrice,
            event.revenue,
          ].join(" ")
        ).includes(normalizedQuery)
      ),
    [data.events, normalizedQuery]
  );
  const eventParticipants = useMemo(
    () =>
      data.participants.filter((participant) => {
        const matchesEvent = selectedEvent ? participant.eventId === selectedEvent.id : true;
        const matchesQuery =
          !normalizedQuery ||
          normalizeSearch(
            [
              participant.fullName,
              participant.phone,
              participant.eventTitle,
              participant.paymentLabel,
              participant.paymentMethod,
              participant.note,
            ].join(" ")
          ).includes(normalizedQuery);

        return matchesEvent && matchesQuery;
      }),
    [data.participants, normalizedQuery, selectedEvent]
  );

  return (
    <section className="page-stack workshop-page">
      <header className="workshop-hero">
        <div className="workshop-hero-main">
          <div className="workshop-scope-row">
            <span>Artmonia ERP</span>
            <span>Workshop & Masterclass</span>
          </div>
          <div className="workshop-title-block">
            <h1>Workshop & Masterclass</h1>
            <p>Tədbirləri yarat, iştirakçıları assign et və real gəliri avtomatik izlə.</p>
          </div>
        </div>
        <div className="workshop-hero-actions">
          <ParticipantDialog
            data={data}
            activeEvent={selectedEvent}
            action={assignWorkshopParticipantAction}
            disabled={!data.permissions.canManage || data.events.length === 0}
            onNotify={setNotice}
          />
          <EventDialog
            defaultDate={data.defaultDate}
            action={createWorkshopEventAction}
            disabled={!data.permissions.canManage}
            onNotify={setNotice}
          />
        </div>
      </header>

      <div className="workshop-command-bar">
        <label className="workshop-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tədbir, iştirakçı, məkan və ödəniş üzrə axtar"
          />
        </label>
        <div className="workshop-command-summary">
          <Sparkles size={15} />
          <span>{data.summary.revenue} real gəlir</span>
        </div>
      </div>

      {notice ? (
        <div className="workshop-notice" role="status">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="workshop-kpi-grid" aria-label="Workshop göstəriciləri">
        {data.kpis.map((kpi, index) => {
          const Icon = kpiIcons[index] ?? Sparkles;
          return <MetricCard key={kpi.label} icon={Icon} {...kpi} />;
        })}
      </div>

      <div className="workshop-board">
        <article className="workshop-events-panel">
          <PanelHead
            icon={CalendarDays}
            title="Tədbirlər"
            subtitle={`${filteredEvents.length} tədbir göstərilir`}
          />
          <div className="workshop-event-list">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={cx(
                    "workshop-event-card",
                    selectedEvent?.id === event.id && "is-selected"
                  )}
                  onClick={() => setSelectedEventId(event.id)}
                >
                  <span className="workshop-event-ribbon" />
                  <div className="workshop-event-top">
                    <div>
                      <strong>{event.title}</strong>
                      <span>{event.eventTypeLabel} / {event.date} / {event.time}</span>
                    </div>
                    <StatusChip tone={event.statusTone}>{event.statusLabel}</StatusChip>
                  </div>
                  <div className="workshop-event-meta">
                    <span><MapPin size={13} />{event.room}</span>
                    <span><UsersRound size={13} />{event.participantCount}{event.capacity ? `/${event.capacity}` : ""}</span>
                    <span><Ticket size={13} />{event.entryPrice}</span>
                  </div>
                  <div className="workshop-event-finance">
                    <div>
                      <span>Gəlir</span>
                      <strong>{event.revenue}</strong>
                    </div>
                    <div>
                      <span>Potensial</span>
                      <strong>{event.potentialRevenue}</strong>
                    </div>
                    <div>
                      <span>Hədiyyə</span>
                      <strong>{event.giftCount}</strong>
                    </div>
                  </div>
                  <div className="workshop-fill-track" aria-label={`${event.fillRate}% doluluq`}>
                    <span style={{ width: `${event.fillRate}%` }} />
                  </div>
                </button>
              ))
            ) : (
              <div className="workshop-empty">Uyğun tədbir tapılmadı</div>
            )}
          </div>
        </article>

        <article className="workshop-detail-panel">
          {selectedEvent ? (
            <>
              <div className="workshop-detail-head">
                <div>
                  <span>{selectedEvent.eventTypeLabel}</span>
                  <h2>{selectedEvent.title}</h2>
                  <p>{selectedEvent.date} / {selectedEvent.time} / {selectedEvent.duration}</p>
                </div>
                <StatusChip tone={selectedEvent.statusTone}>{selectedEvent.statusLabel}</StatusChip>
              </div>

              <div className="workshop-detail-grid">
                <DetailStat label="Təlimçi" value={selectedEvent.instructor} />
                <DetailStat label="Məkan" value={selectedEvent.room} />
                <DetailStat label="Giriş qiyməti" value={selectedEvent.entryPrice} />
                <DetailStat label="Real qazanc" value={selectedEvent.revenue} strong />
              </div>

              <div className="workshop-mini-ledger">
                <div>
                  <Banknote size={15} />
                  <span>Ödənişli</span>
                  <strong>{selectedEvent.paidCount}</strong>
                </div>
                <div>
                  <Gift size={15} />
                  <span>Hədiyyə</span>
                  <strong>{selectedEvent.giftCount}</strong>
                </div>
                <div>
                  <Sparkles size={15} />
                  <span>Endirimli</span>
                  <strong>{selectedEvent.discountedCount}</strong>
                </div>
                <div>
                  <Ticket size={15} />
                  <span>Qalan potensial</span>
                  <strong>{selectedEvent.remainingRevenue}</strong>
                </div>
              </div>

              <div className="workshop-tabs">
                <button
                  type="button"
                  className={cx(activeView === "participants" && "is-active")}
                  onClick={() => setActiveView("participants")}
                >
                  İştirakçılar
                  <span>{eventParticipants.length}</span>
                </button>
                <button
                  type="button"
                  className={cx(activeView === "ledger" && "is-active")}
                  onClick={() => setActiveView("ledger")}
                >
                  Gəlir görünüşü
                  <span>{selectedEvent.revenue}</span>
                </button>
              </div>

              {activeView === "participants" ? (
                <ParticipantTable participants={eventParticipants} />
              ) : (
                <RevenueBreakdown event={selectedEvent} participants={eventParticipants} />
              )}
            </>
          ) : (
            <div className="workshop-empty is-large">
              Tədbir yaratdıqdan sonra iştirakçı və gəlir paneli burada görünəcək.
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

function EventDialog({
  defaultDate,
  action,
  disabled,
  onNotify,
}: {
  defaultDate: string;
  action: WorkshopAction;
  disabled: boolean;
  onNotify: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        try {
          await action(formData);
          setOpen(false);
          onNotify("Tədbir yaradıldı.");
          router.refresh();
        } catch (error) {
          onNotify(error instanceof Error ? error.message : "Tədbir yaratmaq mümkün olmadı");
        }
      })();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          <Plus data-icon="inline-start" />
          Tədbir yarat
        </Button>
      </DialogTrigger>
      <DialogContent className="workshop-dialog">
        <DialogHeader>
          <DialogTitle>Workshop / Masterclass yarat</DialogTitle>
          <DialogDescription>
            Tədbirin tarixini, giriş qiymətini, tutumunu və əsas detallarını qeyd et.
          </DialogDescription>
        </DialogHeader>
        <form className="workshop-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label className="form-field">
              <span>Tədbir adı</span>
              <Input name="title" placeholder="Məs: Portfolio masterclass" maxLength={140} required />
            </label>
            <label className="form-field">
              <span>Növ</span>
              <FormSelect name="eventType" defaultValue="WORKSHOP" options={eventTypeOptions} />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>Tarix</span>
              <DatePicker name="eventDate" defaultValue={defaultDate} allowClear={false} required popoverPlacement="floating" />
            </label>
            <label className="form-field">
              <span>Saat</span>
              <Input name="startTime" defaultValue="19:00" pattern="\d{2}:\d{2}" required />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>Müddət</span>
              <FormSelect name="durationMinutes" defaultValue="120" options={durationOptions} />
            </label>
            <label className="form-field">
              <span>Status</span>
              <FormSelect name="status" defaultValue="SCHEDULED" options={eventStatusOptions} />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>Giriş qiyməti</span>
              <Input name="entryPrice" inputMode="decimal" placeholder="80" required />
            </label>
            <label className="form-field">
              <span>Tutum</span>
              <Input name="capacity" type="number" min={1} max={1000} placeholder="18" />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>Məkan</span>
              <Input name="room" placeholder="Workshop studio" maxLength={90} />
            </label>
            <label className="form-field">
              <span>Təlimçi</span>
              <Input name="instructor" placeholder="Təlimçi adı" maxLength={120} />
            </label>
          </div>
          <label className="form-field">
            <span>Qeyd</span>
            <textarea name="note" maxLength={700} placeholder="Materiallar, mövzu və xüsusi qeyd" />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={isPending}>
              Yarat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantDialog({
  data,
  activeEvent,
  action,
  disabled,
  onNotify,
}: {
  data: WorkshopData;
  activeEvent: WorkshopEventRow | null;
  action: WorkshopAction;
  disabled: boolean;
  onNotify: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [eventId, setEventId] = useState(activeEvent?.id ?? data.events[0]?.id ?? "");
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [isDiscounted, setIsDiscounted] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const selectedEvent = data.events.find((event) => event.id === eventId) ?? activeEvent ?? data.events[0];
  const selectedStudent = data.students.find((student) => student.id === studentId);
  const [listPrice, setListPrice] = useState(selectedEvent?.entryPriceInput ?? "");
  const [amountPaid, setAmountPaid] = useState(selectedEvent?.entryPriceInput ?? "");

  function syncEvent(nextEventId: string) {
    const nextEvent = data.events.find((event) => event.id === nextEventId);
    setEventId(nextEventId);
    setListPrice(nextEvent?.entryPriceInput ?? "");
    setAmountPaid(isGift ? "0" : nextEvent?.entryPriceInput ?? "");
  }

  function syncStudent(nextStudentId: string) {
    const student = data.students.find((item) => item.id === nextStudentId);
    setStudentId(nextStudentId);

    if (student) {
      setFullName(student.name);
      setPhone(student.phone);
    }
  }

  function toggleGift(nextValue: boolean) {
    setIsGift(nextValue);

    if (nextValue) {
      setIsPaid(false);
      setIsDiscounted(false);
      setAmountPaid("0");
      return;
    }

    setIsPaid(true);
    setAmountPaid(listPrice);
  }

  function togglePaid(nextValue: boolean) {
    setIsPaid(nextValue);

    if (!nextValue) {
      setIsDiscounted(false);
      setAmountPaid("0");
      return;
    }

    setIsGift(false);
    setAmountPaid(amountPaid === "0" ? listPrice : amountPaid);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        try {
          await action(formData);
          setOpen(false);
          setStudentId("");
          setFullName("");
          setPhone("");
          setIsPaid(true);
          setIsDiscounted(false);
          setIsGift(false);
          onNotify("İştirakçı assign edildi və gəlir yeniləndi.");
          router.refresh();
        } catch (error) {
          onNotify(error instanceof Error ? error.message : "İştirakçı əlavə etmək mümkün olmadı");
        }
      })();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && activeEvent?.id) {
          syncEvent(activeEvent.id);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>
          <UserPlus data-icon="inline-start" />
          İştirakçı yarat
        </Button>
      </DialogTrigger>
      <DialogContent className="workshop-dialog workshop-participant-dialog">
        <DialogHeader>
          <DialogTitle>İştirakçı yarat və assign et</DialogTitle>
          <DialogDescription>
            Mövcud tələbəni seç və ya iştirakçını əl ilə yaz, sonra ödəniş statusunu qeyd et.
          </DialogDescription>
        </DialogHeader>
        <form className="workshop-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Tədbir</span>
            <FormSelect
              name="eventId"
              value={eventId}
              onValueChange={syncEvent}
              options={data.eventOptions}
              searchable
              searchPlaceholder="Tədbir axtar..."
            />
          </label>
          <div className="field-grid">
            <label className="form-field">
              <span>Mövcud tələbə</span>
              <FormSelect
                name="studentId"
                value={studentId}
                onValueChange={syncStudent}
                emptyLabel="Yeni iştirakçı"
                options={data.students.map((student) => ({
                  value: student.id,
                  label: student.label,
                  searchText: [student.phone, student.program, student.teacher].join(" "),
                }))}
                searchable
                searchPlaceholder="Tələbə axtar..."
              />
            </label>
            <label className="form-field">
              <span>Ad soyad</span>
              <Input
                name="fullName"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder={selectedStudent?.name ?? "İştirakçı adı"}
                maxLength={140}
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>Telefon</span>
              <Input
                name="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="050 000 00 00"
                maxLength={40}
              />
            </label>
            <label className="form-field">
              <span>Ödəniş üsulu</span>
              <FormSelect name="paymentMethod" defaultValue="CASH" options={studentPaymentMethodOptions} />
            </label>
          </div>
          <div className="field-grid">
            <label className="form-field">
              <span>List qiyməti</span>
              <Input
                name="listPrice"
                value={listPrice}
                inputMode="decimal"
                onChange={(event) => setListPrice(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Ödənilən məbləğ</span>
              <Input
                name="amountPaid"
                value={amountPaid}
                inputMode="decimal"
                onChange={(event) => setAmountPaid(event.target.value)}
                disabled={isGift || !isPaid}
              />
            </label>
          </div>
          <div className="workshop-switch-grid">
            <SwitchField label="Ödəniş etdi" checked={isPaid} disabled={isGift} onCheckedChange={togglePaid} name="isPaid" />
            <SwitchField label="Endirimli ödəniş" checked={isDiscounted} disabled={isGift || !isPaid} onCheckedChange={setIsDiscounted} name="isDiscounted" />
            <SwitchField label="Hədiyyə kimi" checked={isGift} onCheckedChange={toggleGift} name="isGift" />
          </div>
          <label className="form-field">
            <span>Qeyd</span>
            <textarea name="note" maxLength={700} placeholder="Endirim səbəbi, hədiyyə qeydi və ya əlavə qeyd" />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={isPending || !eventId}>
              Assign et
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwitchField({
  label,
  checked,
  disabled,
  onCheckedChange,
  name,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  name: string;
}) {
  return (
    <label className={cx("workshop-switch", checked && "is-on", disabled && "is-disabled")}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span />
      <strong>{label}</strong>
    </label>
  );
}

function ParticipantTable({ participants }: { participants: WorkshopParticipantRow[] }) {
  return (
    <div className="workshop-table-wrap">
      <table className="workshop-table">
        <thead>
          <tr>
            <th>İştirakçı</th>
            <th>Ödəniş</th>
            <th>Status</th>
            <th>Metod</th>
            <th>Assign</th>
            <th>Qeyd</th>
          </tr>
        </thead>
        <tbody>
          {participants.length > 0 ? (
            participants.map((participant) => (
              <tr key={participant.id}>
                <td>
                  <div className="workshop-person-cell">
                    <strong>{participant.fullName}</strong>
                    <span>{participant.phone}</span>
                  </div>
                </td>
                <td>
                  <div className="workshop-money-cell">
                    <strong>{participant.amountPaid}</strong>
                    <span>List: {participant.listPrice}</span>
                  </div>
                </td>
                <td><StatusChip tone={participant.paymentTone}>{participant.paymentLabel}</StatusChip></td>
                <td>{participant.paymentMethod}</td>
                <td>{participant.assignedAt}</td>
                <td><span className="workshop-note">{participant.note || "-"}</span></td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>
                <div className="workshop-empty">Bu tədbir üzrə iştirakçı yoxdur</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RevenueBreakdown({
  event,
  participants,
}: {
  event: WorkshopEventRow;
  participants: WorkshopParticipantRow[];
}) {
  const paid = participants.filter((participant) => participant.isPaid && !participant.isGift);
  const gifts = participants.filter((participant) => participant.isGift);
  const discounted = participants.filter((participant) => participant.isDiscounted);

  return (
    <div className="workshop-revenue-view">
      <div className="workshop-revenue-card is-main">
        <span>Real qazanc</span>
        <strong>{event.revenue}</strong>
        <p>{paid.length} ödənişli iştirakçıdan yığılıb</p>
      </div>
      <div className="workshop-revenue-card">
        <span>Potensial</span>
        <strong>{event.potentialRevenue}</strong>
        <p>List qiyməti x iştirakçı sayı</p>
      </div>
      <div className="workshop-revenue-card">
        <span>Endirimli</span>
        <strong>{discounted.length}</strong>
        <p>Endirimli ödəniş kimi qeyd olunub</p>
      </div>
      <div className="workshop-revenue-card">
        <span>Hədiyyə</span>
        <strong>{gifts.length}</strong>
        <p>Gəlir hesabına daxil edilmir</p>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <article className={cx("workshop-kpi", `is-${tone}`)}>
      <div className="workshop-kpi-top">
        <span>{label}</span>
        <Icon size={14} />
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function PanelHead({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="workshop-panel-head">
      <div>
        <span>{subtitle}</span>
        <h2>{title}</h2>
      </div>
      <Icon size={18} />
    </div>
  );
}

function DetailStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={cx("workshop-detail-stat", strong && "is-strong")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("az")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ə]/g, "e")
    .replace(/[ı]/g, "i")
    .replace(/[ş]/g, "s")
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ö]/g, "o")
    .replace(/[ü]/g, "u")
    .trim();
}
