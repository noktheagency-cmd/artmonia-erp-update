import { formFilterString } from "@/modules/shared/form-values";

type SummaryTone = "blue" | "coral" | "yellow" | "mint";

export type HrExcelCellValue = string | number | null;

export type HrPerformanceMetric = {
  label: string;
  value: string;
  helper: string;
  tone: SummaryTone;
};

export type HrExcelTableRow = {
  id: string;
  cells: HrExcelCellValue[];
  manager?: string;
  date?: string;
  month?: string;
};

export type HrExcelTable = {
  title: string;
  headers: string[];
  rows: HrExcelTableRow[];
};

export type HrDashboardSheet = {
  title: string;
  latestUpdate: string;
  sections: HrExcelTable[];
};

export type HrMonthlyAnalysisSheet = {
  title: string;
  period: string;
  ranking: HrExcelTable;
  funnel: HrExcelTable;
  hourly: HrExcelTable;
  weeklyTrend: HrExcelTable;
};

export type HrDailySheet = {
  title: string;
  headers: string[];
  rows: HrExcelTableRow[];
  filteredRows: HrExcelTableRow[];
  totalRows: number;
  filteredCount: number;
};

export type HrWeeklyFeedbackRow = HrExcelTableRow & {
  week: string;
  weekLabel: string;
  wins: string[];
  challenges: string[];
  problems: string[];
};

export type HrWeeklySheet = {
  title: string;
  headers: string[];
  rows: HrWeeklyFeedbackRow[];
  filteredRows: HrWeeklyFeedbackRow[];
};

export type HrGeneralIndicatorsSheet = {
  title: string;
  note: string;
  headers: string[];
  rows: HrExcelTableRow[];
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
    source: string;
    latestUpdate: string;
    workbookShape: string;
  };
  managerOptions: Array<{ value: string; label: string }>;
  monthOptions: Array<{ value: string; label: string }>;
  metrics: HrPerformanceMetric[];
  dashboard: HrDashboardSheet;
  monthlyAnalysis: HrMonthlyAnalysisSheet;
  daily: HrDailySheet;
  weekly: HrWeeklySheet;
  generalIndicators: HrGeneralIndicatorsSheet;
};

type DailyRawRow = readonly [
  date: string,
  manager: string,
  start: string | number | null,
  end: string | number | null,
  hours: number | null,
  calls: number | null,
  answered: number | null,
  invites: number | null,
  liveConsults: number | null,
  directVisits: number | null,
  sales: number | null,
  revenue: number | null,
  note: string | null,
  inviteRate: number | null,
  conversionRate: number | null,
  avgCheck: number | null,
  salesPerHour: number | null,
  callsPerHour: number | null,
  revenuePerHour: number | null,
];

type RawTable = {
  title: string;
  headers: string[];
  rows: HrExcelCellValue[][];
};

const allTeamLabel = "B\u00fct\u00fcn komanda";
const allPeriodLabel = "B\u00fct\u00fcn d\u00f6vr";
const sourceWorkbookName = "Team Performance (1).xlsx";
const workbookShapeLabel = "5 sheet / 75 g\u00fcnd\u0259lik qeyd";

