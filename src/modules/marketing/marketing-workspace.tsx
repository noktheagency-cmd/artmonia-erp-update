"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarDays,
  ListFilter,
  Megaphone,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

const storageKey = "artmonia-marketing-strategies-v1";

type MarketingStatus = "active" | "testing" | "paused";

type MarketingStrategy = {
  id: string;
  name: string;
  channel: string;
  owner: string;
  week: string;
  budget: number;
  spent: number;
  revenue: number;
  leads: number;
  conversions: number;
  status: MarketingStatus;
  goal: string;
  notes: string;
  createdAt: string;
};

type StrategyDraft = {
  name: string;
  channel: string;
  owner: string;
  week: string;
  budget: string;
  spent: string;
  revenue: string;
  leads: string;
  conversions: string;
  status: MarketingStatus;
  goal: string;
  notes: string;
};

type MarketingTotals = {
  plannedBudget: number;
  spent: number;
  revenue: number;
  profit: number;
  leads: number;
  conversions: number;
  roi: number;
  roas: number;
  budgetUsage: number;
  conversionRate: number;
  cpa: number;
};

const channelOptions = [
  { value: "Meta Ads", label: "Meta Ads" },
  { value: "Google Ads", label: "Google Ads" },
  { value: "TikTok Ads", label: "TikTok Ads" },
  { value: "Referral", label: "Referral" },
  { value: "Email", label: "Email" },
  { value: "Outdoor", label: "Outdoor" },
  { value: "Partnership", label: "Partnership" },
] as const;

const statusOptions = [
  { value: "active", label: "Aktiv" },
  { value: "testing", label: "Test" },
  { value: "paused", label: "Pauza" },
] as const;

const statusMeta = {
  active: { label: "Aktiv", tone: "success" },
  testing: { label: "Test", tone: "info" },
  paused: { label: "Pauza", tone: "warning" },
} as const;

const marketingKpiIcons = [WalletCards, BadgeDollarSign, TrendingUp, UsersRound, Target];

