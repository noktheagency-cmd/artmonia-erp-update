import Link from "next/link";
import { ArrowUpRight, BookOpen, CheckCircle2, CircleDot, Megaphone, Sparkles, Target, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DashboardTasksPanel } from "@/modules/dashboard/dashboard-tasks-panel";
import type { RoleDashboardData } from "@/modules/dashboard/role-dashboard-query";
import { RolePerformanceChart } from "@/modules/dashboard/role-performance-chart";
import type { TaskData } from "@/modules/tasks/queries";
import "./role-dashboard.css";

type TaskAction = (formData: FormData) => unknown | Promise<unknown>;

const icons = { sales: Target, teacher: BookOpen, marketing: Megaphone } as const;
const kpiIcons = [UsersRound, CircleDot, CheckCircle2, Sparkles] as const;

export function RoleDashboard({ data, taskData, createTaskAction, updateTaskStatusAction }: { data: RoleDashboardData; taskData: TaskData; createTaskAction: TaskAction; updateTaskStatusAction: TaskAction }) {
  const HeroIcon = icons[data.kind];
  return <section className={`role-dashboard is-${data.kind}`}>
    <Card className="role-dashboard-hero">
      <CardContent className="role-dashboard-hero-content">
        <div className="role-dashboard-hero-icon"><HeroIcon /></div>
        <div>
          <div className="role-dashboard-greeting"><h1>Salam, {firstName(data.actorName)}</h1><Badge variant="secondary">{roleLabel(data.kind)}</Badge></div>
          <h2>{data.title}</h2><p>{data.description}</p>
        </div>
        <Link href={data.primaryHref}>{data.primaryLabel}<ArrowUpRight /></Link>
      </CardContent>
    </Card>

    {data.kpis.length ? <div className="role-dashboard-kpis">{data.kpis.map((item, index) => {
      const Icon = kpiIcons[index] ?? Sparkles;
      return <Card className={`role-dashboard-kpi is-${item.tone}`} size="sm" key={item.label}>
        <CardHeader><span className="role-dashboard-kpi-icon"><Icon /></span><CardDescription>{item.label}</CardDescription></CardHeader>
        <CardContent><CardTitle>{item.value}</CardTitle><p>{item.helper}</p>{item.progress !== undefined ? <Progress value={item.progress} aria-label={`${item.label}: ${item.progress}%`} className="role-dashboard-kpi-progress" /> : null}</CardContent>
      </Card>;
    })}</div> : null}

    <div className="role-dashboard-grid">
      <Card className="role-dashboard-panel">
        <CardHeader><div><CardTitle>{data.kind === "sales" ? "Satış mərhələləri" : data.kind === "teacher" ? "Davamiyyət balansı" : "Funnel performansı"}</CardTitle><CardDescription>Canlı rol göstəriciləri</CardDescription></div></CardHeader>
        <CardContent><RolePerformanceChart items={data.breakdown} /></CardContent>
      </Card>
      <Card className="role-dashboard-panel">
        <CardHeader><div><CardTitle>{data.kind === "sales" ? "Növbəti follow-up-lar" : data.kind === "teacher" ? "Mənim slotlarım" : "Son kampaniyalar"}</CardTitle><CardDescription>Prioritet iş axını</CardDescription></div><CardAction><Link href={data.primaryHref}>Hamısına bax</Link></CardAction></CardHeader>
        <CardContent><div className="role-dashboard-recent">{data.recent.length ? data.recent.map((item) => <div key={`${item.title}-${item.meta}`}><span>{initials(item.title)}</span><div><strong>{item.title}</strong><small>{item.meta}</small></div><Badge variant="secondary">{item.status}</Badge></div>) : <p>Hələ məlumat yoxdur.</p>}</div></CardContent>
      </Card>
    </div>
    <DashboardTasksPanel data={taskData} createTaskAction={createTaskAction} updateTaskStatusAction={updateTaskStatusAction} />
  </section>;
}

function firstName(value: string) { return value.trim().split(/\s+/)[0] || "komanda üzvü"; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("az"); }
function roleLabel(kind: RoleDashboardData["kind"]) { return kind === "sales" ? "Satış təmsilçisi" : kind === "teacher" ? "Müəllim" : "Marketing"; }
