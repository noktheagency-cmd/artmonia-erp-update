"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Filter,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserPlus,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import type { WorkshopData, WorkshopEventRow } from "@/modules/workshops/queries";

type WorkshopAction = (formData: FormData) => unknown | Promise<unknown>;

const metricIcons: LucideIcon[] = [TrendingUp, WalletCards, Banknote, UsersRound];
const eventTypeOptions = [
  { value: "WORKSHOP", label: "Workshop" },
  { value: "MASTERCLASS", label: "Masterclass" },
] as const;
const eventStatusOptions = [
  { value: "SCHEDULED", label: "Planlı" },
  { value: "DRAFT", label: "Qaralama" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
] as const;
const durationOptions = [90, 120, 180, 240].map((value) => ({
  value: String(value),
  label: `${value} dəq`,
}));

export function WorkshopWorkspace({
  data,
  createWorkshopEventAction,
}: {
  data: WorkshopData;
  createWorkshopEventAction: WorkshopAction;
}) {
  const [mobilePreviewId, setMobilePreviewId] = useState<string | null>(null);
  const mobilePreviewEvent = data.events.find((event) => event.id === mobilePreviewId) ?? null;
  return (
    <section className="workshop-shell" aria-label="Workshop və Masterclass idarəetməsi">
      <header className="workshop-topbar">
        <div>
          <h1>Workshop &amp; Masterclass</h1>
          <p>Tədbirləri, iştirakçıları və daxili maliyyəni vahid iş sahəsində idarə et.</p>
        </div>
        <div className="workshop-topbar-actions">
          {data.selectedEvent && data.permissions.canManage ? (
            <Link
              className="ui-button ui-button-outline ui-button-default"
              href={`/workshops/${data.selectedEvent.id}?tab=participants&add=1` as Route}
            >
              <UserPlus data-icon="inline-start" />
              İştirakçı əlavə et
            </Link>
          ) : null}
          <CreateEventDialog
            defaultDate={data.defaultDate}
            action={createWorkshopEventAction}
            disabled={!data.permissions.canManage}
          />
        </div>
      </header>

      <div className="workshop-kpis" aria-label="Workshop göstəriciləri">
        {data.kpis.map((kpi, index) => (
          <Metric key={kpi.label} icon={metricIcons[index] ?? Sparkles} {...kpi} />
        ))}
      </div>

      <FilterPanel data={data} />

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

          <div className="workshop-table-scroll">
            <table className="workshop-data-table">
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
                    selected={data.selectedEvent?.id === event.id}
                    href={buildWorkshopUrl(data, { selected: event.id })}
                    showFinance={data.permissions.canViewFinance}
                    onPreview={() => setMobilePreviewId(event.id)}
                  />
                )) : (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState title="Uyğun tədbir tapılmadı" description="Filtrləri sıfırlayın və ya yeni tədbir yaradın." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination data={data} />
        </section>

        <aside className="workshop-preview-panel">
          {data.selectedEvent ? (
            <EventPreview event={data.selectedEvent} data={data} />
          ) : (
            <EmptyState title="Tədbir seçilməyib" description="Siyahıdan bir tədbir seçərək detalları görün." />
          )}
        </aside>
      </div>

      <Dialog open={Boolean(mobilePreviewEvent)} onOpenChange={(open) => !open && setMobilePreviewId(null)}>
        <DialogContent className="workshop-mobile-preview-sheet">
          <DialogHeader className="sr-only">
            <DialogTitle>Tədbir önizləməsi</DialogTitle>
            <DialogDescription>Seçilmiş workshop və ya masterclass detalları</DialogDescription>
          </DialogHeader>
          {mobilePreviewEvent ? <EventPreview event={mobilePreviewEvent} data={data} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FilterPanel({ data }: { data: WorkshopData }) {
  const [expanded, setExpanded] = useState(data.filters.activeCount > 1);
  return (
    <section className="workshop-filter-panel">
      <form method="get" action="/workshops" className="workshop-filter-form">
        <div className="workshop-filter-primary">
          <InputGroup className="workshop-search-group">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              name="q"
              defaultValue={data.filters.query}
              placeholder="Tədbir, təlimçi, məkan və iştirakçı axtar"
              aria-label="Tədbir axtar"
            />
          </InputGroup>
          <Button type="button" variant="outline" onClick={() => setExpanded((value) => !value)}>
            <Filter data-icon="inline-start" />
            Filtrlər
            <span className="workshop-filter-count">{data.filters.activeCount}</span>
            <ChevronDown data-icon="inline-end" />
          </Button>
          <Button type="submit">Tətbiq et</Button>
        </div>

        {expanded ? (
          <div className="workshop-filter-grid">
            <FilterSelect name="type" label="Növ" value={data.filters.type} options={[
              { value: "all", label: "Hamısı" }, ...eventTypeOptions,
            ]} />
            <FilterSelect name="status" label="Status" value={data.filters.status} options={[
              { value: "all", label: "Hamısı" }, ...eventStatusOptions,
            ]} />
            <FilterDate name="from" label="Başlanğıc" value={data.filters.from} />
            <FilterDate name="to" label="Son tarix" value={data.filters.to} />
            <FilterSelect name="collection" label="Ödəniş statusu" value={data.filters.collection} options={[
              { value: "all", label: "Hamısı" },
              { value: "unpaid", label: "Ödənilməyib" },
              { value: "advance", label: "Avans" },
              { value: "paid", label: "Tam ödənilib" },
              { value: "gift", label: "Hədiyyə var" },
            ]} />
            <FilterSelect name="profitability" label="Mənfəət" value={data.filters.profitability} options={[
              { value: "all", label: "Hamısı" },
              { value: "profit", label: "Mənfəətli" },
              { value: "loss", label: "Zərər" },
              { value: "breakeven", label: "Balans" },
            ]} />
            <FilterSelect name="instructor" label="Təlimçi" value={data.filters.instructor} options={[
              { value: "", label: "Hamısı" }, ...data.filterOptions.instructors,
            ]} />
            <FilterSelect name="room" label="Məkan" value={data.filters.room} options={[
              { value: "", label: "Hamısı" }, ...data.filterOptions.rooms,
            ]} />
            <FilterSelect name="sort" label="Sıralama" value={data.filters.sort} options={[
              { value: "upcoming", label: "Yaxın tarix" },
              { value: "newest", label: "Ən yeni" },
              { value: "revenue", label: "Dövriyyə" },
              { value: "expense", label: "Xərc" },
              { value: "profit", label: "Mənfəət" },
              { value: "participants", label: "İştirakçı" },
            ]} />
            <FilterSelect name="pageSize" label="Səhifədə" value={String(data.filters.pageSize)} options={
              [10, 25, 50, 100].map((value) => ({ value: String(value), label: String(value) }))
            } />
            <Link href="/workshops" className="workshop-reset-link">
              <X /> Filtrləri sıfırla
            </Link>
          </div>
        ) : null}
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

function FilterDate({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="workshop-filter-field">
      <span>{label}</span>
      <input type="date" name={name} defaultValue={value} />
    </label>
  );
}

function EventRow({ event, selected, href, showFinance, onPreview }: {
  event: WorkshopEventRow;
  selected: boolean;
  href: Route;
  showFinance: boolean;
  onPreview: () => void;
}) {
  return (
    <tr className={selected ? "is-selected" : undefined}>
      <td>
        <Link href={href} className="workshop-event-link workshop-event-link-desktop" aria-current={selected ? "true" : undefined}>
          <span className="workshop-selected-dot" />
          <span><strong>{event.title}</strong><small>{event.instructor}</small></span>
        </Link>
        <button type="button" className="workshop-event-link workshop-event-link-mobile" onClick={onPreview}>
          <span className="workshop-selected-dot" />
          <span><strong>{event.title}</strong><small>{event.instructor}</small></span>
        </button>
      </td>
      <td><span className={`workshop-type-tag is-${event.eventType.toLowerCase()}`}>{event.eventTypeLabel}</span></td>
      <td><strong>{event.date}</strong><small>{event.time}</small></td>
      <td><span className="workshop-inline-meta"><MapPin />{event.room}</span></td>
      <td>{event.participantCount}{event.capacity ? `/${event.capacity}` : ""}</td>
      {showFinance ? <td>{event.revenue}</td> : null}
      {showFinance ? <td>{event.expense}</td> : null}
      {showFinance ? <td><strong className={event.netProfitValue < 0 ? "is-negative" : "is-positive"}>{event.netProfit}</strong></td> : null}
    </tr>
  );
}

function EventPreview({ event, data }: { event: WorkshopEventRow; data: WorkshopData }) {
  return (
    <>
      <div className="workshop-preview-head">
        <div>
          <div className="workshop-preview-labels">
            <span>{event.eventTypeLabel}</span>
            <StatusChip tone={event.statusTone}>{event.statusLabel}</StatusChip>
          </div>
          <h2>{event.title}</h2>
          <p>{event.date}, {event.time} · {event.room}</p>
        </div>
        <Link href={`/workshops/${event.id}` as Route} className="workshop-close-preview" aria-label="Ətraflı bax">
          <ArrowRight />
        </Link>
      </div>

      {data.permissions.canViewFinance ? (
        <div className="workshop-preview-finance">
          <PreviewMetric label="Dövriyyə" value={event.revenue} />
          <PreviewMetric label="Xərclər" value={event.expense} />
          <PreviewMetric label="Xalis mənfəət" value={event.netProfit} positive={event.netProfitValue >= 0} />
        </div>
      ) : null}

      <div className="workshop-capacity-block">
        <div><span>Tutum</span><strong>{event.participantCount}{event.capacity ? ` / ${event.capacity}` : ""}</strong></div>
        <div className="workshop-progress"><span style={{ width: `${event.fillRate}%` }} /></div>
        <div className="workshop-capacity-legend">
          <span><i className="is-paid" />Ödənilib {event.paidCount}</span>
          <span><i className="is-advance" />Avans {event.advanceCount}</span>
          <span><i className="is-unpaid" />Gözləyir {event.unpaidCount}</span>
          <span><i className="is-gift" />Hədiyyə {event.giftCount}</span>
        </div>
      </div>

      <div className="workshop-preview-actions">
        {data.permissions.canManageFinance ? (
          <Link className="ui-button ui-button-default ui-button-default" href={`/workshops/${event.id}?tab=payments&add=1` as Route}>
            <WalletCards data-icon="inline-start" /> Ödəniş qəbul et
          </Link>
        ) : null}
        {data.permissions.canManageFinance ? (
          <Link className="ui-button ui-button-outline ui-button-default" href={`/workshops/${event.id}?tab=expenses&add=1` as Route}>
            <CircleDollarSign data-icon="inline-start" /> Xərc əlavə et
          </Link>
        ) : null}
      </div>

      <div className="workshop-preview-grid">
        <div><span>Giriş qiyməti</span><strong>{event.entryPrice}</strong></div>
        <div><span>Gözlənilən ödəniş</span><strong>{event.expected}</strong></div>
        <div><span>Təlimçi</span><strong>{event.instructor}</strong></div>
        <div><span>Müddət</span><strong>{event.duration}</strong></div>
      </div>

      <Link className="workshop-detail-link" href={`/workshops/${event.id}` as Route}>
        Ətraflı bax <ArrowRight />
      </Link>
    </>
  );
}

function PreviewMetric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div><span>{label}</span><strong className={positive ? "is-positive" : undefined}>{value}</strong></div>;
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

function CreateEventDialog({ defaultDate, action, disabled }: {
  defaultDate: string;
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
      void Promise.resolve(action(formData)).then(() => {
        setOpen(false);
        form.reset();
        router.refresh();
      }).catch((error) => setNotice(error instanceof Error ? error.message : "Tədbir yaradıla bilmədi"));
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}><Plus data-icon="inline-start" />Yeni tədbir</Button>
      </DialogTrigger>
      <DialogContent className="workshop-dialog">
        <DialogHeader>
          <DialogTitle>Yeni workshop / masterclass</DialogTitle>
          <DialogDescription>Tədbirin əsas detallarını və satış qiymətini daxil edin.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="workshop-dialog-form">
          <FieldGroup>
            <div className="workshop-form-grid">
              <Field><FieldLabel htmlFor="event-title">Tədbir adı</FieldLabel><Input id="event-title" name="title" required /></Field>
              <Field><FieldLabel>Növ</FieldLabel><FormSelect name="eventType" defaultValue="WORKSHOP" options={eventTypeOptions} /></Field>
              <Field><FieldLabel>Tarix</FieldLabel><DatePicker name="eventDate" defaultValue={defaultDate} required allowClear={false} popoverPlacement="floating" /></Field>
              <Field><FieldLabel htmlFor="event-time">Saat</FieldLabel><Input id="event-time" name="startTime" defaultValue="19:00" required /></Field>
              <Field><FieldLabel>Müddət</FieldLabel><FormSelect name="durationMinutes" defaultValue="120" options={durationOptions} /></Field>
              <Field><FieldLabel>Status</FieldLabel><FormSelect name="status" defaultValue="SCHEDULED" options={eventStatusOptions} /></Field>
              <Field><FieldLabel htmlFor="event-price">Giriş qiyməti</FieldLabel><Input id="event-price" name="entryPrice" inputMode="decimal" defaultValue="0" required /></Field>
              <Field><FieldLabel htmlFor="event-capacity">Tutum</FieldLabel><Input id="event-capacity" name="capacity" type="number" min={1} /></Field>
              <Field><FieldLabel htmlFor="event-room">Məkan</FieldLabel><Input id="event-room" name="room" /></Field>
              <Field><FieldLabel htmlFor="event-instructor">Təlimçi</FieldLabel><Input id="event-instructor" name="instructor" /></Field>
            </div>
            <Field><FieldLabel htmlFor="event-note">Qeyd</FieldLabel><textarea id="event-note" name="note" rows={3} /></Field>
          </FieldGroup>
          {notice ? <p className="workshop-form-error" role="alert">{notice}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button>
            <Button disabled={pending}>{pending ? "Yaradılır..." : "Tədbir yarat"}</Button>
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
    q: data.filters.query,
    type: data.filters.type,
    status: data.filters.status,
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
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value);
  });
  return `/workshops?${params.toString()}` as Route;
}

function sortLabel(value: WorkshopData["filters"]["sort"]) {
  return ({ upcoming: "Yaxın tarix", newest: "Ən yeni", revenue: "Dövriyyə", expense: "Xərc", profit: "Mənfəət", participants: "İştirakçı" } as const)[value];
}
