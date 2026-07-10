"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Plus,
  Sparkles,
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
import type { TaskData, TaskRow } from "@/modules/tasks/queries";

type TaskAction = (formData: FormData) => void | Promise<void>;

type DeadlineTone = "calm" | "near" | "overdue";

export function DashboardTasksPanel({
  data,
  createTaskAction,
}: {
  data: TaskData;
  createTaskAction: TaskAction;
}) {
  const router = useRouter();
  const [dismissedTaskIds, setDismissedTaskIds] = useState<Set<string>>(() => new Set());
  const activeTasks = data.tasks
    .filter(
      (task) =>
        task.status !== "CANCELLED" &&
        !dismissedTaskIds.has(task.id)
    )
    .toSorted((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
    .slice(0, 4);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [router]);

  return (
    <article className="owner-dashboard-panel owner-dashboard-task-panel owner-dashboard-entrance">
      <div className="owner-dashboard-task-head">
        <div>
          <span className="owner-dashboard-task-kicker">Canlı iş axını</span>
          <h2>Son tapşırıqlar</h2>
        </div>
        {data.permissions.canManage ? (
          <CreateDashboardTaskDialog employees={data.employees} action={createTaskAction} />
        ) : null}
      </div>

      {activeTasks.length ? (
        <div className="owner-dashboard-deadline-list">
          {activeTasks.map((task) => (
            <DashboardDeadlineTask
              key={task.id}
              task={task}
              onDismiss={() =>
                setDismissedTaskIds((current) => new Set([...current, task.id]))
              }
            />
          ))}
        </div>
      ) : (
        <div className="owner-dashboard-task-complete">
          <span className="owner-dashboard-task-mascot is-happy" aria-label="Sevincli rəssam maskotu" role="img" />
          <div>
            <span><Sparkles size={13} /> Gün tamamlandı</span>
            <strong>İzləmə siyahısı təmizdir</strong>
            <p>Yeni yaradılan tasklar burada görünəcək.</p>
          </div>
        </div>
      )}

      <Link className="owner-dashboard-task-all-link" href="/tasks">
        Bütün tapşırıqlara keç
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </article>
  );
}

function DashboardDeadlineTask({
  task,
  onDismiss,
}: {
  task: TaskRow;
  onDismiss: () => void;
}) {
  const deadline = getDeadlinePresentation(task);

  return (
    <article className={`owner-dashboard-deadline-task is-${deadline.tone}`}>
      <span
        className={`owner-dashboard-task-mascot is-${deadline.tone}`}
        aria-label={deadline.mascotLabel}
        role="img"
      />
      <div className="owner-dashboard-deadline-copy">
        <div>
          <h3>{task.title}</h3>
          <span><CalendarClock size={12} /> {deadline.label}</span>
        </div>
        <div className="owner-dashboard-deadline-track" aria-label={`${deadline.progress}% deadline irəliləyişi`}>
          <span style={{ width: `${deadline.progress}%` }} />
        </div>
      </div>
      <Button
        className="owner-dashboard-task-done"
        type="button"
        variant="ghost"
        onClick={onDismiss}
        title="İzləmə siyahısından çıxar"
        aria-label={`${task.title} taskını son tapşırıqlar siyahısından çıxar`}
      >
        <Check size={16} strokeWidth={2.5} />
      </Button>
    </article>
  );
}

function CreateDashboardTaskDialog({ employees, action }: { employees: TaskData["employees"]; action: TaskAction }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");

    startTransition(async () => {
      try {
        await action(formData);
        form.reset();
        setOpen(false);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Task yaradıla bilmədi");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="owner-dashboard-task-create"><Plus size={16} /> Task yarat</Button>
      </DialogTrigger>
      <DialogContent className="owner-dashboard-task-dialog">
        <DialogHeader>
          <DialogTitle>Yeni task yarat</DialogTitle>
          <DialogDescription>İşçini və deadline-ı təyin edərək prosesi dərhal başladın.</DialogDescription>
        </DialogHeader>
        <form className="owner-dashboard-task-form" onSubmit={submit}>
          <label>
            <span>Task adı</span>
            <Input name="title" placeholder="Məsələn: Həftəlik hesabatı hazırla" required maxLength={160} />
          </label>
          <label>
            <span>İşçi</span>
            <FormSelect name="ownerUserId" options={employees} placeholder="İşçi seçin" searchable required />
          </label>
          <label>
            <span>Deadline</span>
            <Input name="dueDate" type="date" required />
          </label>
          <label>
            <span>Qısa qeyd <small>(istəyə bağlı)</small></span>
            <textarea name="description" rows={3} maxLength={500} placeholder="Əlavə məlumat..." />
          </label>
          {error ? <p className="owner-dashboard-task-error" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Yaradılır..." : "Task yarat"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getDeadlinePresentation(task: TaskRow): {
  tone: DeadlineTone | "happy";
  progress: number;
  label: string;
  mascotLabel: string;
} {
  if (task.status === "DONE") {
    return { tone: "happy", progress: 100, label: "Tamamlanıb", mascotLabel: "Sevincli rəssam maskotu" };
  }

  if (!task.dueDate) {
    return { tone: "calm", progress: 18, label: "Deadline təyin edilməyib", mascotLabel: "Sakit rəssam maskotu" };
  }

  const dueAt = new Date(`${task.dueDate}T23:59:59`);
  const daysLeft = Math.ceil((dueAt.getTime() - Date.now()) / 86_400_000);

  if (task.isOverdue || daysLeft < 0) {
    return { tone: "overdue", progress: 100, label: "Deadline keçib", mascotLabel: "Narahat rəssam maskotu" };
  }
  if (daysLeft === 0) {
    return { tone: "near", progress: 92, label: "Bu gün bitir", mascotLabel: "Narahat rəssam maskotu" };
  }
  if (daysLeft === 1) {
    return { tone: "near", progress: 80, label: "1 gün qalıb", mascotLabel: "Narahat rəssam maskotu" };
  }
  if (daysLeft <= 3) {
    return { tone: "near", progress: 64, label: `${daysLeft} gün qalıb`, mascotLabel: "Narahat rəssam maskotu" };
  }

  return { tone: "calm", progress: 34, label: `${daysLeft} gün qalıb`, mascotLabel: "Sakit rəssam maskotu" };
}