const dailySheetTitle = "G\u00fcnd\u0259lik";
const dailyHeaders = ["Tarix","Menecer","Ba\u015flama","Bitm\u0259","\u0130\u015f Saat\u0131","Z\u0259ng (total)","Cavab Veril\u0259n","Kons D\u0259v\u0259ti","Canl\u0131 Kons/S\u0131naq","Birba\u015fa G\u0259li\u015f","Sat\u0131\u015f","G\u0259lir (AZN)","Qeyd","D\u0259v\u0259t %","Konv %","Orta \u00c7ek","Saatda Sat\u0131\u015f","Saatda Z\u0259ng","Saatda G\u0259lir"] as string[];
const dailyRowsRaw = [["2026-04-20","Ay\u015f\u0259n","13:00","19:30",6.5,16,16,2,1,0,4,180,null,0.125,0.23529411764705882,45,0.6153846153846154,2.4615384615384617,27.692307692307693],["2026-04-20","Qeyri menecer",null,null,0,null,null,null,null,null,1,200,null,0,0,200,0,0,0],["2026-04-21","Ay\u015f\u0259n","15:00","20:00",5,20,16,4,2,0,5,330,null,0.25,0.22727272727272727,66,1,4,66],["2026-04-21","Zara","14:30","17:20",2.8333333333333335,20,11,1,0,0,1,50,null,0.09090909090909091,0.05,50,0.3529411764705882,7.0588235294117645,17.64705882352941],["2026-04-22","Ay\u015f\u0259n","13:30","19:00",5.5,7,7,3,1,0,4,140,null,0.42857142857142855,0.5,35,0.7272727272727273,1.2727272727272727,25.454545454545453],["2026-04-22","Zara","15:00","19:30",4.5,6,3,2,2,0,2,230,null,0.6666666666666666,0.25,115,0.4444444444444444,1.3333333333333333,51.111111111111114],["2026-04-23","Ay\u015f\u0259n","13:00","18:00",5,29,29,2,0,0,0,0,null,0.06896551724137931,0,0,0,5.8,0],["2026-04-23","Zara","15:10","20:00",4.833333333333333,8,7,1,1,0,1,80,null,0.14285714285714285,0.1111111111111111,80,0.20689655172413796,1.6551724137931036,16.551724137931036],["2026-04-24","Ay\u015f\u0259n","12:00","20:00",8,8,8,3,3,0,1,150,null,0.375,0.09090909090909091,150,0.125,1,18.75],["2026-04-24","Nicat","20:00","20:10",0.16666666666666666,1,1,1,0,0,0,0,null,1,0,0,0,6,0],["2026-04-24","Zara","16:30","19:30",3,16,14,3,0,0,1,150,null,0.21428571428571427,0.0625,150,0.3333333333333333,5.333333333333333,50],["2026-04-25","Nicat","18:00","19:00",1,2,2,2,1,0,0,0,null,1,0,0,0,2,0],["2026-04-25","Zara","13:20","20:20",7,19,14,5,2,0,2,110,null,0.35714285714285715,0.09523809523809523,55,0.2857142857142857,2.7142857142857144,15.714285714285714],["2026-04-26","Nicat","16:30","20:40",4.166666666666667,3,2,2,2,0,1,80,null,1,0.2,80,0.24,0.72,19.2],["2026-04-26","Zara","12:30","20:40",8.166666666666666,29,25,7,2,0,0,0,null,0.28,0,0,0,3.5510204081632657,0],["2026-04-27","Ay\u015f\u0259n","16:00","21:00",5,8,7,1,1,0,1,30,null,0.14285714285714285,0.1111111111111111,30,0.2,1.6,6],["2026-04-27","Zara","16:00","20:40",4.666666666666667,17,13,4,2,0,1,30,null,0.3076923076923077,0.05263157894736842,30,0.21428571428571427,3.642857142857143,6.428571428571428],["2026-04-28","Ay\u015f\u0259n","13:30","20:00",6.5,20,11,2,1,0,4,120,null,0.18181818181818182,0.19047619047619047,30,0.6153846153846154,3.076923076923077,18.46153846153846],["2026-04-29","Zara","15:30","21:00",5.5,0,0,0,3,0,1,150,null,0,0.3333333333333333,150,0.18181818181818182,0,27.272727272727273],["2026-04-29","Ay\u015f\u0259n","14:00","19:30",5.5,11,8,2,1,0,1,30,null,0.25,0.08333333333333333,30,0.18181818181818182,2,5.454545454545454],["2026-04-30","Zara","16:30","21:10",4.666666666666667,23,13,7,1,0,0,0,null,0.5384615384615384,0,0,0,4.928571428571428,0],["2026-04-30","Ay\u015f\u0259n","14:30","21:00",6.5,22,15,7,1,0,2,400,null,0.4666666666666667,0.08695652173913043,200,0.3076923076923077,3.3846153846153846,61.53846153846154],["2026-05-01","Zara","14:00","21:10",7.166666666666667,30,17,3,3,0,1,80.4761904761901,null,0.17647058823529413,0.030303030303030304,80.4761904761901,0.13953488372093023,4.186046511627906,11.229235880398617],["2026-05-01","Ay\u015f\u0259n","15:40","20:20",4.666666666666667,23,14,4,1,0,5,340,null,0.2857142857142857,0.20833333333333334,68,1.0714285714285714,4.928571428571428,72.85714285714285],["2026-05-02","Zara","13:20","20:20",7,32,18,3,3,0,1,100,null,0.16666666666666666,0.02857142857142857,100,0.14285714285714285,4.571428571428571,14.285714285714286],["2026-05-02","Ay\u015f\u0259n","14:00","20:00",6,22,5,1,3,0,4,110,null,0.2,0.16,27.5,0.6666666666666666,3.6666666666666665,18.333333333333332],["2026-05-03","Zara","14:00","20:00",6,24,18,3,1,0,1,50,null,0.16666666666666666,0.04,50,0.16666666666666666,4,8.333333333333334],["2026-05-04","Ay\u015f\u0259n","15:00","15:30",0.5,2,2,0,0,0,2,180,null,0,1,90,4,4,360],["2026-05-04","Zara","17:30","20:30",3,11,10,2,2,0,1,30,null,0.2,0.07692307692307693,30,0.3333333333333333,3.6666666666666665,10],["2026-05-05","Zara","14:50","15:30",0.6666666666666666,5,5,0,0,0,1,30,null,0,0.2,30,1.5,7.5,45],["2026-05-07","Ay\u015f\u0259n","18:00","20:00",2,14,12,1,0,0,1,150,null,0.08333333333333333,0.07142857142857142,150,0.5,7,75],["2026-05-07","Zara","15:50","20:20",4.5,33,26,4,0,0,0,0,null,0.15384615384615385,0,0,0,7.333333333333333,0],["2026-05-08","Ay\u015f\u0259n","17:00","18:30",1.5,35,5,2,0,0,0,0,null,0.4,0,0,0,23.333333333333332,0],["2026-05-08","Zara","15:20","19:00",3.6666666666666665,28,23,1,1,0,2,230,null,0.043478260869565216,0.06896551724137931,115,0.5454545454545455,7.636363636363637,62.72727272727273],["2026-05-09","Zara","14:00","20:20",6.333333333333333,11,10,2,2,0,1,200,null,0.2,0.07692307692307693,200,0.15789473684210528,1.736842105263158,31.578947368421055],["2026-05-09","Nicat",null,null,null,null,null,null,null,0,null,null,null,null,null,null,null,null,null],["2026-05-10","Zara","12:50","19:30",6.666666666666667,28,26,2,0,0,0,0,null,0.07692307692307693,0,0,0,4.2,0],["2026-05-10","Nicat","12:36","18:04",5.466666666666667,13,13,2,1,0,2,40,null,0.15384615384615385,0.14285714285714285,20,0.36585365853658536,2.3780487804878048,7.317073170731708],["2026-05-11","Ay\u015f\u0259n","15:00","16:50",1.8333333333333333,12,4,0,1,0,3,150,null,0,0.23076923076923078,50,1.6363636363636365,6.545454545454546,81.81818181818183],["2026-05-11","Zara","15:40","20:40",5,11,8,1,3,0,3,280,null,0.125,0.21428571428571427,93.33333333333333,0.6,2.2,56],["2026-05-12","Ay\u015f\u0259n","18:00","19:00",1,10,4,1,0,0,0,0,null,0.25,0,0,0,10,0],["2026-05-12","Zara","15:50","19:50",4,10,6,1,0,0,1,100,null,0.16666666666666666,0.1,100,0.25,2.5,25],["2026-05-13","Ay\u015f\u0259n","17:30","20:30",3,16,12,3,1,null,1,30,null,0.25,0.058823529411764705,30,0.3333333333333333,5.333333333333333,10],["2026-05-14","Zara","17:00","19:50",2.8333333333333335,4,3,1,0,0,0,0,null,0.3333333333333333,0,0,0,1.4117647058823528,0],["2026-05-14","Ay\u015f\u0259n",null,null,0,10,3,1,0,0,0,0,null,0.3333333333333333,0,0,0,0,0],["2026-05-15","Zara","17:20","19:20",2,5,4,1,0,0,1,20,null,0.25,0.2,20,0.5,2.5,10],["2026-05-15","Ay\u015f\u0259n","17:00","19:30",2.5,11,8,4,0,0,0,0,null,0.5,0,0,0,4.4,0],["2026-05-16","Zara","13:30","16:50",3.3333333333333335,6,5,1,0,0,0,0,null,0.2,0,0,0,1.7999999999999998,0],["2026-05-16","Ay\u015f\u0259n",null,null,0,0,0,0,1,0,4,320,null,0,4,80,0,0,0],["2026-05-17","Nicat",null,null,0,null,null,null,null,null,null,null,null,0,0,0,0,0,0],["2026-05-17","Zara","11:40","17:00",5.333333333333333,14,10,2,1,0,0,0,null,0.2,0,0,0,2.625,0],["2026-05-18","Ay\u015f\u0259n","14:20","18:00",3.6666666666666665,7,5,2,2,0,0,0,null,0.4,0,0,0,1.9090909090909092,0],["2026-05-19","Zara","18:10","19:30",1.3333333333333333,7,3,1,2,0,0,0,null,0.3333333333333333,0,0,0,5.25,0],["2026-05-19","Ay\u015f\u0259n",null,null,0,null,null,null,1,0,2,210,null,0,2,105,0,0,0],["2026-05-20","Zara","15:34","20:10",4.6,8,5,1,1,0,2,220,null,0.2,0.2222222222222222,110,0.4347826086956522,1.7391304347826089,47.82608695652174],["2026-05-21","Zara","14:20","16:30",2.1666666666666665,5,5,0,2,0,1,20,null,0,0.14285714285714285,20,0.46153846153846156,2.307692307692308,9.230769230769232],["2026-05-22","Ay\u015f\u0259n",null,null,0,4,2,1,0,0,1,30,null,0.5,0.25,30,0,0,0],["2026-05-22","Zara",null,null,0,null,null,null,null,null,null,null,null,0,0,0,0,0,0],["2026-05-22","Zara",null,null,0,null,null,null,null,null,null,null,null,0,0,0,0,0,0],["2026-05-23","Ay\u015f\u0259n","17:30","18:39",1.15,11,7,2,0,0,0,0,null,0.2857142857142857,0,0,0,9.56521739130435,0],["2026-05-23","Nicat","11:00","21:00",10,0,0,0,1,0,1,150,null,0,1,150,0.1,0,15],["2026-05-23","Zara",0,0,0,0,0,1,0,0,2,80,null,0,0,40,0,0,0],["2026-05-24","Nicat","11:00","21:00",10,11,5,2,3,0,1,60,null,0.4,0.07142857142857142,60,0.1,1.1,6],["2026-05-24","Zara","15:30","19:00",3.5,9,8,0,2,0,0,0,null,0,0,0,0,2.5714285714285716,0],["2026-05-25","Ay\u015f\u0259n",0,0,0,2,2,1,1,0,1,60,null,0.5,0.3333333333333333,60,0,0,0],["2026-05-25","Zara","16:00","20:20",4.333333333333333,11,9,1,0,0,1,20,null,0.1111111111111111,0.09090909090909091,20,0.23076923076923078,2.5384615384615388,4.615384615384616],["2026-05-26","Zara","14:00","17:00",3,9,7,2,0,0,0,0,null,0.2857142857142857,0,0,0,3,0],["2026-05-27","Nicat","14:00","21:00",7,40,30,1,2,1,1,30,null,0.03333333333333333,0.023255813953488372,30,0.14285714285714285,5.714285714285714,4.285714285714286],["2026-05-27","Ay\u015f\u0259n","17:00","18:00",1,7,2,0,0,0,1,150,null,0,0.14285714285714285,150,1,7,150],["2026-05-28","Zara","14:00","16:00",2,9,8,3,0,0,1,150,null,0.375,0.1111111111111111,150,0.5,4.5,75],["2026-05-28","Nicat",null,null,0,null,null,null,null,null,1,80,null,0,0,80,0,0,0],["2026-05-28","Ay\u015f\u0259n","17:20","20:20",3,19,7,1,3,0,4,360,null,0.14285714285714285,0.18181818181818182,90,1.3333333333333333,6.333333333333333,120],["2026-05-29","Zara","12:25","15:25",3,4,4,1,1,0,1,20,null,0.25,0.2,20,0.3333333333333333,1.3333333333333333,6.666666666666667],["2026-05-29","Nicat","15:36","15:39",0.05,1,1,1,1,0,0,null,null,1,0,0,0,20,0],["2026-05-30","Zara","14:10","17:35",3.4166666666666665,17,14,1,0,0,0,0,null,0.07142857142857142,0,0,0,4.975609756097561,0]] as const satisfies readonly DailyRawRow[];

