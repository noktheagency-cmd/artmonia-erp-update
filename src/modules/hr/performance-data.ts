import { formFilterString } from "@/modules/shared/form-values";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";
type SummaryTone = "blue" | "coral" | "yellow" | "mint";

type TeamPerformanceRow = {
  date: string;
  manager: string;
  hours: number;
  calls: number;
  answered: number;
  invites: number;
  liveConsults: number;
  sales: number;
  revenue: number;
};

type TeamTotals = {
  days: number;
  hours: number;
  calls: number;
  answered: number;
  invites: number;
  liveConsults: number;
  sales: number;
  revenue: number;
  responseRate: number;
  inviteRate: number;
  liveRate: number;
  conversionRate: number;
  salesPerHour: number;
  revenuePerHour: number;
  avgCheck: number;
};

export type HrPerformanceMetric = {
  label: string;
  value: string;
  helper: string;
  tone: SummaryTone;
};

export type HrManagerSummary = {
  manager: string;
  rank: number;
  days: number;
  hours: string;
  calls: string;
  sales: string;
  revenue: string;
  conversionRate: string;
  revenuePerHour: string;
  tone: StatusTone;
  isSelected: boolean;
};

export type HrFunnelStep = {
  label: string;
  value: string;
  helper: string;
  width: number;
  tone: StatusTone;
};

export type HrMonthlyTrend = {
  month: string;
  label: string;
  revenue: string;
  sales: string;
  width: number;
  isSelected: boolean;
};

export type HrFeedbackNote = {
  week: string;
  weekLabel: string;
  manager: string;
  wins: string[];
  challenges: string[];
  problems: string[];
};

export type HrDailyRow = {
  id: string;
  date: string;
  dateLabel: string;
  manager: string;
  hours: string;
  calls: string;
  answered: string;
  invites: string;
  liveConsults: string;
  sales: string;
  revenue: string;
  conversionRate: string;
  revenuePerHour: string;
  tone: StatusTone;
  status: string;
};

export type HrPerformanceData = {
  filters: {
    manager: string;
    month: string;
    activeCount: number;
  };
  labels: {
    manager: string;
    month: string;
    period: string;
    source: string;
    latestUpdate: string;
  };
  managerOptions: Array<{ value: string; label: string }>;
  monthOptions: Array<{ value: string; label: string }>;
  metrics: HrPerformanceMetric[];
  ranking: HrManagerSummary[];
  funnel: HrFunnelStep[];
  monthlyTrend: HrMonthlyTrend[];
  feedbackNotes: HrFeedbackNote[];
  dailyRows: HrDailyRow[];
  totalRows: number;
};

