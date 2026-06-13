export const kpis = [
  {
    label: "Active students",
    value: "134",
    delta: "+8.2%",
    helper: "Learning this month",
    tone: "primary",
  },
  {
    label: "Active MRR",
    value: "17,364 AZN",
    delta: "+7.4%",
    helper: "Registered active revenue",
    tone: "light",
  },
  {
    label: "Debt amount",
    value: "7,170 AZN",
    delta: "-3.1%",
    helper: "From invoice balance",
    tone: "light",
  },
  {
    label: "New leads",
    value: "42",
    delta: "+12.8%",
    helper: "Waiting for follow-up",
    tone: "light",
  },
] as const;

export const revenueBars = [
  { label: "Mar", value: 38 },
  { label: "Apr", value: 52 },
  { label: "May", value: 61 },
  { label: "Jun", value: 74 },
  { label: "Jul", value: 63 },
  { label: "Aug", value: 88 },
  { label: "Sep", value: 79 },
];

export const debtAging = [
  { label: "0-3 days", value: 28, color: "#90adff" },
  { label: "4-7 days", value: 19, color: "#ffe28a" },
  { label: "8-14 days", value: 23, color: "#f7a36f" },
  { label: "15+ days", value: 30, color: "#ff7972" },
];

export const tasks = [
  "Call 7 overdue families",
  "Review 3 frozen return dates",
  "Approve June teacher payout",
  "Assign 5 group-waiting students",
];

export const statusSummary = [
  { label: "Active", value: 134, delta: "+8.2%", tone: "blue" },
  { label: "Debt", value: 59, delta: "-3.1%", tone: "coral" },
  { label: "Group waiting", value: 23, delta: "+4", tone: "yellow" },
  { label: "Frozen", value: 35, delta: "12 return", tone: "mint" },
] as const;

export const students = [
  {
    code: "ART-1024",
    name: "Leyla Mammadova",
    phone: "+994 50 412 18 90",
    program: "Base Package",
    teacher: "Aysel H.",
    dueDate: "12 Jun",
    balance: "0 AZN",
    status: "Active",
    tone: "success",
    lastContact: "Today",
  },
  {
    code: "ART-1041",
    name: "Murad Aliyev",
    phone: "+994 55 771 02 14",
    program: "Ability Exam",
    teacher: "Nigar R.",
    dueDate: "04 Jun",
    balance: "180 AZN",
    status: "Debt",
    tone: "danger",
    lastContact: "2 days ago",
  },
  {
    code: "ART-1068",
    name: "Amina Gasimli",
    phone: "+994 77 621 44 10",
    program: "Kids Group",
    teacher: "Pending",
    dueDate: "18 Jun",
    balance: "Advance 50 AZN",
    status: "Waiting",
    tone: "warning",
    lastContact: "Yesterday",
  },
  {
    code: "ART-1082",
    name: "Orkhan Safarli",
    phone: "+994 51 901 33 77",
    program: "Amsterdam",
    teacher: "Rauf M.",
    dueDate: "Paused",
    balance: "0 AZN",
    status: "Frozen",
    tone: "info",
    lastContact: "Return 20 Jun",
  },
  {
    code: "ART-1115",
    name: "Zahra Karimova",
    phone: "+994 70 488 61 19",
    program: "Pro Package",
    teacher: "Aysel H.",
    dueDate: "12 Jun",
    balance: "90 AZN",
    status: "Partial",
    tone: "neutral",
    lastContact: "Today",
  },
  {
    code: "ART-1130",
    name: "Tural Huseynov",
    phone: "+994 50 219 16 49",
    program: "Italy Program",
    teacher: "Nigar R.",
    dueDate: "30 May",
    balance: "240 AZN",
    status: "Overdue",
    tone: "danger",
    lastContact: "No reply",
  },
] as const;