const monthlyAnalysisTitle = "\ud83d\udcca ARTMONIA \u2014 AYLIQ PERFORMANS ANAL\u0130Z\u0130";
const monthlyAnalysisPeriod = "D\u00f6vr: 01.05.2026 \u2014 30.05.2026";
const monthlySectionsRaw = [{"title":"\ud83c\udfc6 1. SIRALAMA C\u018fDV\u018fL\u0130","headers":["Menecer","G\u00fcn","Saat","Z\u0259ng","Sat\u0131\u015f","G\u0259lir","D\u0259v\u0259t %","Konv %","Orta \u00c7ek","Saatda G\u0259lir","Rank"],"rows":[["Ay\u015f\u0259n",18,31.816666666666666,205,29,2090,0.2553191489361702,0.1324200913242009,72.06896551724138,65.68884232582504,"#1"],["Zara",27,94.85,331,21,1630.4761904761901,0.15079365079365079,0.059154929577464786,77.64172335600905,17.19004945151492,"#2"],["Nicat",8,32.516666666666666,65,6,360,0.12244897959183673,0.08108108108108109,60,11.07124551512045,"#3"]]},{"title":"\ud83d\udd3b 2. FUNNEL SIZINTISI","headers":["Menecer","Z\u0259ng","\u2192 Cavab","%","\u2192 D\u0259v\u0259t","%","\u2192 Canl\u0131","%","\u2192 Sat\u0131\u015f","%","\u00dcmumi %"],"rows":[["Ay\u015f\u0259n",205,94,0.4585365853658537,24,0.2553191489361702,14,0.5833333333333334,29,2.0714285714285716,0.14146341463414633],["Nicat",65,49,0.7538461538461538,6,0.12244897959183673,8,1.3333333333333333,6,0.75,0.09230769230769231],["Zara",331,252,0.7613293051359517,38,0.15079365079365079,24,0.631578947368421,21,0.875,0.0634441087613293]]},{"title":"\u23f1\ufe0f 3. SAAT-DAN G\u018fL\u0130R ANAL\u0130Z\u0130","headers":["Menecer","C\u0259mi Saat","C\u0259mi G\u0259lir","Saatda G\u0259lir","Saatda Z\u0259ng","Saatda Sat\u0131\u015f"],"rows":[["Ay\u015f\u0259n",31.816666666666666,2090,65.68884232582504,6.44316396018858,0.9114719748559456],["Nicat",32.516666666666666,360,11.07124551512045,1.9989748846745259,0.18452075858534087],["Zara",94.85,1630.4761904761901,17.19004945151492,3.4897206114918293,0.22140221402214025]]},{"title":"\ud83d\udcc8 4. H\u018fFT\u018fL\u0130K TREND (Sat\u0131\u015f / Konv %)","headers":["Menecer","H. 27.04","H. 04.05","H. 11.05","H. 18.05","H. 25.05"],"rows":[["Ay\u015f\u0259n","9 (18.4%)","3 (5.9%)","8 (12.9%)","3 (12.0%)","6 (18.8%)"],["Nicat","0 (0.0%)","2 (14.3%)","0 (0.0%)","2 (13.3%)","2 (4.4%)"],["Zara","3 (3.2%)","5 (4.1%)","5 (9.3%)","5 (13.9%)","3 (5.9%)"]]}] as RawTable[];

