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
import { TaskDetailsDialog, taskPriorityOptions } from "@/modules/tasks/task-details-dialog";
import { TaskCompletionDialog } from "@/modules/tasks/task-completion-dialog";
import { TaskAssigneePicker } from "@/modules/tasks/task-assignee-picker";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";

type TaskAction = (formData: FormData) => unknown | Promise<unknown>;

type DeadlineTone = "calm" | "near" | "overdue";

export function DashboardTasksPanel({
  data,
  createTaskAction,
  updateTaskStatusAction,
}: {
  data: TaskData;
  createTaskAction: TaskAction;
  updateTaskStatusAction: TaskAction;
}) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const activeTasks = data.tasks
    .filter(
      (task) =>
        task.status !== "CANCELLED" && task.status !== "DONE"
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
        {data.permissions.canAdminister ? (
          <CreateDashboardTaskDialog employees={data.employees} action={createTaskAction} />
        ) : null}
      </div>

      {activeTasks.length ? (
        <div className="owner-dashboard-deadline-list">
          {activeTasks.map((task) => (
            <DashboardDeadlineTask
              key={task.id}
              task={task}
              onOpen={() => setSelectedTask(task)}
              updateTaskStatusAction={updateTaskStatusAction}
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
      <TaskDetailsDialog
        key={selectedTask?.id ?? "closed"}
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        updateTaskStatusAction={updateTaskStatusAction}
      />
    </article>
  );
}

function DashboardDeadlineTask({
  task,
  onOpen,
  updateTaskStatusAction,
}: {
  task: TaskRow;
  onOpen: () => void;
  updateTaskStatusAction: TaskAction;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const deadline = getDeadlinePresentation(task);

  function markDone() {
    setCompletionError("");
    setCompletionOpen(true);
  }

  function confirmDone(completionNote: string) {
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("status", "DONE");
    formData.set("completionNote", completionNote);
    setCompletionError("");
    startTransition(async () => {
      try {
        unwrapActionResult(await updateTaskStatusAction(formData));
        setCompletionOpen(false);
        router.refresh();
      } catch (caught) {
        setCompletionError(notifyCaughtError(caught, "Task tamamlanmadı", "Status yenilənmədi"));
      }
    });
  }

  return (
    <>
      <article className={`owner-dashboard-deadline-task is-${deadline.tone}${isPending ? " is-pending" : ""}`}>
      <button className="owner-dashboard-task-open" type="button" onClick={onOpen} aria-label={`${task.title} taskının detallarını aç`} />
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
        onClick={markDone}
        disabled={isPending || !task.canUpdateStatus}
        title="Taskı tamamla"
        aria-label={`${task.title} taskını tamamla`}
      >
        <Check size={16} strokeWidth={2.5} />
      </Button>
      </article>
      <TaskCompletionDialog
        taskTitle={task.title}
        open={completionOpen}
        pending={isPending}
        error={completionError}
        onOpenChange={setCompletionOpen}
        onConfirm={confirmDone}
      />
    </>
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
        unwrapActionResult(await action(formData));
        form.reset();
        setOpen(false);
        router.refresh();
      } catch (caught) {
        setError(notifyCaughtError(caught, "Task yaradıla bilmədi", "Task yaradılmadı"));
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
          <TaskAssigneePicker employees={employees} />
          <label>
            <span>Deadline</span>
            <Input name="dueDate" type="date" required />
          </label>
          <label>
            <span>Prioritet</span>
            <FormSelect name="priority" defaultValue="NORMAL" options={[...taskPriorityOptions]} required />
          </label>
          <label>
            <span>Ətraflı açıqlama <small>(istəyə bağlı)</small></span>
            <textarea name="description" rows={5} maxLength={2000} placeholder="Tapşırığın bütün vacib detallarını qeyd edin..." />
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
