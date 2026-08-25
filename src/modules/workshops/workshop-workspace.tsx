"use client";

import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Activity,
  Banknote,
  CalendarDays,
  CircleCheckBig,
  Info,
  MapPin,
  Plus,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult, type ActionResult } from "@/lib/action-result";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type { WorkshopOfferAudience, WorkshopOfferInput, WorkshopOfferResult } from "@/modules/workshops/offer-actions";
import { WorkshopOfferDialog } from "@/modules/workshops/workshop-offer-dialog";
import type { WorkshopData, WorkshopEventRow, WorkshopFollowUpRow, WorkshopFollowUpStatus } from "@/modules/workshops/queries";

type WorkshopAction = (formData: FormData) => unknown | Promise<unknown>;

const metricIcons: LucideIcon[] = [Activity, CircleCheckBig, TrendingUp, WalletCards, Banknote, UsersRound];
const eventStatusOptions = [
  { value: "SCHEDULED", label: "Planlı" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "DRAFT", label: "Qaralama" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
] as const;
const durationOptions = [90, 120, 180, 240].map((value) => ({
  value: String(value),
  label: `${value} dəq`,
}));
const followUpStatusOptions: Array<{ value: WorkshopFollowUpStatus; label: string }> = [
  { value: "PENDING", label: "Gözləyir" },
  { value: "CONTACTED", label: "Əlaqə saxlanılıb" },
  { value: "NO_ANSWER", label: "Cavab yoxdur" },
  { value: "INTERESTED", label: "Maraqlanır" },
  { value: "CONVERTED", label: "Nəticələnib" },
  { value: "NOT_INTERESTED", label: "Maraqlanmır" },
];

export function WorkshopWorkspace({
  data,
  createWorkshopEventAction,
  updateWorkshopFollowUpAction,
  loadOfferAudienceAction,
  generateOfferAction,
}: {
  data: WorkshopData;
  createWorkshopEventAction: WorkshopAction;
  updateWorkshopFollowUpAction: WorkshopAction;
  loadOfferAudienceAction: () => Promise<ActionResult<WorkshopOfferAudience>>;
  generateOfferAction: (
    input: WorkshopOfferInput,
  ) => Promise<ActionResult<WorkshopOfferResult>>;
}) {
  return (
    <section className="workshop-shell" aria-label="Workshop və Masterclass idarəetməsi">
      <header className="workshop-topbar">
        <div>
          <h1>Workshop &amp; Masterclass</h1>
          <p>Tədbirləri, iştirakçıları və daxili maliyyəni vahid iş sahəsində idarə et.</p>
        </div>
        <div className="workshop-topbar-actions">
          {data.permissions.canManage ? (
            <WorkshopOfferDialog
              loadAudienceAction={loadOfferAudienceAction}
              generateOfferAction={generateOfferAction}
            />
          ) : null}
          <CreateEventDialog
            defaultDate={data.defaultDate}
            eventTypes={data.filterOptions.types}
            action={createWorkshopEventAction}
            disabled={!data.permissions.canManage}
          />
        </div>
      </header>

      <nav className="workshop-module-tabs" aria-label="Workshop bölmələri">
        <Link href="/workshops" className={data.filters.view === "events" ? "is-active" : undefined}>Tədbirlər</Link>
        {data.permissions.canViewFollowUp ? (
          <Link href="/workshops?view=follow-up" className={data.filters.view === "follow-up" ? "is-active" : undefined}>Follow-up</Link>
        ) : null}
      </nav>

      {data.filters.view === "follow-up" ? (
        <WorkshopFollowUpSection data={data} action={updateWorkshopFollowUpAction} />
      ) : (
        <>
          <div className="workshop-kpis" aria-label="Workshop göstəriciləri">
            {data.kpis.map((kpi, index) => (
              <Metric key={kpi.label} icon={metricIcons[index] ?? Sparkles} {...kpi} />
            ))}
          </div>

          <CompactFilterPanel data={data} />

          <div className="workshop-command-layout">
            <section className="workshop-event-table-panel">
          <div className="workshop-section-head">
            <div>
              <span>{data.pagination.total} nəticə</span>
              <h2>Tədbirlər</h2>
            </div>
            <span className="workshop-sort-label">
              <SlidersHorizontal />
              {sortLabel(data.filters.sort)}
            </span>
          </div>

          <div className="workshop-table-scroll" data-erp-table-scroll="">
            <table className="workshop-data-table is-event-list" data-erp-table="" data-erp-sticky-first="">
              <colgroup>
                <col className="workshop-event-column" />
                <col className="workshop-type-column" />
                <col className="workshop-date-column" />
                <col className="workshop-venue-column" />
                <col className="workshop-capacity-column" />
                {data.permissions.canViewFinance ? <col className="workshop-money-column" /> : null}
                {data.permissions.canViewFinance ? <col className="workshop-money-column" /> : null}
                {data.permissions.canViewFinance ? <col className="workshop-profit-column" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th>Tədbir</th>
                  <th>Növ</th>
                  <th>Tarix</th>
                  <th>Məkan</th>
                  <th>Tutum</th>
                  {data.permissions.canViewFinance ? <th>Dövriyyə</th> : null}
                  {data.permissions.canViewFinance ? <th>Xərclər</th> : null}
                  {data.permissions.canViewFinance ? <th>Xalis mənfəət</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.events.length > 0 ? data.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    href={`/workshops/${event.id}` as Route}
                    showFinance={data.permissions.canViewFinance}
                  />
                )) : (
                  <tr>
                    <td colSpan={data.permissions.canViewFinance ? 8 : 5}>
                      <EmptyState title="Uyğun tədbir tapılmadı" description="Filtrləri sıfırlayın və ya yeni tədbir yaradın." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

              <Pagination data={data} />
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function WorkshopFollowUpSection({ data, action }: { data: WorkshopData; action: WorkshopAction }) {
  const summaryCards = [
    { label: "Ümumi", value: data.followUpSummary.total, helper: "Aktiv iştirakçı", tone: "info" as const },
    { label: "Gözləyir", value: data.followUpSummary.pending, helper: "İlk əlaqə gözləyir", tone: "warning" as const },
    { label: "Vaxtı çatıb", value: data.followUpSummary.due, helper: "Planlanan vaxt keçib", tone: "danger" as const },
    { label: "Maraqlanır", value: data.followUpSummary.interested, helper: "Aktiv fürsət", tone: "success" as const },
    { label: "Nəticələnib", value: data.followUpSummary.converted, helper: "Uğurlu nəticə", tone: "success" as const },
  ];

  return (
    <div className="workshop-follow-up-workspace">
      <div className="workshop-kpis workshop-follow-up-kpis" aria-label="Workshop follow-up göstəriciləri">
        {summaryCards.map((card, index) => (
          <Metric key={card.label} icon={metricIcons[index] ?? UsersRound} label={card.label} value={String(card.value)} helper={card.helper} tone={card.tone} />
        ))}
      </div>

      <section className="workshop-filter-panel">
        <form method="get" action="/workshops" className="workshop-follow-up-filter">
          <input type="hidden" name="view" value="follow-up" />
          <Input name="followUpQ" defaultValue={data.filters.followUpQuery} placeholder="İştirakçı, telefon, e-poçt və ya tədbir axtar" />
          <select name="followUpStatus" defaultValue={data.filters.followUpStatus} aria-label="Follow-up statusu">
            <option value="all">Bütün statuslar</option>
            {followUpStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button type="submit">Tətbiq et</Button>
          <Link href="/workshops?view=follow-up" className="workshop-reset-link">Sıfırla</Link>
        </form>
      </section>

      <section className="workshop-event-table-panel">
        <div className="workshop-section-head">
          <div><span>{data.followUpPagination.total} nəticə</span><h2>İştirakçı follow-up</h2></div>
          <span className="workshop-sort-label"><UsersRound />Workshop datası</span>
        </div>
        <div className="workshop-table-scroll" data-erp-table-scroll="">
          <table className="workshop-data-table workshop-follow-up-table" data-erp-table="" data-erp-sticky-first="">
            <thead>
              <tr>
                <th>İştirakçı</th>
                <th>Tədbir</th>
                <th>Əlaqə</th>
                <th>Status</th>
                <th>Növbəti follow-up</th>
                <th>Məsul</th>
                <th>Son əlaqə</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.followUps.length > 0 ? data.followUps.map((row) => (
                <tr key={row.participantId}>
                  <td><strong>{row.fullName}</strong><small>{row.participantKind === "student" ? "Tələbə" : "Qonaq"}</small></td>
                  <td><Link href={`/workshops/${row.eventId}?tab=participants` as Route} className="workshop-event-link-inline">{row.eventTitle}</Link><small>{row.eventDate}</small></td>
                  <td><strong>{row.phone}</strong><small>{row.email}</small></td>
                  <td><StatusChip tone={row.statusTone}>{row.statusLabel}</StatusChip></td>
                  <td>{row.nextFollowUpAt}</td>
                  <td>{row.assignedToName}</td>
                  <td>{row.lastContactedAt}</td>
                  <td>{data.permissions.canManage ? <WorkshopFollowUpDialog row={row} assignees={data.followUpAssignees} action={action} /> : null}</td>
                </tr>
              )) : (
                <tr><td colSpan={8}><EmptyState title="Follow-up qeydi tapılmadı" description="Filtrləri dəyişin və ya workshop-a iştirakçı əlavə edin." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <FollowUpPagination data={data} />
      </section>
    </div>
  );
}

function WorkshopFollowUpDialog({ row, assignees, action }: {
  row: WorkshopFollowUpRow;
  assignees: Array<{ value: string; label: string }>;
  action: WorkshopAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(() => {
      void Promise.resolve(action(new FormData(form))).then((result) => {
        unwrapActionResult(result);
        setOpen(false);
        router.refresh();
      }).catch((error) => setNotice(notifyCaughtError(error, "Follow-up yenilənə bilmədi", "Follow-up yenilənmədi")));
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline">Yenilə</Button></DialogTrigger>
      <DialogContent className="workshop-dialog">
        <DialogHeader>
          <DialogTitle>{row.fullName} — Follow-up</DialogTitle>
          <DialogDescription>{row.eventTitle} iştirakçısının ayrıca workshop follow-up məlumatını yeniləyin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="workshop-dialog-form">
          <input type="hidden" name="participantId" value={row.participantId} />
          <FieldGroup>
            <div className="workshop-form-grid">
              <Field><FieldLabel>Status</FieldLabel><FormSelect name="status" defaultValue={row.status} options={followUpStatusOptions} /></Field>
              <Field><FieldLabel htmlFor={`follow-up-date-${row.participantId}`}>Növbəti follow-up</FieldLabel><Input id={`follow-up-date-${row.participantId}`} name="nextFollowUpAt" type="datetime-local" defaultValue={row.nextFollowUpAtInput} /></Field>
              <Field className="workshop-field-span-2"><FieldLabel>Məsul əməkdaş</FieldLabel><FormSelect name="assignedToId" defaultValue={row.assignedToId || "UNASSIGNED"} options={[{ value: "UNASSIGNED", label: "Təyin edilməyib" }, ...assignees]} /></Field>
              <Field className="workshop-field-span-2"><FieldLabel htmlFor={`follow-up-note-${row.participantId}`}>Qeyd</FieldLabel><textarea id={`follow-up-note-${row.participantId}`} name="note" rows={4} defaultValue={row.note} placeholder="Danışıq nəticəsi və növbəti addım" /></Field>
            </div>
          </FieldGroup>
          {notice ? <p className="workshop-form-error" role="alert">{notice}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Saxlanılır..." : "Saxla"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompactFilterPanel({ data }: { data: WorkshopData }) {
  return (
    <section className="workshop-filter-panel">
      <form
        method="get"
        action="/workshops"
        className="workshop-filter-form"
      >
        {data.filters.dateRange === "all" ? <input type="hidden" name="dateRange" value="all" /> : null}
        {data.filters.dateRange !== "all" ? <input type="hidden" name="from" value={data.filters.from} /> : null}
        {data.filters.dateRange !== "all" ? <input type="hidden" name="to" value={data.filters.to} /> : null}
        <div className="workshop-filter-primary workshop-filter-primary-compact">
          <Link
            href={buildWorkshopUrl(data, { dateRange: "all", from: "", to: "", page: "1" })}
            className={`workshop-all-dates-link${data.filters.dateRange === "all" ? " is-active" : ""}`}
            aria-current={data.filters.dateRange === "all" ? "page" : undefined}
            title="Bütün tarixlər üzrə tədbirləri göstər"
          >
            Ümumi
          </Link>
          <FilterSelect
            name="type"
            label="Tədbir tipi"
            value={data.filters.type}
            options={[{ value: "all", label: "Hamısı" }, ...data.filterOptions.types]}
          />
          <FilterSelect
            name="status"
            label="Status"
            value={data.filters.status}
            options={[{ value: "all", label: "Hamısı" }, ...eventStatusOptions]}
          />
          <Button type="submit">Tətbiq et</Button>
          <Link href="/workshops" className="workshop-reset-link">Sıfırla</Link>
        </div>
      </form>
    </section>
  );
}

function FilterSelect({ name, label, value, options }: {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <label className="workshop-filter-field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {options.map((option) => <option key={`${name}-${option.value}`} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function EventRow({ event, href, showFinance }: {
  event: WorkshopEventRow;
  href: Route;
  showFinance: boolean;
}) {
  return (
    <tr>
      <td>
        <Link href={href} className="workshop-event-link">
          <span className="workshop-event-poster">
            {event.posterUrl ? (
              <Image src={event.posterUrl} alt="" width={48} height={60} unoptimized />
            ) : (
              <CalendarDays aria-hidden="true" />
            )}
          </span>
          <span><strong>{event.title}</strong><small>{event.instructor}</small></span>
        </Link>
      </td>
      <td><span className={`workshop-type-tag ${getEventTypeClassName(event.eventTypeKind, event.eventType)}`}>{event.eventTypeLabel}</span></td>
      <td><strong>{event.date}</strong><small>{event.time}</small></td>
      <td><span className="workshop-inline-meta"><MapPin />{event.room}</span></td>
      <td>{event.participantCount}{event.capacity ? `/${event.capacity}` : ""}</td>
      {showFinance ? <td>{event.revenue}</td> : null}
      {showFinance ? <td>{event.expense}</td> : null}
      {showFinance ? <td><strong className={event.netProfitValue < 0 ? "is-negative" : "is-positive"}>{event.netProfit}</strong></td> : null}
    </tr>
  );
}

function Metric({ icon: Icon, label, value, helper, tone }: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  return (
    <article className={`workshop-metric is-${tone}`}>
      <div className="workshop-metric-icon"><Icon /></div>
      <div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>
    </article>
  );
}

function Pagination({ data }: { data: WorkshopData }) {
  const { pagination } = data;
  if (pagination.totalPages <= 1) return <div className="workshop-pagination"><span>Cəmi {pagination.total} tədbir</span></div>;
  return (
    <div className="workshop-pagination">
      <span>Cəmi {pagination.total} tədbir</span>
      <div>
        {pagination.hasPrevious ? (
          <Link aria-label="Əvvəlki səhifə" href={buildWorkshopUrl(data, { page: String(pagination.page - 1) })}><ArrowLeft /></Link>
        ) : <span className="is-disabled"><ArrowLeft /></span>}
        <strong>{pagination.page}</strong>
        <span>/ {pagination.totalPages}</span>
        {pagination.hasNext ? (
          <Link aria-label="Növbəti səhifə" href={buildWorkshopUrl(data, { page: String(pagination.page + 1) })}><ArrowRight /></Link>
        ) : <span className="is-disabled"><ArrowRight /></span>}
      </div>
    </div>
  );
}

function FollowUpPagination({ data }: { data: WorkshopData }) {
  const pagination = data.followUpPagination;
  if (pagination.totalPages <= 1) return <div className="workshop-pagination"><span>Cəmi {pagination.total} iştirakçı</span></div>;
  return (
    <div className="workshop-pagination">
      <span>Cəmi {pagination.total} iştirakçı</span>
      <div>
        {pagination.hasPrevious ? (
          <Link aria-label="Əvvəlki səhifə" href={buildWorkshopUrl(data, { view: "follow-up", page: String(pagination.page - 1) })}><ArrowLeft /></Link>
        ) : <span className="is-disabled"><ArrowLeft /></span>}
        <strong>{pagination.page}</strong>
        <span>/ {pagination.totalPages}</span>
        {pagination.hasNext ? (
          <Link aria-label="Növbəti səhifə" href={buildWorkshopUrl(data, { view: "follow-up", page: String(pagination.page + 1) })}><ArrowRight /></Link>
        ) : <span className="is-disabled"><ArrowRight /></span>}
      </div>
    </div>
  );
}

function CreateEventDialog({ defaultDate, eventTypes, action, disabled }: {
  defaultDate: string;
  eventTypes: Array<{ value: string; label: string }>;
  action: WorkshopAction;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(() => {
      void Promise.resolve(action(formData)).then((result) => {
        unwrapActionResult(result);
        setOpen(false);
        form.reset();
        router.refresh();
      }).catch((error) => setNotice(notifyCaughtError(error, "Tədbir yaradıla bilmədi", "Tədbir yaradılmadı")));
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}><Plus data-icon="inline-start" />Yeni tədbir</Button>
      </DialogTrigger>
      <DialogContent className="workshop-dialog workshop-create-dialog">
        <DialogHeader className="workshop-dialog-header">
          <div className="workshop-dialog-heading">
            <span className="workshop-dialog-icon" aria-hidden="true"><CalendarDays /></span>
            <div>
              <DialogTitle>Yeni workshop / masterclass</DialogTitle>
              <DialogDescription>Tədbirin əsas detallarını və satış qiymətini daxil edin.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="workshop-dialog-callout"><Info aria-hidden="true" />Yaratdıqdan sonra bütün məlumatları redaktə edə bilərsiniz.</div>
        <form onSubmit={submit} className="workshop-dialog-form workshop-create-form">
          <FieldGroup>
            <div className="workshop-form-grid">
              <Field className="workshop-field-span-2"><FieldLabel htmlFor="event-title">Tədbir adı</FieldLabel><Input id="event-title" name="title" placeholder="Məsələn: Rəqəmsal marketinq masterclass" required /></Field>
              <Field>
                <FieldLabel>Növ / kateqoriya</FieldLabel>
                <FormSelect
                  name="eventType"
                  defaultValue="WORKSHOP"
                  options={eventTypes}
                  searchable
                  searchPlaceholder="Tip seçin və ya yenisini yazın"
                  catalogKey="WORKSHOP_EVENT_TYPE"
                  createLabel="Yeni tip əlavə et"
                />
              </Field>
              <Field><FieldLabel>Tarix</FieldLabel><DatePicker name="eventDate" defaultValue={defaultDate} required allowClear={false} popoverPlacement="floating" /></Field>
              <Field><FieldLabel htmlFor="event-time">Saat</FieldLabel><Input id="event-time" name="startTime" defaultValue="19:00" required /></Field>
              <Field><FieldLabel>Müddət</FieldLabel><FormSelect name="durationMinutes" defaultValue="120" options={durationOptions} /></Field>
              <Field><FieldLabel>Status</FieldLabel><FormSelect name="status" defaultValue="SCHEDULED" options={eventStatusOptions} /></Field>
              <Field><FieldLabel htmlFor="event-price">Giriş qiyməti</FieldLabel><Input id="event-price" name="entryPrice" inputMode="decimal" defaultValue="0" required /></Field>
              <Field><FieldLabel htmlFor="event-capacity">Tutum</FieldLabel><Input id="event-capacity" name="capacity" type="number" min={1} /></Field>
              <Field className="workshop-field-span-2"><FieldLabel htmlFor="event-room">Məkan</FieldLabel><Input id="event-room" name="room" placeholder="Məsələn: Artmonia Ofis, Bakı" /></Field>
              <Field><FieldLabel htmlFor="event-instructor">Təlimçi</FieldLabel><Input id="event-instructor" name="instructor" placeholder="Təlimçinin adı" /></Field>
              <Field className="workshop-field-span-2">
                <FieldLabel htmlFor="event-poster">Tədbir posteri</FieldLabel>
                <Input id="event-poster" name="poster" type="file" accept="image/jpeg,image/png,image/webp" />
              </Field>
            </div>
            <Field><FieldLabel htmlFor="event-note">Qeyd</FieldLabel><textarea id="event-note" name="note" rows={3} placeholder="Əlavə qeydlər və ya xüsusi məlumatlar..." /></Field>
          </FieldGroup>
          {notice ? <p className="workshop-form-error" role="alert">{notice}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button>
            <Button type="submit" disabled={pending}>{pending ? "Yaradılır..." : "Tədbir yarat"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="workshop-empty-state"><CalendarDays /><strong>{title}</strong><p>{description}</p></div>;
}

function buildWorkshopUrl(data: WorkshopData, overrides: Record<string, string>): Route {
  const params = new URLSearchParams();
  const values: Record<string, string> = {
    view: data.filters.view,
    q: data.filters.query,
    type: data.filters.type,
    status: data.filters.status,
    dateRange: data.filters.dateRange === "all" ? "all" : "",
    from: data.filters.from,
    to: data.filters.to,
    instructor: data.filters.instructor,
    room: data.filters.room,
    collection: data.filters.collection,
    profitability: data.filters.profitability,
    sort: data.filters.sort,
    page: String(data.filters.page),
    pageSize: String(data.filters.pageSize),
    selected: data.filters.selected,
    followUpQ: data.filters.followUpQuery,
    followUpStatus: data.filters.followUpStatus,
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value && (key === "dateRange" || value !== "all")) params.set(key, value);
  });
  return `/workshops?${params.toString()}` as Route;
}

function sortLabel(value: WorkshopData["filters"]["sort"]) {
  return ({ upcoming: "Yaxın tarix", newest: "Ən yeni", revenue: "Dövriyyə", expense: "Xərc", profit: "Mənfəət", participants: "İştirakçı" } as const)[value];
}

function getEventTypeClassName(kind: WorkshopEventRow["eventTypeKind"], value: string) {
  if (value !== "WORKSHOP" && value !== "MASTERCLASS") return "is-custom";
  if (kind === "MASTERCLASS") return "is-masterclass";
  if (kind === "WORKSHOP") return "is-workshop";
  return "is-custom";
}