const weeklySheetTitle = "H\u0259ft\u0259lik";
const weeklyHeaders = ["H\u0259ft\u0259 (B.e.)","Menecer","U\u011fur 1","U\u011fur 2","U\u011fur 3","\u00c7\u0259tinlik 1","\u00c7\u0259tinlik 2","\u00c7\u0259tinlik 3","Problem 1","Problem 2","Problem 3"] as string[];
const weeklyRowsRaw = [["2026-04-25","Zara","Al\u0131c\u0131l\u0131ar\u0131n tipaj\u0131n\u0131 tutub onlara uygunla\u015fmaq","\u2060onlar\u0131n ist\u0259diyini veririk imaj\u0131 yaratmaq","\u206020% s\u0131rf siz\u0259 t\u0259klif edir\u0259m kimi dey\u0259nd\u0259 \u0259n yax\u015f\u0131s\u0131n\u0131 onlara saxlam\u0131\u015fam kimi d\u00fc\u015f\u00fcn\u0259nl\u0259r olurdu","\u2060uzun zaman aral\u0131g\u0131 se\u00e7\u0259n \u00e7oxdur konsa","\u2060b\u0259zil\u0259ri art\u0131q r\u0259ssam oldugu \u00fc\u00e7\u00fcn onlara adi g\u0259lir","sad\u0259c\u0259 maraqlanmaq \u00fc\u00e7\u00fcn yazanlar \u00e7oxdur","\u2060iki dild\u0259 dan\u0131\u015fanda qar\u0131\u015fd\u0131rd\u0131g\u0131m olub","\u2060endirimli satmaq daha asan idi, t\u0259cili 10 yer tutmaq b\u0259zil\u0259rini \u00e7\u0259kirdi","\u2060ilk etdiyim z\u0259ngl\u0259r \u00e7ox vaxt \u0259n u\u011furlu olur"],["2026-04-25","Ay\u015f\u0259n"],["2026-05-10","Nicat","empatiya t\u0259zyiq v\u0259.s","qar\u015f\u0131 t\u0259r\u0259fi dan\u0131\u015fma\u011fa vadar edib ona n\u0259yi nec\u0259  sataca\u011f\u0131m\u0131 b\u0259lirl\u0259m\u0259k ","d\u0259v\u0259t","sertifikatdan sual","\u00f6d\u0259ni\u015fsiz bilirl\u0259r s\u0259rgini",null,"T\u0259l\u0259sm\u0259k"],["2026-05-10","Zara","Daha s\u0259mimi dialoqlar ","Probleml\u0259rini \u00e7ox dinl\u0259m\u0259k","Etibar yaratmaq Dostla\u015fmaq","Z\u0259ngl\u0259rd\u0259n sonra cavab gozl\u0259m\u0259k uzun olur","M\u00fc\u015ft\u0259rininmaraginisohb\u0259t boyu saxlamaq",null,"\u00c7ox dan\u0131\u015fmaqdan sonra n\u0259tic\u0259 az ola bilir","Maraqlan\u0131b d\u0259rhal cavab verilmir","Sat\u0131\u015flar\u0131n stabil olmamag\u0131 b\u0259z\u0259n cox b\u0259z\u0259n kritik az ola bilir"],["2026-05-24","Zara",null,null,null,"z\u0259ngi sona catdirmagin yollari",null,null,"konsa g\u0259lm\u0259y\u0259nl\u0259r ","od\u0259nisi dedikl\u0259ri vaxt tamamlamamalar\u0131"]] as HrExcelCellValue[][];

