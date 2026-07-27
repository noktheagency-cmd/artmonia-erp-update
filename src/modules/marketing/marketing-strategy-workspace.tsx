"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Edit3,
  FileImage,
  Info,
  Megaphone,
  Plus,
  ReceiptText,
  Target,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";
import {
  addMarketingStrategyExpenseAction,
  saveMarketingStrategyAction,
} from "@/modules/marketing/strategy-actions";
import type {
  MarketingStrategyData,
  MarketingStrategyExpenseRow,
  MarketingStrategyRow,
} from "@/modules/marketing/strategy-queries";

const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const monthShort = ["Yan", "Fev", "Mar", "Apr", "May", "İyn", "İyl", "Avq", "Sen", "Okt", "Noy", "Dek"];
const statusLabels: Record<string, string> = { DRAFT: "Qaralama", ACTIVE: "Aktiv", COMPLETED: "Tamamlanıb" };
const expenseCategories: Record<string, string> = {
  PRODUCTION: "Foto / video çəkiliş",
  INFLUENCER: "Influencer əməkdaşlığı",
  PRINT: "Çap materialları",
  EVENT: "Tədbir",
  SOFTWARE: "Proqram təminatı",
  OTHER: "Digər",
};

export function MarketingStrategyWorkspace({ data }: { data: MarketingStrategyData }) {
  const router = useRouter();
  const [editorStrategy, setEditorStrategy] = useState<MarketingStrategyRow | null | undefined>(undefined);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selected = data.selectedStrategy;
  const monthStrategies = useMemo(
    () => data.strategies.filter((strategy) => strategy.month === data.month),
    [data.month, data.strategies],
  );
  const manualExpenses = selected?.expenses ?? [];
  const manualExpenseTotal = manualExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalCost = data.auto.totals.spend + manualExpenseTotal;
  const scheduledContent = data.auto.contentItems.length;
  const approvedContent = data.auto.contentItems.filter((item) => item.status === "ACTIVE").length;

  function pushMonth(month: string) {
    startTransition(() => router.push(`/marketing?view=strategy&month=${month}` as Route));
  }

  function selectStrategy(id: string) {
    startTransition(() => router.push(`/marketing?view=strategy&month=${data.month}&strategy=${id}` as Route));
  }

  const goals = selected ? [
    { label: "Satış hədəfi", icon: TrendingUp, actual: data.auto.totals.sales, target: selected.salesGoal, value: `${number(data.auto.totals.sales)} / ${number(selected.salesGoal)}`, tone: "sales" },
    { label: "Gəlir hədəfi", icon: CircleDollarSign, actual: data.auto.totals.revenue, target: selected.revenueGoal, value: `${money(data.auto.totals.revenue)} / ${money(selected.revenueGoal)}`, tone: "revenue" },
    { label: "Lead hədəfi", icon: UsersRound, actual: data.auto.totals.leads, target: selected.leadGoal, value: `${number(data.auto.totals.leads)} / ${number(selected.leadGoal)}`, tone: "leads" },
    { label: "Büdcə", icon: WalletCards, actual: totalCost, target: selected.budget, value: `${money(totalCost)} / ${money(selected.budget)}`, tone: totalCost > selected.budget && selected.budget > 0 ? "over" : "budget" },
  ] : [];

  return (
    <section className="strategy-workspace">
      <header className="strategy-topbar">
        <div className="strategy-heading">
          <span><Target /></span>
          <div>
            <h1>Ümumi marketing strategiyası</h1>
            <p>Hər ayın hədəfləri, reklam nəticələri, content planı və əlavə xərcləri bir görünüşdə.</p>
          </div>
        </div>
        <div className="strategy-top-actions">
          <Button variant="outline" onClick={() => pushMonth(currentMonthKey())}>Bu gün</Button>
          <div className="strategy-arrow-group">
            <Button variant="outline" size="icon" aria-label="Əvvəlki ay" disabled={pending} onClick={() => pushMonth(addMonths(data.month, -1))}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Növbəti ay" disabled={pending} onClick={() => pushMonth(addMonths(data.month, 1))}><ChevronRight /></Button>
          </div>
          <span className="strategy-month-control"><CalendarDays /> {monthLabel(data.month)}</span>
          {data.permissions.canManage ? <Button className="strategy-primary-button" onClick={() => setEditorStrategy(null)}><Plus /> Yeni strategiya</Button> : null}
        </div>
      </header>

      <MarketingViewTabs active="strategy" month={data.month} />

      <nav className="strategy-month-rail" aria-label={`${data.year} ayları`}>
        {monthShort.map((label, index) => {
          const key = `${data.year}-${String(index + 1).padStart(2, "0")}`;
          const count = data.monthCounts[key] ?? 0;
          return (
            <button key={key} type="button" className={cx(key === data.month && "is-active")} onClick={() => pushMonth(key)}>
              <span>{label}</span>
              <small className={count ? "has-strategy" : ""}><i /> {count || "—"}</small>
            </button>
          );
        })}
      </nav>

      <div className="strategy-main-grid">
        <main className="strategy-primary">
          <section className="strategy-summary">
            <header className="strategy-summary-head">
              <div>
                <div className="strategy-title-line">
                  <h2>{monthLabel(data.month)}</h2>
                  {monthStrategies.length ? (
                    <select value={selected?.id ?? ""} onChange={(event) => selectStrategy(event.target.value)} aria-label="Strategiya seç">
                      {monthStrategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
                    </select>
                  ) : null}
                  {selected ? <span className={`strategy-status is-${selected.status.toLowerCase()}`}><i />{statusLabels[selected.status] ?? selected.status}</span> : null}
                </div>
                <p>{selected?.objective ?? "Bu ay üçün strategiya yaradın; Meta və content məlumatları avtomatik bağlanacaq."}</p>
              </div>
              <span className="strategy-auto-note">{monthNames[Number(data.month.slice(5, 7)) - 1]} məlumatları avtomatik göstərilir <Info /></span>
            </header>
            {selected ? (
              <div className="strategy-goal-strip">{goals.map((goal) => <GoalMetric key={goal.label} {...goal} />)}</div>
            ) : (
              <div className="strategy-create-empty">
                <span><Target /></span>
                <div><strong>{monthLabel(data.month)} üçün hədəf müəyyən edilməyib</strong><p>Satış, gəlir, lead və büdcə hədəflərini yaratmaq üçün strategiya əlavə edin.</p></div>
                {data.permissions.canManage ? <Button onClick={() => setEditorStrategy(null)}><Plus /> Strategiya yarat</Button> : null}
              </div>
            )}
          </section>

          <div className="strategy-operational-grid">
            <section className="strategy-data-panel">
              <header className="strategy-panel-head"><div><h3>Meta nəticələri</h3><span>{monthLabel(data.month)} · avtomatik sync</span></div><BarChart3 /></header>
              <div className="strategy-mini-stats">
                <MiniStat label="Xərclənən məbləğ" value={money(data.auto.totals.spend, data.auto.totals.currency)} />
                <MiniStat label="Söhbətlər" value={number(data.auto.totals.conversations)} />
                <MiniStat label="Söhbət başına xərc" value={money(data.auto.totals.costPerConversation, data.auto.totals.currency)} />
                <MiniStat label="Lead" value={number(data.auto.totals.leads)} />
              </div>
              <div className="strategy-campaign-table">
                <div className="strategy-table-head"><span>Kampaniya</span><span>Xərc</span><span>Söhbət</span><span>Lead</span></div>
                {data.auto.campaigns.slice(0, 5).map((campaign) => (
                  <div key={campaign.id} className="strategy-campaign-row">
                    <span><i className={campaign.metaCampaignId ? "is-meta" : ""}><Megaphone /></i><strong>{campaign.name}</strong></span>
                    <span>{money(campaign.stats.spend, campaign.stats.currency)}</span>
                    <span>{number(campaign.stats.conversations)}</span>
                    <span>{number(campaign.leadCount)}</span>
                  </div>
                ))}
                {!data.auto.campaigns.length ? <PanelEmpty icon={<Megaphone />} title="Bu ay reklam nəticəsi yoxdur" text="Meta sync nəticələri burada avtomatik görünəcək." /> : null}
              </div>
              <button type="button" className="strategy-panel-link" onClick={() => router.push(`/marketing?from=${data.month}-01&to=${monthLastDate(data.month)}` as Route)}>Bütün reklam nəticələrini gör <ChevronRight /></button>
            </section>

            <section className="strategy-data-panel">
              <header className="strategy-panel-head"><div><h3>Content plan</h3><span>{monthLabel(data.month)} · calendar məlumatı</span></div><CalendarDays /></header>
              <div className="strategy-content-stats">
                <MiniStat label="Planlanıb" value={number(scheduledContent)} />
                <MiniStat label="Təsdiqlənib" value={number(approvedContent)} tone="good" />
                <MiniStat label="Founder gözləyir" value={number(data.auto.pendingContentCount)} tone="attention" />
              </div>
              <div className="strategy-content-list">
                {data.auto.contentItems.slice(0, 5).map((item) => (
                  <article key={item.id}>
                    <span className="strategy-content-date"><strong>{dayLabel(item.scheduledAt)}</strong><small>{timeLabel(item.scheduledAt)}</small></span>
                    <span className={cx("strategy-content-thumb", !item.mediaUrl && "is-empty")} style={safeBackground(item.mediaUrl)}>{!item.mediaUrl ? <FileImage /> : null}</span>
                    <span className="strategy-content-copy"><strong>{item.title}</strong><small>{item.platform} · {item.format}</small></span>
                    <span className={`strategy-content-status is-${item.status.toLowerCase()}`}>{contentStatus(item.status)}</span>
                  </article>
                ))}
                {!data.auto.contentItems.length ? <PanelEmpty icon={<CalendarDays />} title="Bu ay planlanmış content yoxdur" text="Təsdiqlənmiş slide calendar-a əlavə ediləndə burada görünəcək." /> : null}
              </div>
              <button type="button" className="strategy-panel-link" onClick={() => router.push(`/marketing?view=content&month=${data.month}` as Route)}>Bütün content planı gör <ChevronRight /></button>
            </section>
          </div>

          <section className="strategy-expense-panel">
            <header className="strategy-panel-head">
              <div><h3>Xərc planı</h3><span>{monthLabel(data.month)} · Meta avtomatik, əlavə xərclər manual</span></div>
              {data.permissions.canManage && selected ? <Button className="strategy-expense-button" onClick={() => setExpenseOpen(true)}><Plus /> Xərc əlavə et</Button> : <ReceiptText />}
            </header>
            <div className="strategy-expense-scroll">
              <div className="strategy-expense-table">
                <div className="strategy-expense-head"><span>Kateqoriya</span><span>Mənbə</span><span>Qeyd</span><span>Fakt</span><span>Tarix</span></div>
                <ExpenseRow title="Meta reklam xərci" category="META" notes="Meta Ads-dən avtomatik sync" amount={data.auto.totals.spend} spentOn={`${data.month}-01`} automatic />
                {manualExpenses.map((expense) => <ExpenseRow key={expense.id} {...expense} />)}
              </div>
            </div>
            <footer className="strategy-expense-total"><span>Əlavə xərclər: <strong>{money(manualExpenseTotal)}</strong></span><span>Ümumi marketing xərci: <strong>{money(totalCost)}</strong></span></footer>
          </section>
        </main>

        <StrategyInspector
          strategy={selected}
          otherStrategies={monthStrategies.filter((strategy) => strategy.id !== selected?.id)}
          totals={data.auto.totals}
          totalCost={totalCost}
          canManage={data.permissions.canManage}
          onEdit={() => selected && setEditorStrategy(selected)}
          onSelect={selectStrategy}
          onCreate={() => setEditorStrategy(null)}
        />
      </div>

      <StrategyEditorDialog
        key={`${editorStrategy?.id ?? "new"}:${editorStrategy === undefined ? "closed" : "open"}`}
        open={editorStrategy !== undefined}
        strategy={editorStrategy ?? null}
        month={data.month}
        people={data.people}
        onOpenChange={(open) => { if (!open) setEditorStrategy(undefined); }}
      />
      <ExpenseDialog open={expenseOpen} strategy={selected} onOpenChange={setExpenseOpen} />
    </section>
  );
}

function GoalMetric({ label, icon: Icon, actual, target, value, tone }: { label: string; icon: typeof Target; actual: number; target: number; value: string; tone: string }) {
  const percent = target > 0 ? Math.round(actual / target * 100) : 0;
  return (
    <article className={`strategy-goal is-${tone}`}>
      <div><span><Icon /></span><small>{label}</small></div>
      <strong>{value}</strong>
      <div className="strategy-progress"><i style={{ width: `${Math.min(percent, 100)}%` }} /></div>
      <em>{percent}%</em>
    </article>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <span className={cx("strategy-mini-stat", tone && `is-${tone}`)}><small>{label}</small><strong>{value}</strong></span>;
}

function PanelEmpty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="strategy-panel-empty"><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div></div>;
}

function ExpenseRow({ title, category, notes, amount, spentOn, automatic = false }: Pick<MarketingStrategyExpenseRow, "title" | "category" | "notes" | "amount" | "spentOn"> & { automatic?: boolean }) {
  return (
    <div className="strategy-expense-row">
      <span><i className={automatic ? "is-auto" : ""}>{automatic ? <Megaphone /> : <ReceiptText />}</i><strong>{title}</strong></span>
      <span>{automatic ? "Meta Ads" : expenseCategories[category] ?? category}</span>
      <span>{notes || "—"}</span>
      <span>{money(amount)}</span>
      <span>{automatic ? monthLabel(spentOn.slice(0, 7)) : displayDate(spentOn)}</span>
    </div>
  );
}

function StrategyInspector({ strategy, otherStrategies, totals, totalCost, canManage, onEdit, onSelect, onCreate }: {
  strategy: MarketingStrategyRow | null;
  otherStrategies: MarketingStrategyRow[];
  totals: MarketingStrategyData["auto"]["totals"];
  totalCost: number;
  canManage: boolean;
  onEdit: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  if (!strategy) {
    return <aside className="strategy-inspector is-empty"><Target /><strong>Strategiya seçilməyib</strong><p>Bu ay üçün məqsəd və hədəfləri yaratdıqdan sonra detallar burada görünəcək.</p>{canManage ? <Button onClick={onCreate}><Plus /> Strategiya yarat</Button> : null}</aside>;
  }
  return (
    <aside className="strategy-inspector">
      <header><div><h2>Strategiya detalları</h2><span>{monthLabel(strategy.month)}</span></div>{canManage ? <Button variant="ghost" onClick={onEdit}><Edit3 /> Redaktə et</Button> : null}</header>
      <dl>
        <div><dt>Strategiya</dt><dd>{strategy.name}</dd></div>
        <div><dt>Məsul şəxs</dt><dd className="strategy-person"><i>{initials(strategy.responsibleName)}</i>{strategy.responsibleName}</dd></div>
        <div><dt>Məqsəd</dt><dd>{strategy.objective}</dd></div>
        <div><dt>Satış hədəfi</dt><dd>{number(strategy.salesGoal)} satış</dd></div>
        <div><dt>Lead hədəfi</dt><dd>{number(strategy.leadGoal)} lead</dd></div>
        <div><dt>Gəlir hədəfi</dt><dd>{money(strategy.revenueGoal)}</dd></div>
        <div><dt>Büdcə</dt><dd>{money(strategy.budget)}</dd></div>
        {strategy.notes ? <div><dt>Qeyd</dt><dd>{strategy.notes}</dd></div> : null}
      </dl>
      <section className="strategy-performance-box">
        <h3>Performans xülasəsi</h3>
        <PerformanceRow label="Satış" value={`${number(totals.sales)} / ${number(strategy.salesGoal)}`} tone="orange" />
        <PerformanceRow label="Gəlir" value={`${money(totals.revenue)} / ${money(strategy.revenueGoal)}`} tone="orange" />
        <PerformanceRow label="Lead" value={`${number(totals.leads)} / ${number(strategy.leadGoal)}`} tone="green" />
        <PerformanceRow label="Büdcə" value={`${money(totalCost)} / ${money(strategy.budget)}`} tone={totalCost > strategy.budget && strategy.budget > 0 ? "red" : "green"} />
      </section>
      <section className="strategy-other-list">
        <h3>Digər strategiyalar <span>({monthLabel(strategy.month)})</span></h3>
        {otherStrategies.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)}><span><strong>{item.name}</strong><small>{item.objective}</small></span><ChevronRight /></button>)}
        {canManage ? <button type="button" className="is-create" onClick={onCreate}><Plus /> Strategiya əlavə et</button> : null}
      </section>
    </aside>
  );
}

function PerformanceRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <p><span><i className={`is-${tone}`} />{label}</span><strong>{value}</strong></p>;
}

function StrategyEditorDialog({ open, strategy, month, people, onOpenChange }: {
  open: boolean;
  strategy: MarketingStrategyRow | null;
  month: string;
  people: MarketingStrategyData["people"];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        unwrapActionResult(await saveMarketingStrategyAction(formData));
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        setError(notifyCaughtError(caught, "Strategiya yadda saxlanmadı", "Strategiya saxlanmadı"));
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="strategy-editor-modal">
        <DialogHeader><DialogTitle>{strategy ? "Strategiyanı redaktə et" : "Yeni strategiya"}</DialogTitle><DialogDescription>Ay üçün məqsədi, satış nəticəsini və büdcə hədəflərini müəyyən edin.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          {strategy ? <input type="hidden" name="id" value={strategy.id} /> : null}
          <div className="strategy-form-grid">
            <Field label="Strategiya adı"><Input name="name" defaultValue={strategy?.name} placeholder="Məsələn: Yay satış kampaniyası" required maxLength={120} /></Field>
            <Field label="Ay"><Input name="month" type="month" defaultValue={strategy?.month ?? month} required /></Field>
            <Field label="Status"><select name="status" defaultValue={strategy?.status ?? "ACTIVE"}><option value="DRAFT">Qaralama</option><option value="ACTIVE">Aktiv</option><option value="COMPLETED">Tamamlanıb</option></select></Field>
            <Field label="Məsul şəxs"><select name="responsibleUserId" defaultValue={strategy?.responsibleUserId ?? ""}><option value="">Təyin edilməyib</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
            <Field label="Satış hədəfi"><Input name="salesGoal" type="number" min="0" step="1" defaultValue={strategy?.salesGoal ?? 0} /></Field>
            <Field label="Lead hədəfi"><Input name="leadGoal" type="number" min="0" step="1" defaultValue={strategy?.leadGoal ?? 0} /></Field>
            <Field label="Gəlir hədəfi (₼)"><Input name="revenueGoal" type="number" min="0" step="0.01" defaultValue={strategy?.revenueGoal ?? 0} /></Field>
            <Field label="Büdcə (₼)"><Input name="budget" type="number" min="0" step="0.01" defaultValue={strategy?.budget ?? 0} /></Field>
          </div>
          <Field label="Əsas məqsəd"><textarea name="objective" rows={3} defaultValue={strategy?.objective} placeholder="Bu strategiyanın əsas biznes məqsədi..." required maxLength={600} /></Field>
          <Field label="Qeyd"><textarea name="notes" rows={2} defaultValue={strategy?.notes} placeholder="Kampaniya yanaşması, mesajlar və əlavə qeydlər..." maxLength={1200} /></Field>
          {error ? <p className="strategy-form-error">{error}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button><Button type="submit" className="strategy-primary-button" disabled={pending}>{pending ? "Saxlanır..." : strategy ? "Dəyişiklikləri saxla" : "Strategiya yarat"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({ open, strategy, onOpenChange }: { open: boolean; strategy: MarketingStrategyRow | null; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        unwrapActionResult(await addMarketingStrategyExpenseAction(formData));
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        setError(notifyCaughtError(caught, "Xərc əlavə edilmədi", "Xərc saxlanmadı"));
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="strategy-expense-modal">
        <DialogHeader><DialogTitle>Xərc əlavə et</DialogTitle><DialogDescription>{strategy?.name ?? "Strategiya"} üçün Meta-dan kənar marketing xərcini daxil edin.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <input type="hidden" name="strategyId" value={strategy?.id ?? ""} />
          <div className="strategy-form-grid">
            <Field label="Xərc adı"><Input name="title" placeholder="Məsələn: Foto çəkiliş" required maxLength={120} /></Field>
            <Field label="Kateqoriya"><select name="category" defaultValue="PRODUCTION">{Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Məbləğ (₼)"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field>
            <Field label="Tarix"><Input name="spentOn" type="date" min={`${strategy?.month ?? currentMonthKey()}-01`} max={monthLastDate(strategy?.month ?? currentMonthKey())} defaultValue={`${strategy?.month ?? currentMonthKey()}-01`} required /></Field>
          </div>
          <Field label="Qeyd"><textarea name="notes" rows={3} placeholder="Xərcin təyinatı və detallar..." maxLength={600} /></Field>
          {error ? <p className="strategy-form-error">{error}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button><Button type="submit" className="strategy-primary-button" disabled={pending}>{pending ? "Əlavə edilir..." : "Xərci əlavə et"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="strategy-form-field"><span>{label}</span>{children}</label>;
}

function money(value: number, currency = "AZN") {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: safe % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(safe);
  return currency === "AZN" ? `₼${formatted}` : `${formatted} ${currency}`;
}

function number(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthNames[monthNumber - 1]} ${year}`;
}

function currentMonthKey() {
  const baku = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${baku.getUTCFullYear()}-${String(baku.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLastDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`;
}

function dayLabel(value: string) {
  const baku = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
  return `${String(baku.getUTCDate()).padStart(2, "0")} ${monthShort[baku.getUTCMonth()].toLocaleLowerCase("az")}`;
}

function timeLabel(value: string) {
  const baku = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
  return `${String(baku.getUTCHours()).padStart(2, "0")}:${String(baku.getUTCMinutes()).padStart(2, "0")}`;
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "M"}${parts[1]?.[0] ?? ""}`;
}

function contentStatus(status: string) {
  const labels: Record<string, string> = { DRAFT: "Qaralama", PENDING_APPROVAL: "Gözləmədə", ACTIVE: "Təsdiqlənib", REVISION_REQUIRED: "Düzəliş" };
  return labels[status] ?? status;
}

function safeBackground(value: string) {
  if (!/^https?:\/\//i.test(value)) return undefined;
  return { backgroundImage: `url("${value.replaceAll('"', "%22")}")` };
}