const amountFormatter = new Intl.NumberFormat("az-AZ", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("az-AZ", {
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("az-AZ", {
  maximumFractionDigits: 1,
  style: "percent",
});

const countFormatter = new Intl.NumberFormat("az-AZ", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("az-AZ", {
  day: "2-digit",
  month: "short",
});

const monthFormatter = new Intl.DateTimeFormat("az-AZ", {
  month: "long",
  year: "numeric",
});

const performanceTuples = [
  ["2026-04-20", "Ayşən", 6.5, 16, 16, 2, 1, 4, 180],
  ["2026-04-20", "Qeyri menecer", 0, 0, 0, 0, 0, 1, 200],
  ["2026-04-21", "Ayşən", 5, 20, 16, 4, 2, 5, 330],
  ["2026-04-21", "Zara", 2.83, 20, 11, 1, 0, 1, 50],
  ["2026-04-22", "Ayşən", 5.5, 7, 7, 3, 1, 4, 140],
  ["2026-04-22", "Zara", 4.5, 6, 3, 2, 2, 2, 230],
  ["2026-04-23", "Ayşən", 5, 29, 29, 2, 0, 0, 0],
  ["2026-04-23", "Zara", 4.83, 8, 7, 1, 1, 1, 80],
  ["2026-04-24", "Ayşən", 8, 8, 8, 3, 3, 1, 150],
  ["2026-04-24", "Nicat", 0.17, 1, 1, 1, 0, 0, 0],
  ["2026-04-24", "Zara", 3, 16, 14, 3, 0, 1, 150],
  ["2026-04-25", "Nicat", 1, 2, 2, 2, 1, 0, 0],
  ["2026-04-25", "Zara", 7, 19, 14, 5, 2, 2, 110],
  ["2026-04-26", "Nicat", 4.17, 3, 2, 2, 2, 1, 80],
  ["2026-04-26", "Zara", 8.17, 29, 25, 7, 2, 0, 0],
  ["2026-04-27", "Ayşən", 5, 8, 7, 1, 1, 1, 30],
  ["2026-04-27", "Zara", 4.67, 17, 13, 4, 2, 1, 30],
  ["2026-04-28", "Ayşən", 6.5, 20, 11, 2, 1, 4, 120],
  ["2026-04-29", "Ayşən", 5.5, 11, 8, 2, 1, 1, 30],
  ["2026-04-29", "Zara", 5.5, 0, 0, 0, 3, 1, 150],
  ["2026-04-30", "Ayşən", 6.5, 22, 15, 7, 1, 2, 400],
  ["2026-04-30", "Zara", 4.67, 23, 13, 7, 1, 0, 0],
  ["2026-05-01", "Ayşən", 4.67, 23, 14, 4, 1, 5, 340],
  ["2026-05-01", "Zara", 7.17, 30, 17, 3, 3, 1, 80.48],
  ["2026-05-02", "Ayşən", 6, 22, 5, 1, 3, 4, 110],
  ["2026-05-02", "Zara", 7, 32, 18, 3, 3, 1, 100],
  ["2026-05-03", "Zara", 6, 24, 18, 3, 1, 1, 50],
  ["2026-05-04", "Ayşən", 0.5, 2, 2, 0, 0, 2, 180],
  ["2026-05-04", "Zara", 3, 11, 10, 2, 2, 1, 30],
  ["2026-05-05", "Zara", 0.67, 5, 5, 0, 0, 1, 30],
  ["2026-05-07", "Ayşən", 2, 14, 12, 1, 0, 1, 150],
  ["2026-05-07", "Zara", 4.5, 33, 26, 4, 0, 0, 0],
  ["2026-05-08", "Ayşən", 1.5, 35, 5, 2, 0, 0, 0],
  ["2026-05-08", "Zara", 3.67, 28, 23, 1, 1, 2, 230],
  ["2026-05-09", "Nicat", 0, 0, 0, 0, 0, 0, 0],
  ["2026-05-09", "Zara", 6.33, 11, 10, 2, 2, 1, 200],
  ["2026-05-10", "Nicat", 5.47, 13, 13, 2, 1, 2, 40],
  ["2026-05-10", "Zara", 6.67, 28, 26, 2, 0, 0, 0],
  ["2026-05-11", "Ayşən", 1.83, 12, 4, 0, 1, 3, 150],
  ["2026-05-11", "Zara", 5, 11, 8, 1, 3, 3, 280],
  ["2026-05-12", "Ayşən", 1, 10, 4, 1, 0, 0, 0],
  ["2026-05-12", "Zara", 4, 10, 6, 1, 0, 1, 100],
  ["2026-05-13", "Ayşən", 3, 16, 12, 3, 1, 1, 30],
  ["2026-05-14", "Ayşən", 0, 10, 3, 1, 0, 0, 0],
  ["2026-05-14", "Zara", 2.83, 4, 3, 1, 0, 0, 0],
  ["2026-05-15", "Ayşən", 2.5, 11, 8, 4, 0, 0, 0],
  ["2026-05-15", "Zara", 2, 5, 4, 1, 0, 1, 20],
  ["2026-05-16", "Ayşən", 0, 0, 0, 0, 1, 4, 320],
  ["2026-05-16", "Zara", 3.33, 6, 5, 1, 0, 0, 0],
  ["2026-05-17", "Nicat", 0, 0, 0, 0, 0, 0, 0],
  ["2026-05-17", "Zara", 5.33, 14, 10, 2, 1, 0, 0],
  ["2026-05-18", "Ayşən", 3.67, 7, 5, 2, 2, 0, 0],
  ["2026-05-19", "Ayşən", 0, 0, 0, 0, 1, 2, 210],
  ["2026-05-19", "Zara", 1.33, 7, 3, 1, 2, 0, 0],
  ["2026-05-20", "Zara", 4.6, 8, 5, 1, 1, 2, 220],
  ["2026-05-21", "Zara", 2.17, 5, 5, 0, 2, 1, 20],
  ["2026-05-22", "Ayşən", 0, 4, 2, 1, 0, 1, 30],
  ["2026-05-22", "Zara", 0, 0, 0, 0, 0, 0, 0],
  ["2026-05-22", "Zara", 0, 0, 0, 0, 0, 0, 0],
  ["2026-05-23", "Ayşən", 1.15, 11, 7, 2, 0, 0, 0],
  ["2026-05-23", "Nicat", 10, 0, 0, 0, 1, 1, 150],
  ["2026-05-23", "Zara", 0, 0, 0, 1, 0, 2, 80],
  ["2026-05-24", "Nicat", 10, 11, 5, 2, 3, 1, 60],
  ["2026-05-24", "Zara", 3.5, 9, 8, 0, 2, 0, 0],
  ["2026-05-25", "Ayşən", 0, 2, 2, 1, 1, 1, 60],
  ["2026-05-25", "Zara", 4.33, 11, 9, 1, 0, 1, 20],
  ["2026-05-26", "Zara", 3, 9, 7, 2, 0, 0, 0],
  ["2026-05-27", "Ayşən", 1, 7, 2, 0, 0, 1, 150],
  ["2026-05-27", "Nicat", 7, 40, 30, 1, 2, 1, 30],
  ["2026-05-28", "Ayşən", 3, 19, 7, 1, 3, 4, 360],
  ["2026-05-28", "Nicat", 0, 0, 0, 0, 0, 1, 80],
  ["2026-05-28", "Zara", 2, 9, 8, 3, 0, 1, 150],
  ["2026-05-29", "Nicat", 0.05, 1, 1, 1, 1, 0, 0],
  ["2026-05-29", "Zara", 3, 4, 4, 1, 1, 1, 20],
  ["2026-05-30", "Zara", 3.42, 17, 14, 1, 0, 0, 0],
] as const;

const teamPerformanceRows: TeamPerformanceRow[] = performanceTuples.map(
  ([date, manager, hours, calls, answered, invites, liveConsults, sales, revenue]) => ({
    date,
    manager,
    hours,
    calls,
    answered,
    invites,
    liveConsults,
    sales,
    revenue,
  })
);

const weeklyFeedback = [
  {
    week: "2026-04-25",
    manager: "Zara",
    wins: [
      "Alıcıların tipajını tutub onlara uyğunlaşmaq",
      "Onların istədiyini veririk imajı yaratmaq",
      "20% sırf sizə təklif edirəm deyəndə ən yaxşısını onlara saxlamışam kimi düşünənlər olurdu",
    ],
    challenges: [
      "Uzun zaman aralığı seçən çoxdur",
      "Bəziləri artıq rəssam olduğu üçün onlara adi gəlir",
      "Sadəcə maraqlanmaq üçün yazanlar çoxdur",
    ],
    problems: [
      "İki dildə danışanda qarışdırdığım olub",
      "Endirimli satmaq daha asan idi, təcili 10 yer tutmaq bəzilərini çəkirdi",
      "İlk etdiyim zənglər çox vaxt ən uğurlu olur",
    ],
  },
  {
    week: "2026-04-25",
    manager: "Ayşən",
    wins: [],
    challenges: [],
    problems: [],
  },
  {
    week: "2026-05-10",
    manager: "Nicat",
    wins: [
      "Empatiya və təzyiq balansını qurmaq",
      "Qarşı tərəfi danışdırıb ona nəyi necə satacağımı müəyyənləşdirmək",
      "Dəvət mərhələsini gücləndirmək",
    ],
    challenges: ["Sertifikat sualları", "Sərgini ödənişsiz bilirlər"],
    problems: ["Tələsmək"],
  },
  {
    week: "2026-05-10",
    manager: "Zara",
    wins: [
      "Daha səmimi dialoqlar",
      "Problemlərini çox dinləmək",
      "Etibar yaratmaq və dostlaşmaq",
    ],
    challenges: [
      "Zənglərdən sonra cavab gözləmək uzun olur",
      "Müştərinin marağını söhbət boyu saxlamaq",
    ],
    problems: [
      "Çox danışmaqdan sonra nəticə az ola bilir",
      "Maraqlanıb dərhal cavab verilmir",
      "Satışların stabil olmaması: bəzən çox, bəzən kritik az olur",
    ],
  },
  {
    week: "2026-05-24",
    manager: "Zara",
    wins: [],
    challenges: ["Zəngi sona çatdırmağın yolları"],
    problems: ["Konsultasiyaya gəlməyənlər", "Ödənişi dedikləri vaxt tamamlamamaları"],
  },
] satisfies Array<Omit<HrFeedbackNote, "weekLabel">>;

const managers = Array.from(new Set(teamPerformanceRows.map((row) => row.manager))).sort(
  (first, second) => first.localeCompare(second, "az")
);

const months = Array.from(new Set(teamPerformanceRows.map((row) => getMonthKey(row.date)))).sort();

export function getHrPerformanceData(filters: {
  manager?: string;
  month?: string;
}): HrPerformanceData {
  const manager = normalizeManager(filters.manager);
  const month = normalizeMonth(filters.month);
  const filteredRows = teamPerformanceRows.filter(
    (row) =>
      (!manager || row.manager === manager) &&
      (!month || getMonthKey(row.date) === month)
  );
  const totals = summarizeRows(filteredRows);
  const rankingScopeRows = teamPerformanceRows.filter(
    (row) => !month || getMonthKey(row.date) === month
  );
  const ranking = buildRanking(rankingScopeRows, manager);
  const monthlyTrend = buildMonthlyTrend(manager, month);
  const minDate = filteredRows[0]?.date ?? teamPerformanceRows[0]?.date ?? "";
  const maxDate =
    filteredRows[filteredRows.length - 1]?.date ??
    teamPerformanceRows[teamPerformanceRows.length - 1]?.date ??
    "";

  return {
    filters: {
      manager,
      month,
      activeCount: Number(Boolean(manager)) + Number(Boolean(month)),
    },
    labels: {
      manager: manager || "Bütün komanda",
      month: month ? formatMonthLabel(month) : "Bütün dövr",
      period: minDate && maxDate ? `${formatDate(minDate)} - ${formatDate(maxDate)}` : "-",
      source: "Team Performance (1).xlsx",
      latestUpdate: "14.06.2026 17:52",
    },
    managerOptions: managers.map((item) => ({ value: item, label: item })),
    monthOptions: months.map((item) => ({ value: item, label: formatMonthLabel(item) })),
    metrics: buildMetrics(totals),
    ranking,
    funnel: buildFunnel(totals),
    monthlyTrend,
    feedbackNotes: buildFeedbackNotes(manager, month),
    dailyRows: buildDailyRows(filteredRows),
    totalRows: filteredRows.length,
  };
}

function normalizeManager(value: string | undefined) {
  const manager = formFilterString(value);
  return managers.includes(manager) ? manager : "";
}

function normalizeMonth(value: string | undefined) {
  const month = formFilterString(value);
  return months.includes(month) ? month : "";
}

function summarizeRows(rows: readonly TeamPerformanceRow[]): TeamTotals {
  const base = rows.reduce(
    (total, row) => ({
      hours: total.hours + row.hours,
      calls: total.calls + row.calls,
      answered: total.answered + row.answered,
      invites: total.invites + row.invites,
      liveConsults: total.liveConsults + row.liveConsults,
      sales: total.sales + row.sales,
      revenue: total.revenue + row.revenue,
    }),
    {
      hours: 0,
      calls: 0,
      answered: 0,
      invites: 0,
      liveConsults: 0,
      sales: 0,
      revenue: 0,
    }
  );
  const days = new Set(rows.map((row) => row.date)).size;

  return {
    ...base,
    days,
    responseRate: divide(base.answered, base.calls),
    inviteRate: divide(base.invites, base.answered),
    liveRate: divide(base.liveConsults, base.invites),
    conversionRate: divide(base.sales, base.calls),
    salesPerHour: divide(base.sales, base.hours),
    revenuePerHour: divide(base.revenue, base.hours),
    avgCheck: divide(base.revenue, base.sales),
  };
}

function buildMetrics(totals: TeamTotals): HrPerformanceMetric[] {
  return [
    {
      label: "Gəlir",
      value: formatAmount(totals.revenue),
      helper: `${formatDecimal(totals.revenuePerHour)} AZN / saat`,
      tone: "blue",
    },
    {
      label: "Satış",
      value: formatCount(totals.sales),
      helper: `${formatPercent(totals.conversionRate)} zəngdən satış`,
      tone: "mint",
    },
    {
      label: "Zəng",
      value: formatCount(totals.calls),
      helper: `${formatPercent(totals.responseRate)} cavablanma`,
      tone: "yellow",
    },
    {
      label: "Kons dəvəti",
      value: formatCount(totals.invites),
      helper: `${formatPercent(totals.inviteRate)} cavabdan dəvət`,
      tone: "coral",
    },
  ];
}

function buildRanking(rows: readonly TeamPerformanceRow[], selectedManager: string) {
  return managers
    .map((manager) => {
      const totals = summarizeRows(rows.filter((row) => row.manager === manager));

      return {
        manager,
        totals,
      };
    })
    .filter(({ totals }) => totals.calls > 0 || totals.sales > 0 || totals.revenue > 0)
    .sort((first, second) => second.totals.revenue - first.totals.revenue)
    .map(({ manager, totals }, index): HrManagerSummary => ({
      manager,
      rank: index + 1,
      days: totals.days,
      hours: `${formatDecimal(totals.hours)} saat`,
      calls: formatCount(totals.calls),
      sales: formatCount(totals.sales),
      revenue: formatAmount(totals.revenue),
      conversionRate: formatPercent(totals.conversionRate),
      revenuePerHour: `${formatDecimal(totals.revenuePerHour)} AZN/s`,
      tone: getRankTone(index),
      isSelected: selectedManager === manager,
    }));
}

function buildFunnel(totals: TeamTotals): HrFunnelStep[] {
  const denominator = Math.max(totals.calls, 1);

  return [
    {
      label: "Zəng",
      value: formatCount(totals.calls),
      helper: "Toplam outreach",
      width: 100,
      tone: "info",
    },
    {
      label: "Cavab",
      value: formatCount(totals.answered),
      helper: formatPercent(totals.responseRate),
      width: toProgressWidth(totals.answered / denominator),
      tone: "success",
    },
    {
      label: "Dəvət",
      value: formatCount(totals.invites),
      helper: `${formatPercent(totals.inviteRate)} cavabdan`,
      width: toProgressWidth(totals.invites / denominator),
      tone: "warning",
    },
    {
      label: "Canlı kons.",
      value: formatCount(totals.liveConsults),
      helper: `${formatPercent(totals.liveRate)} dəvətdən`,
      width: toProgressWidth(totals.liveConsults / denominator),
      tone: "neutral",
    },
    {
      label: "Satış",
      value: formatCount(totals.sales),
      helper: `${formatPercent(totals.conversionRate)} zəngdən`,
      width: toProgressWidth(totals.sales / denominator),
      tone: "danger",
    },
  ];
}

function buildMonthlyTrend(selectedManager: string, selectedMonth: string) {
  const trends = months.map((month) => {
    const totals = summarizeRows(
      teamPerformanceRows.filter(
        (row) =>
          getMonthKey(row.date) === month &&
          (!selectedManager || row.manager === selectedManager)
      )
    );

    return {
      month,
      totals,
    };
  });
  const maxRevenue = Math.max(...trends.map((trend) => trend.totals.revenue), 1);

  return trends.map(({ month, totals }): HrMonthlyTrend => ({
    month,
    label: formatMonthLabel(month),
    revenue: formatAmount(totals.revenue),
    sales: `${formatCount(totals.sales)} satış`,
    width: Math.max(8, Math.round((totals.revenue / maxRevenue) * 100)),
    isSelected: selectedMonth === month,
  }));
}

function buildFeedbackNotes(selectedManager: string, selectedMonth: string) {
  return weeklyFeedback
    .filter(
      (note) =>
        (!selectedManager || note.manager === selectedManager) &&
        (!selectedMonth || getMonthKey(note.week) === selectedMonth)
    )
    .sort((first, second) => second.week.localeCompare(first.week))
    .map((note) => ({
      ...note,
      weekLabel: formatDate(note.week),
    }));
}

function buildDailyRows(rows: readonly TeamPerformanceRow[]) {
  return rows
    .slice()
    .sort(
      (first, second) =>
        second.date.localeCompare(first.date) || first.manager.localeCompare(second.manager, "az")
    )
    .slice(0, 40)
    .map((row, index): HrDailyRow => {
      const conversionRate = divide(row.sales, row.calls);
      const revenuePerHour = divide(row.revenue, row.hours);
      const tone = getDailyTone(row, conversionRate);

      return {
        id: `${row.date}-${row.manager}-${index}`,
        ...row,
        dateLabel: formatDate(row.date),
        hours: formatDecimal(row.hours),
        calls: formatCount(row.calls),
        answered: formatCount(row.answered),
        invites: formatCount(row.invites),
        liveConsults: formatCount(row.liveConsults),
        sales: formatCount(row.sales),
        revenue: formatAmount(row.revenue),
        conversionRate: formatPercent(conversionRate),
        revenuePerHour: `${formatDecimal(revenuePerHour)} AZN/s`,
        tone,
        status: getDailyStatus(tone),
      };
    });
}

function getDailyTone(row: TeamPerformanceRow, conversionRate: number): StatusTone {
  if (row.revenue >= 300 || row.sales >= 4 || conversionRate >= 0.2) {
    return "success";
  }

  if (row.sales > 0 || row.revenue > 0) {
    return "info";
  }

  if (row.calls > 0 || row.invites > 0 || row.liveConsults > 0) {
    return "warning";
  }

  return "neutral";
}

function getDailyStatus(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "Güclü gün";
    case "info":
      return "Satış var";
    case "warning":
      return "Follow-up";
    default:
      return "Passiv";
  }
}

function getRankTone(index: number): StatusTone {
  if (index === 0) {
    return "success";
  }

  if (index === 1) {
    return "info";
  }

  if (index === 2) {
    return "warning";
  }

  return "neutral";
}

function toProgressWidth(value: number) {
  return Math.max(6, Math.min(100, Math.round(value * 100)));
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatAmount(value: number) {
  return `${amountFormatter.format(value)} AZN`;
}

function formatCount(value: number) {
  return countFormatter.format(value);
}

function formatDecimal(value: number) {
  return decimalFormatter.format(value);
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function formatMonthLabel(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00`));
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}