const dashboardTitle = "\ud83c\udfaf ARTMONIA \u2014 KOMANDA PERFORMANS DASHBOARD";
const dashboardLatestUpdateLine = "Son yenil\u0259nm\u0259: 14.06.2026 17:52";
const dashboardSectionsRaw = [{"title":"\ud83d\udcc5 BU H\u018fFT\u018f","headers":["Menecer","G\u00fcn","Saat","Z\u0259ng","Cavab","D\u0259v\u0259t","Canl\u0131","Sat\u0131\u015f","G\u0259lir","Konv %"],"rows":[["Ay\u015f\u0259n",0,0,0,0,0,0,0,0,0],["Nicat",0,0,0,0,0,0,0,0,0],["Zara",0,0,0,0,0,0,0,0,0]]},{"title":"\ud83d\udcc6 BU AY","headers":["Menecer","G\u00fcn","Saat","Z\u0259ng","Cavab","D\u0259v\u0259t","Canl\u0131","Sat\u0131\u015f","G\u0259lir","Konv %"],"rows":[["Ay\u015f\u0259n",0,0,0,0,0,0,0,0,0],["Nicat",0,0,0,0,0,0,0,0,0],["Zara",0,0,0,0,0,0,0,0,0]]},{"title":"\ud83d\udcca C\u018fM\u0130","headers":["Menecer","G\u00fcn","Saat","Z\u0259ng","Cavab","D\u0259v\u0259t","Canl\u0131","Sat\u0131\u015f","G\u0259lir","Konv %"],"rows":[["Ay\u015f\u0259n",27,85.31666666666666,346,211,50,25,51,3470,0.13746630727762804],["Nicat",11,37.849999999999994,71,54,11,11,7,440,0.08433734939759036],["Zara",36,140.01666666666665,469,352,68,37,30,2430.47619047619,0.05928853754940711]]}] as RawTable[];