export function MarketingWorkspace() {
  const currentWeek = useMemo(() => getIsoWeekId(new Date()), []);
  const [strategies, setStrategies] = useState<MarketingStrategy[]>(() =>
    buildSeedStrategies(currentWeek)
  );
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [statusFilter, setStatusFilter] = useState<"all" | MarketingStatus>("all");
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<StrategyDraft>(() => createEmptyDraft(currentWeek));

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as MarketingStrategy[];
          if (!cancelled && Array.isArray(parsed) && parsed.length > 0) {
            setStrategies(parsed);
            setSelectedWeek(parsed[0]?.week ?? currentWeek);
          }
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        if (!cancelled) {
          setHasLoadedStorage(true);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentWeek]);

  useEffect(() => {
    if (!hasLoadedStorage) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(strategies));
  }, [hasLoadedStorage, strategies]);

  const weekOptions = useMemo(() => buildWeekOptions(strategies, currentWeek), [currentWeek, strategies]);
  const weekStrategies = useMemo(
    () => strategies.filter((strategy) => strategy.week === selectedWeek),
    [selectedWeek, strategies]
  );
  const totals = useMemo(() => calculateTotals(weekStrategies), [weekStrategies]);
  const channelSummaries = useMemo(
    () => buildChannelSummaries(weekStrategies, totals.spent),
    [totals.spent, weekStrategies]
  );
  const visibleStrategies = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return weekStrategies.filter((strategy) => {
      const matchesStatus = statusFilter === "all" || strategy.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        normalizeSearch(
          `${strategy.name} ${strategy.channel} ${strategy.owner} ${strategy.goal} ${strategy.notes}`
        ).includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, statusFilter, weekStrategies]);
  const bestStrategy = useMemo(() => getBestStrategy(weekStrategies), [weekStrategies]);
  const recommendations = useMemo(
    () => buildRecommendations(totals, weekStrategies, bestStrategy),
    [bestStrategy, totals, weekStrategies]
  );
  const kpis = [
    {
      label: "Plan büdcə",
      value: formatCurrency(totals.plannedBudget),
      helper: `${formatPercent(totals.budgetUsage)} istifadə`,
      tone: "budget",
    },
    {
      label: "Xərclənib",
      value: formatCurrency(totals.spent),
      helper: `${formatCurrency(Math.max(totals.plannedBudget - totals.spent, 0))} qalıq`,
      tone: "spent",
    },
    {
      label: "Geri dönüş",
      value: formatCurrency(totals.revenue),
      helper: `${formatCurrency(totals.profit)} net nəticə`,
      tone: "return",
    },
    {
      label: "Lead / Satış",
      value: `${totals.leads}/${totals.conversions}`,
      helper: `${formatPercent(totals.conversionRate)} konversiya`,
      tone: "leads",
    },
    {
      label: "ROI",
      value: formatPercent(totals.roi),
      helper: `${formatRatio(totals.roas)} ROAS / ${formatCurrency(totals.cpa)} CPA`,
      tone: "roi",
    },
  ];

  function openCreateDialog() {
    setDraft(createEmptyDraft(selectedWeek));
    setIsDialogOpen(true);
  }

  function updateDraft(nextValues: Partial<StrategyDraft>) {
    setDraft((current) => ({ ...current, ...nextValues }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextStrategy: MarketingStrategy = {
      id: createStrategyId(),
      name: draft.name.trim(),
      channel: draft.channel,
      owner: draft.owner.trim() || "Marketing",
      week: draft.week || selectedWeek,
      budget: toNumber(draft.budget),
      spent: toNumber(draft.spent),
      revenue: toNumber(draft.revenue),
      leads: Math.round(toNumber(draft.leads)),
      conversions: Math.round(toNumber(draft.conversions)),
      status: draft.status,
      goal: draft.goal.trim() || "Yeni marketing hədəfi",
      notes: draft.notes.trim() || "Detallar sonra yenilənəcək.",
      createdAt: new Date().toISOString(),
    };

    if (!nextStrategy.name) {
      return;
    }

    setStrategies((current) => [nextStrategy, ...current]);
    setSelectedWeek(nextStrategy.week);
    setIsDialogOpen(false);
  }

  function deleteStrategy(strategyId: string) {
    setStrategies((current) => current.filter((strategy) => strategy.id !== strategyId));
  }

  async function copyWeeklyReport() {
    const report = buildWeeklyReportText(selectedWeek, totals, weekStrategies, bestStrategy, recommendations);

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="page-stack marketing-page">
      <header className="marketing-hero">
        <div className="marketing-hero-main">
          <span className="marketing-hero-icon">
            <Megaphone size={22} />
          </span>
          <div>
            <div className="marketing-scope-row">
              <span>Artmonia ERP</span>
              <span>{formatWeekLabel(selectedWeek)}</span>
              <span>{weekStrategies.length} strategiya</span>
            </div>
            <h1>Marketing</h1>
            <p>Strategiya büdcələri, xərclər, geri dönüşlər və həftəlik performans eyni kompakt paneldə.</p>
          </div>
        </div>

        <div className="marketing-hero-actions">
          <label className="marketing-week-field">
            <span>Həftə</span>
            <FormSelect
              name="selectedWeek"
              value={selectedWeek}
              onValueChange={setSelectedWeek}
              options={weekOptions}
              aria-label="Marketing həftəsi"
              icon={CalendarDays}
            />
          </label>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" onClick={openCreateDialog}>
                <Plus data-icon="inline-start" />
                Strategiya əlavə et
              </Button>
            </DialogTrigger>
            <DialogContent className="marketing-dialog">
              <DialogHeader>
                <DialogTitle>Yeni marketing strategiyası</DialogTitle>
                <DialogDescription>
                  Kanal, büdcə, xərclənən məbləğ və geri dönüş göstəricilərini daxil et.
                </DialogDescription>
              </DialogHeader>

              <form className="marketing-form" onSubmit={handleSubmit}>
                <div className="marketing-form-grid">
                  <label className="form-field">
                    <span>Strategiya adı</span>
                    <Input
                      value={draft.name}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                      placeholder="Məs: Instagram yay kampaniyası"
                      maxLength={90}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Kanal</span>
                    <FormSelect
                      name="channel"
                      value={draft.channel}
                      onValueChange={(value) => updateDraft({ channel: value })}
                      options={channelOptions}
                      aria-label="Marketing kanalı"
                    />
                  </label>
                  <label className="form-field">
                    <span>Həftə</span>
                    <Input
                      type="week"
                      value={draft.week}
                      onChange={(event) => updateDraft({ week: event.target.value })}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Status</span>
                    <FormSelect
                      name="status"
                      value={draft.status}
                      onValueChange={(value) => updateDraft({ status: value as MarketingStatus })}
                      options={statusOptions}
                      aria-label="Strategiya statusu"
                    />
                  </label>
                  <label className="form-field">
                    <span>Plan büdcə</span>
                    <Input
                      value={draft.budget}
                      onChange={(event) => updateDraft({ budget: event.target.value })}
                      inputMode="decimal"
                      min="0"
                      placeholder="1500"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Xərclənib</span>
                    <Input
                      value={draft.spent}
                      onChange={(event) => updateDraft({ spent: event.target.value })}
                      inputMode="decimal"
                      min="0"
                      placeholder="900"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Geri dönüş</span>
                    <Input
                      value={draft.revenue}
                      onChange={(event) => updateDraft({ revenue: event.target.value })}
                      inputMode="decimal"
                      min="0"
                      placeholder="3600"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Məsul şəxs</span>
                    <Input
                      value={draft.owner}
                      onChange={(event) => updateDraft({ owner: event.target.value })}
                      placeholder="Marketing team"
                      maxLength={60}
                    />
                  </label>
                  <label className="form-field">
                    <span>Lead sayı</span>
                    <Input
                      value={draft.leads}
                      onChange={(event) => updateDraft({ leads: event.target.value })}
                      inputMode="numeric"
                      min="0"
                      placeholder="80"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Satış / dönüş</span>
                    <Input
                      value={draft.conversions}
                      onChange={(event) => updateDraft({ conversions: event.target.value })}
                      inputMode="numeric"
                      min="0"
                      placeholder="12"
                      required
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>Hədəf</span>
                  <Input
                    value={draft.goal}
                    onChange={(event) => updateDraft({ goal: event.target.value })}
                    placeholder="Yeni lead, trial dərs, workshop qeydiyyatı"
                    maxLength={140}
                  />
                </label>

                <label className="form-field">
                  <span>Qeydlər</span>
                  <textarea
                    value={draft.notes}
                    onChange={(event) => updateDraft({ notes: event.target.value })}
                    placeholder="Auditoriya, mesaj, kreativi və növbəti addımı qeyd et"
                    maxLength={360}
                  />
                </label>

                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>
                    Ləğv et
                  </Button>
                  <Button type="submit">
                    <Plus data-icon="inline-start" />
                    Əlavə et
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="marketing-kpi-grid" aria-label="Marketing göstəriciləri">
        {kpis.map((kpi, index) => {
          const Icon = marketingKpiIcons[index] ?? BarChart3;

          return (
            <article className={`marketing-kpi-card is-${kpi.tone}`} key={kpi.label}>
              <div>
                <span>{kpi.label}</span>
                <Icon size={16} />
              </div>
              <strong>{kpi.value}</strong>
              <small>{kpi.helper}</small>
            </article>
          );
        })}
      </div>

      <div className="marketing-grid">
        <article className="marketing-panel marketing-table-panel">
          <div className="marketing-panel-head">
            <div>
              <span>Strategiyalar</span>
              <h2>Həftəlik marketing planı</h2>
            </div>
            <div className="marketing-table-count">{visibleStrategies.length} qeyd</div>
          </div>

          <div className="marketing-toolbar">
            <label className="marketing-search">
              <Search size={14} />
              <span className="sr-only">Strategiya axtar</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Strategiya, kanal, hədəf üzrə axtar"
              />
            </label>
            <div className="marketing-status-tabs" aria-label="Strategiya statusları">
              <button
                type="button"
                className={statusFilter === "all" ? "is-active" : undefined}
                onClick={() => setStatusFilter("all")}
              >
                <ListFilter size={13} />
                Hamısı
              </button>
              {statusOptions.map((status) => (
                <button
                  type="button"
                  className={statusFilter === status.value ? "is-active" : undefined}
                  onClick={() => setStatusFilter(status.value)}
                  key={status.value}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          <div className="marketing-table-wrap">
            <table className="marketing-table">
              <thead>
                <tr>
                  <th>Strategiya</th>
                  <th>Kanal</th>
                  <th>Büdcə</th>
                  <th>Geri dönüş</th>
                  <th>Lead / Satış</th>
                  <th>ROI</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleStrategies.length > 0 ? (
                  visibleStrategies.map((strategy) => {
                    const roi = getStrategyRoi(strategy);
                    const budgetUsage = strategy.budget > 0 ? (strategy.spent / strategy.budget) * 100 : 0;

                    return (
                      <tr key={strategy.id}>
                        <td>
                          <div className="marketing-strategy-cell">
                            <strong>{strategy.name}</strong>
                            <span>{strategy.goal}</span>
                          </div>
                        </td>
                        <td>
                          <div className="marketing-channel-cell">
                            <span className="marketing-channel-chip">{strategy.channel}</span>
                            <small>{strategy.owner}</small>
                          </div>
                        </td>
                        <td>
                          <div className="marketing-budget-cell">
                            <div>
                              <strong>{formatCurrency(strategy.spent)}</strong>
                              <span>/ {formatCurrency(strategy.budget)}</span>
                            </div>
                            <span className="marketing-budget-track">
                              <span style={{ width: `${Math.min(budgetUsage, 100)}%` }} />
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="marketing-money-cell">
                            <strong>{formatCurrency(strategy.revenue)}</strong>
                            <span>{formatCurrency(strategy.revenue - strategy.spent)} net</span>
                          </div>
                        </td>
                        <td>
                          <div className="marketing-lead-cell">
                            <strong>{strategy.leads}</strong>
                            <span>{strategy.conversions} dönüş</span>
                          </div>
                        </td>
                        <td>
                          <span className={`marketing-roi-pill is-${getRoiTone(roi)}`}>
                            {formatPercent(roi)}
                          </span>
                        </td>
                        <td>
                          <StatusChip tone={statusMeta[strategy.status].tone}>
                            {statusMeta[strategy.status].label}
                          </StatusChip>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="marketing-icon-action"
                            onClick={() => deleteStrategy(strategy.id)}
                            aria-label={`${strategy.name} strategiyasını sil`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="marketing-empty-state">
                        Bu həftə üçün uyğun strategiya tapılmadı.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <div className="marketing-side-stack">
          <article className="marketing-panel marketing-report-panel">
            <div className="marketing-panel-head">
              <div>
                <span>Həftəlik report</span>
                <h2>{formatWeekLabel(selectedWeek)}</h2>
              </div>
              <button type="button" onClick={copyWeeklyReport}>
                {copied ? "Kopyalandı" : "Kopyala"}
              </button>
            </div>

            <div className="marketing-report-grid">
              <div>
                <span>Ən yaxşı strategiya</span>
                <strong>{bestStrategy?.name ?? "-"}</strong>
                <small>{bestStrategy ? `${formatPercent(getStrategyRoi(bestStrategy))} ROI` : "Data yoxdur"}</small>
              </div>
              <div>
                <span>ROAS</span>
                <strong>{formatRatio(totals.roas)}</strong>
                <small>{formatCurrency(totals.revenue)} dönüş</small>
              </div>
              <div>
                <span>CPA</span>
                <strong>{formatCurrency(totals.cpa)}</strong>
                <small>1 satışın marketing xərci</small>
              </div>
              <div>
                <span>Büdcə intizamı</span>
                <strong>{formatPercent(totals.budgetUsage)}</strong>
                <small>{totals.budgetUsage > 100 ? "Plan aşımı var" : "Plan daxilində"}</small>
              </div>
            </div>

            <div className="marketing-recommendations">
              {recommendations.map((recommendation) => (
                <div key={recommendation}>
                  <Target size={14} />
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="marketing-panel marketing-channel-panel">
            <div className="marketing-panel-head">
              <div>
                <span>Kanal paylanması</span>
                <h2>Büdcə və nəticə</h2>
              </div>
              <BarChart3 size={18} />
            </div>

            <div className="marketing-channel-list">
              {channelSummaries.length > 0 ? (
                channelSummaries.map((channel) => (
                  <div className="marketing-channel-row" key={channel.channel}>
                    <div>
                      <strong>{channel.channel}</strong>
                      <span>{formatCurrency(channel.spent)} / {formatCurrency(channel.revenue)}</span>
                    </div>
                    <b>{formatPercent(channel.share)}</b>
                    <span className="marketing-channel-track">
                      <span style={{ width: `${Math.max(channel.share, 4)}%` }} />
                    </span>
                  </div>
                ))
              ) : (
                <div className="marketing-empty-state compact">Kanal datası yoxdur.</div>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function createEmptyDraft(week: string): StrategyDraft {
  return {
    name: "",
    channel: "Meta Ads",
    owner: "Marketing team",
    week,
    budget: "1200",
    spent: "0",
    revenue: "0",
    leads: "0",
    conversions: "0",
    status: "testing",
    goal: "",
    notes: "",
  };
}

function buildSeedStrategies(currentWeek: string): MarketingStrategy[] {
  const previousWeek = getIsoWeekId(addDays(new Date(), -7));

  return [
    {
      id: "seed-meta-reels",
      name: "Instagram Reels lead kampaniyası",
      channel: "Meta Ads",
      owner: "Aysel",
      week: currentWeek,
      budget: 1400,
      spent: 980,
      revenue: 4320,
      leads: 86,
      conversions: 14,
      status: "active",
      goal: "Trial dərs leadləri",
      notes: "Valideyn auditoriyası və yay qrupları üçün qısa video kreativlər.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-google-search",
      name: "Google Search: rəsm kursu",
      channel: "Google Ads",
      owner: "Nigar",
      week: currentWeek,
      budget: 900,
      spent: 760,
      revenue: 2860,
      leads: 42,
      conversions: 9,
      status: "active",
      goal: "Axtarışdan isti müraciətlər",
      notes: "Uşaq rəsm kursu, keramika və masterclass açar sözləri izlənir.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-tiktok-workshop",
      name: "TikTok workshop awareness",
      channel: "TikTok Ads",
      owner: "Kamran",
      week: currentWeek,
      budget: 650,
      spent: 410,
      revenue: 920,
      leads: 74,
      conversions: 5,
      status: "testing",
      goal: "Workshop qeydiyyatı",
      notes: "Ucuz lead gətirir, satışa çevrilmə mesaj follow-up-dan asılıdır.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-referral",
      name: "Valideyn referral bonusu",
      channel: "Referral",
      owner: "Leyla",
      week: currentWeek,
      budget: 420,
      spent: 240,
      revenue: 2100,
      leads: 18,
      conversions: 7,
      status: "active",
      goal: "Mövcud ailələrdən yeni tələbə",
      notes: "Bonus mesajı ödəniş qəbzindən sonra göndərilir.",
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-email-reactivation",
      name: "Keçmiş lead reaktivasiya emaili",
      channel: "Email",
      owner: "Marketing team",
      week: previousWeek,
      budget: 180,
      spent: 90,
      revenue: 740,
      leads: 22,
      conversions: 3,
      status: "paused",
      goal: "Soyumuş leadləri geri qaytarmaq",
      notes: "Növbəti həftə mövzu başlığı A/B test edilməlidir.",
      createdAt: new Date().toISOString(),
    },
  ];
}

function calculateTotals(strategies: MarketingStrategy[]): MarketingTotals {
  const totals = strategies.reduce(
    (acc, strategy) => ({
      plannedBudget: acc.plannedBudget + strategy.budget,
      spent: acc.spent + strategy.spent,
      revenue: acc.revenue + strategy.revenue,
      leads: acc.leads + strategy.leads,
      conversions: acc.conversions + strategy.conversions,
    }),
    {
      plannedBudget: 0,
      spent: 0,
      revenue: 0,
      leads: 0,
      conversions: 0,
    }
  );
  const profit = totals.revenue - totals.spent;

  return {
    ...totals,
    profit,
    roi: totals.spent > 0 ? (profit / totals.spent) * 100 : 0,
    roas: totals.spent > 0 ? totals.revenue / totals.spent : 0,
    budgetUsage: totals.plannedBudget > 0 ? (totals.spent / totals.plannedBudget) * 100 : 0,
    conversionRate: totals.leads > 0 ? (totals.conversions / totals.leads) * 100 : 0,
    cpa: totals.conversions > 0 ? totals.spent / totals.conversions : 0,
  };
}

function buildChannelSummaries(strategies: MarketingStrategy[], totalSpent: number) {
  const groups = new Map<string, { channel: string; spent: number; revenue: number; leads: number }>();

  strategies.forEach((strategy) => {
    const group = groups.get(strategy.channel) ?? {
      channel: strategy.channel,
      spent: 0,
      revenue: 0,
      leads: 0,
    };

    group.spent += strategy.spent;
    group.revenue += strategy.revenue;
    group.leads += strategy.leads;
    groups.set(strategy.channel, group);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      share: totalSpent > 0 ? (group.spent / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.spent - a.spent);
}

function buildWeekOptions(strategies: MarketingStrategy[], currentWeek: string) {
  const fallbackWeeks = [
    currentWeek,
    getIsoWeekId(addDays(new Date(), -7)),
    getIsoWeekId(addDays(new Date(), -14)),
  ];
  const weeks = Array.from(new Set([...fallbackWeeks, ...strategies.map((strategy) => strategy.week)]));

  return weeks.sort((a, b) => b.localeCompare(a)).map((week) => ({
    value: week,
    label: `${week} / ${formatWeekLabel(week)}`,
  }));
}

function buildRecommendations(
  totals: MarketingTotals,
  strategies: MarketingStrategy[],
  bestStrategy: MarketingStrategy | null
) {
  if (strategies.length === 0) {
    return ["Bu həftə üçün ən azı bir strategiya əlavə et və xərcləri izləməyə başla."];
  }

  const recommendations: string[] = [];

  if (bestStrategy && getStrategyRoi(bestStrategy) > 120) {
    recommendations.push(`${bestStrategy.name} üçün büdcəni 15-20% artırmaq olar.`);
  }

  if (totals.budgetUsage > 100) {
    recommendations.push("Büdcə planı aşılıb, zəif ROI kanallarında xərci saxla.");
  } else {
    recommendations.push("Büdcə plan daxilindədir, qalan məbləği ən yüksək ROAS kanala yönəlt.");
  }

  if (totals.conversionRate < 10) {
    recommendations.push("Lead keyfiyyətini artırmaq üçün kreativ mesajı və follow-up skriptini yenilə.");
  } else {
    recommendations.push("Konversiya sağlamdır, eyni mesajı növbəti həftə retargeting-ə daşı.");
  }

  return recommendations.slice(0, 3);
}

function buildWeeklyReportText(
  week: string,
  totals: MarketingTotals,
  strategies: MarketingStrategy[],
  bestStrategy: MarketingStrategy | null,
  recommendations: string[]
) {
  return [
    `Marketing weekly report: ${week}`,
    `Strategiyalar: ${strategies.length}`,
    `Plan büdcə: ${formatCurrency(totals.plannedBudget)}`,
    `Xərclənib: ${formatCurrency(totals.spent)}`,
    `Geri dönüş: ${formatCurrency(totals.revenue)}`,
    `ROI: ${formatPercent(totals.roi)} / ROAS: ${formatRatio(totals.roas)}`,
    `Lead/Satış: ${totals.leads}/${totals.conversions}`,
    `Ən yaxşı strategiya: ${bestStrategy?.name ?? "-"}`,
    `Tövsiyələr: ${recommendations.join(" | ")}`,
  ].join("\n");
}

function getBestStrategy(strategies: MarketingStrategy[]) {
  return strategies
    .filter((strategy) => strategy.spent > 0)
    .sort((a, b) => getStrategyRoi(b) - getStrategyRoi(a))[0] ?? null;
}

function getStrategyRoi(strategy: MarketingStrategy) {
  return strategy.spent > 0 ? ((strategy.revenue - strategy.spent) / strategy.spent) * 100 : 0;
}

function getRoiTone(roi: number) {
  if (roi >= 100) {
    return "strong";
  }

  if (roi >= 25) {
    return "ok";
  }

  return "low";
}

function formatCurrency(value: number) {
  return `${formatWholeNumber(value)} AZN`;
}

function formatPercent(value: number) {
  return `${formatWholeNumber(value)}%`;
}

function formatRatio(value: number) {
  return `${value.toFixed(1)}x`;
}

function toNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function formatWholeNumber(value: number) {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function createStrategyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `strategy-${Date.now()}`;
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

function getIsoWeekId(value: Date) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

  return `${date.getUTCFullYear()}-W${week.toString().padStart(2, "0")}`;
}

function formatWeekLabel(weekId: string) {
  const range = getIsoWeekRange(weekId);

  if (!range) {
    return weekId;
  }

  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function getIsoWeekRange(weekId: string) {
  const [yearPart, weekPart] = weekId.split("-W");
  const year = Number.parseInt(yearPart, 10);
  const week = Number.parseInt(weekPart, 10);

  if (!year || !week) {
    return null;
  }

  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const start = new Date(simple);
  start.setUTCDate(simple.getUTCDate() - day + 1);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return { start, end };
}

function formatShortDate(value: Date) {
  return [
    value.getUTCDate().toString().padStart(2, "0"),
    (value.getUTCMonth() + 1).toString().padStart(2, "0"),
  ].join(".");
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(value.getDate() + days);

  return next;
}