const generalIndicatorsTitle = "\ud83d\udcc8 ARTMONIA \u2014 \u00dcMUM\u0130 AYLIQ G\u00d6ST\u018fR\u0130C\u0130L\u018fR";
const generalIndicatorsNote = "\ud83d\udca1 \"Lead Say\u0131\" s\u00fctununu s\u0259n \u0259l il\u0259 yaz\u0131rsan. Qalan s\u00fctunlar avtomatik g\u0259lir.";
const generalHeaders = ["Ay","Lead Say\u0131","Z\u0259ng","Cavab","Kons D\u0259v\u0259ti","Canl\u0131 Kons","Sat\u0131\u015f","G\u0259lir (AZN)","Lead\u2192Sat\u0131\u015f %","Z\u0259ng\u2192Sat\u0131\u015f %","Orta \u00c7ek","Saatda G\u0259lir","Entry Say","Saat"] as string[];
const generalRowsRaw = [["2026-04-01",null,285,222,61,27,33,2460,null,0.11578947368421053,74.54545454545455,23.65384615384615,22,104],["2026-05-01",null,601,395,68,46,56,4080.47619047619,null,0.09317803660565724,72.86564625850339,25.63381545687063,49,159.18333333333334]] as HrExcelCellValue[][];

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

const monthFormatter = new Intl.DateTimeFormat("az-AZ", {
  month: "long",
  year: "numeric",
});

const dailyRows = buildDailyRows();
const weeklyRows = buildWeeklyRows();
const dashboardSections = dashboardSectionsRaw.map((table, index) => buildTable(table, `dashboard-${index}`));
const monthlySections = monthlySectionsRaw.map((table, index) => buildTable(table, `monthly-${index}`));
const generalRows = buildTable(
  {
    title: generalIndicatorsTitle,
    headers: generalHeaders,
    rows: generalRowsRaw,
  },
  "general"
).rows;

const managers = Array.from(new Set(dailyRows.map((row) => row.manager).filter(isString))).sort(
  (first, second) => first.localeCompare(second, "az")
);

const months = Array.from(new Set(dailyRows.map((row) => row.month).filter(isString))).sort();

export function getHrPerformanceData(filters: {
  manager?: string;
  month?: string;
}): HrPerformanceData {
  const manager = normalizeManager(filters.manager);
  const month = normalizeMonth(filters.month);
  const filteredDailyRows = dailyRows.filter(
    (row) =>
      (!manager || row.manager === manager) &&
      (!month || row.month === month)
  );
  const filteredWeeklyRows = weeklyRows.filter(
    (row) =>
      (!manager || row.manager === manager) &&
      (!month || row.month === month)
  );

  return {
    filters: {
      manager,
      month,
      activeCount: Number(Boolean(manager)) + Number(Boolean(month)),
    },
    labels: {
      manager: manager || allTeamLabel,
      month: month ? formatMonthLabel(month) : allPeriodLabel,
      source: sourceWorkbookName,
      latestUpdate: getLatestUpdate(),
      workbookShape: workbookShapeLabel,
    },
    managerOptions: managers.map((item) => ({ value: item, label: item })),
    monthOptions: months.map((item) => ({ value: item, label: formatMonthLabel(item) })),
    metrics: buildDashboardMetrics(),
    dashboard: {
      title: dashboardTitle,
      latestUpdate: getLatestUpdate(),
      sections: dashboardSections,
    },
    monthlyAnalysis: {
      title: monthlyAnalysisTitle,
      period: monthlyAnalysisPeriod,
      ranking: monthlySections[0],
      funnel: monthlySections[1],
      hourly: monthlySections[2],
      weeklyTrend: monthlySections[3],
    },
    daily: {
      title: dailySheetTitle,
      headers: dailyHeaders,
      rows: dailyRows,
      filteredRows: filteredDailyRows,
      totalRows: dailyRows.length,
      filteredCount: filteredDailyRows.length,
    },
    weekly: {
      title: weeklySheetTitle,
      headers: weeklyHeaders,
      rows: weeklyRows,
      filteredRows: filteredWeeklyRows,
    },
    generalIndicators: {
      title: generalIndicatorsTitle,
      note: generalIndicatorsNote,
      headers: generalHeaders,
      rows: generalRows,
    },
  };
}

function buildDailyRows(): HrExcelTableRow[] {
  return dailyRowsRaw.map((row, index) => {
    const date = row[0];
    const manager = row[1];

    return {
      id: `daily-${date}-${manager}-${index}`,
      cells: [...row],
      date,
      manager,
      month: getMonthKey(date),
    };
  });
}

function buildWeeklyRows(): HrWeeklyFeedbackRow[] {
  return weeklyRowsRaw.map((cells, index) => {
    const week = typeof cells[0] === "string" ? cells[0] : "";
    const manager = typeof cells[1] === "string" ? cells[1] : "";
    const wins = extractTextCells(cells.slice(2, 5));
    const challenges = extractTextCells(cells.slice(5, 8));
    const problems = extractTextCells(cells.slice(8, 11));

    return {
      id: `weekly-${week}-${manager}-${index}`,
      cells,
      date: week,
      week,
      weekLabel: week ? formatDate(week) : "-",
      manager,
      month: week ? getMonthKey(week) : undefined,
      wins,
      challenges,
      problems,
    };
  });
}

function buildTable(raw: RawTable, prefix: string): HrExcelTable {
  return {
    title: raw.title,
    headers: raw.headers,
    rows: raw.rows.map((cells, index) => ({
      id: `${prefix}-${index}`,
      cells,
      manager: getManagerFromRow(raw.headers, cells),
      date: getDateFromRow(raw.headers, cells),
      month: getMonthFromRow(raw.headers, cells),
    })),
  };
}

function buildDashboardMetrics(): HrPerformanceMetric[] {
  const totalSection = dashboardSections.find((section) => section.title.includes("C")) ?? dashboardSections[2];
  const totals = totalSection.rows.reduce(
    (sum, row) => ({
      days: sum.days + toNumber(row.cells[1]),
      hours: sum.hours + toNumber(row.cells[2]),
      calls: sum.calls + toNumber(row.cells[3]),
      answered: sum.answered + toNumber(row.cells[4]),
      invites: sum.invites + toNumber(row.cells[5]),
      liveConsults: sum.liveConsults + toNumber(row.cells[6]),
      sales: sum.sales + toNumber(row.cells[7]),
      revenue: sum.revenue + toNumber(row.cells[8]),
    }),
    {
      days: 0,
      hours: 0,
      calls: 0,
      answered: 0,
      invites: 0,
      liveConsults: 0,
      sales: 0,
      revenue: 0,
    }
  );
  const conversionRate = divide(totals.sales, totals.calls);

  return [
    {
      label: "G\u0259lir",
      value: formatAmount(totals.revenue),
      helper: `${formatDecimal(divide(totals.revenue, totals.hours))} AZN / saat`,
      tone: "blue",
    },
    {
      label: "Sat\u0131\u015f",
      value: formatCount(totals.sales),
      helper: `${formatPercent(conversionRate)} konversiya`,
      tone: "mint",
    },
    {
      label: "Z\u0259ng",
      value: formatCount(totals.calls),
      helper: `${formatPercent(divide(totals.answered, totals.calls))} cavab`,
      tone: "yellow",
    },
    {
      label: "\u0130\u015f saat\u0131",
      value: `${formatDecimal(totals.hours)} saat`,
      helper: `${formatDecimal(divide(totals.calls, totals.hours))} zəng / saat`,
      tone: "coral",
    },
  ];
}

function normalizeManager(value: string | undefined) {
  const manager = formFilterString(value);
  return managers.includes(manager) ? manager : "";
}

function normalizeMonth(value: string | undefined) {
  const month = formFilterString(value);
  return months.includes(month) ? month : "";
}

function getLatestUpdate() {
  return dashboardLatestUpdateLine.replace(/^.*?:\s*/, "");
}

function getManagerFromRow(headers: string[], cells: HrExcelCellValue[]) {
  const managerIndex = headers.findIndex((header) => header === "Menecer");
  const manager = cells[managerIndex];

  return typeof manager === "string" ? manager : undefined;
}

function getDateFromRow(headers: string[], cells: HrExcelCellValue[]) {
  const dateIndex = headers.findIndex(
    (header) => header === "Tarix" || header === "Ay" || header.startsWith("H\u0259ft\u0259")
  );
  const date = cells[dateIndex];

  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function getMonthFromRow(headers: string[], cells: HrExcelCellValue[]) {
  const date = getDateFromRow(headers, cells);

  return date ? getMonthKey(date) : undefined;
}

function extractTextCells(cells: HrExcelCellValue[]) {
  return cells.filter((cell): cell is string => typeof cell === "string" && cell.trim().length > 0);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function toNumber(value: HrExcelCellValue) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
  const [year, month, day] = value.split("-");

  return `${day}.${month}.${year}`;
}

function formatMonthLabel(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00`));
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}
