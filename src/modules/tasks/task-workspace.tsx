"use client";

import { useMemo, useOptimistic, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  ListFilter,
  ListTodo,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
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
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import type { TaskData, TaskRow, TaskStatusValue } from "@/modules/tasks/queries";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import "./tasks.css";

type TaskAction = (formData: FormData) => unknown | Promise<unknown>;
type TaskFilter = "ACTIVE" | TaskStatusValue;

const statusOptions = [
  { value: "OPEN", label: "Gözləyir" },
  { value: "IN_PROGRESS", label: "İcradadır" },
  { value: "DONE", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
];

export function TaskWorkspace({
  data,
  createTaskAction,
  updateTaskStatusAction,
}: {
  data: TaskData;
  createTaskAction: TaskAction;
  updateTaskStatusAction: TaskAction;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("ACTIVE");
  const normalizedQuery = query.trim().toLocaleLowerCase("az");
  const filteredTasks = useMemo(
    () =>
      data.tasks.filter((task) => {
        const matchesFilter =
          filter === "ACTIVE"
            ? task.status !== "DONE" && task.status !== "CANCELLED"
            : task.status === filter;
        const matchesQuery =
          !normalizedQuery ||
          `${task.title} ${task.description} ${task.ownerName}`
            .toLocaleLowerCase("az")
            .includes(normalizedQuery);
        return matchesFilter && matchesQuery;
      }),
    [data.tasks, filter, normalizedQuery]
  );

  return (
    <section className="page-stack tasks-page">
      <header className="tasks-header">
        <div>
          <div className="tasks-title-icon" aria-hidden="true">
            <ListTodo size={20} />
          </div>
          <h1>Tasklar</h1>
          <p>Komandanın gündəlik işlərini sadə və aydın şəkildə izləyin.</p>
        </div>
        <div className="tasks-header-actions">
          <span className="tasks-header-mascot" role="img" aria-label="Sakit rəssam maskotu" />
          {data.permissions.canManage ? (
            <CreateTaskDialog employees={data.employees} action={createTaskAction} />
          ) : null}
        </div>
      </header>

      <div className="tasks-summary" aria-label="Task xülasəsi">
        <SummaryItem icon={CircleDot} label="Gözləyir" value={data.summary.open} tone="open" />
        <SummaryItem icon={Clock3} label="İcradadır" value={data.summary.inProgress} tone="progress" />
        <SummaryItem icon={CheckCircle2} label="Tamamlandı" value={data.summary.done} tone="done" />
      </div>

      <div className="tasks-toolbar">
        <label className="tasks-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Task və ya işçi axtar..."
          />
        </label>
        <div className="tasks-filter">
          <ListFilter size={15} aria-hidden="true" />
          <FormSelect
            name="taskFilter"
            value={filter}
            onValueChange={(value) => setFilter(value as TaskFilter)}
            options={[
              { value: "ACTIVE", label: "Aktiv tasklar" },
              ...statusOptions,
            ]}
            aria-label="Status üzrə filtrlə"
          />
        </div>
      </div>

      <div className="tasks-list-panel">
        <div className="tasks-list-heading">
          <div>
            <h2>{filter === "ACTIVE" ? "Aktiv tasklar" : statusOptions.find((item) => item.value === filter)?.label}</h2>
            <span>{filteredTasks.length} task</span>
          </div>
        </div>

        {filteredTasks.length > 0 ? (
          <div className="tasks-list">
            {filteredTasks.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                updateTaskStatusAction={updateTaskStatusAction}
              />
            ))}
          </div>
        ) : (
          <div className="tasks-empty">
            <span><ListTodo size={22} /></span>
            <h3>Task tapılmadı</h3>
            <p>Axtarış və ya status filtrini dəyişin.</p>
          </div>
        )}
        {data.pagination.page > 1 || data.pagination.hasNext ? (
          <nav className="mt-4 flex items-center justify-end gap-2" aria-label="Task sÉ™hifÉ™lÉ™ri">
            {data.pagination.page > 1 ? <Link className="ui-button ui-button-outline ui-button-sm" href={`/tasks?page=${data.pagination.page - 1}&pageSize=${data.pagination.pageSize}` as Route}>ÆvvÉ™lki</Link> : null}
            <span>{data.pagination.page} / {Math.max(1, Math.ceil(data.pagination.total / data.pagination.pageSize))}</span>
            {data.pagination.hasNext ? <Link className="ui-button ui-button-outline ui-button-sm" href={`/tasks?page=${data.pagination.page + 1}&pageSize=${data.pagination.pageSize}` as Route}>NÃ¶vbÉ™ti</Link> : null}
          </nav>
        ) : null}
      </div>
    </section>
  );
}

function SummaryItem({ icon: Icon, label, value, tone }: { icon: typeof CircleDot; label: string; value: number; tone: string }) {
  return (
    <div className={cx("tasks-summary-item", `is-${tone}`)}>
      <span><Icon size={17} /></span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </div>
  );
}

function TaskListRow({ task, updateTaskStatusAction }: { task: TaskRow; updateTaskStatusAction: TaskAction }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    task.status,
    (_current, next: TaskStatusValue) => next,
  );

  function updateStatus(status: string) {
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("status", status);
    startTransition(async () => {
      setOptimisticStatus(status as TaskStatusValue);
      try {
        unwrapActionResult(await updateTaskStatusAction(formData));
        router.refresh();
      } catch (error) {
        notifyCaughtError(error, "Task statusu yenilÉ™nmÉ™di", "Status yenilÉ™nmÉ™di");
      }
    });
  }

  return (
    <article className={cx("task-row", task.isOverdue && "is-overdue", isPending && "is-pending")}>
      <span className={cx("task-status-mark", `is-${optimisticStatus.toLowerCase()}`)} aria-hidden="true" />
      <div className="task-main">
        <h3>{task.title}</h3>
        {task.description ? <p>{task.description}</p> : null}
      </div>
      <div className="task-owner">
        <span className="task-avatar">{task.ownerInitials || <UserRound size={15} />}</span>
        <div><small>İşçi</small><strong>{task.ownerName}</strong></div>
      </div>
      <div className={cx("task-deadline", task.isOverdue && "is-overdue")}>
        <CalendarClock size={16} />
        <div><small>{task.isOverdue ? "Gecikib" : "Deadline"}</small><strong>{task.dueLabel}</strong></div>
      </div>
      <FormSelect
        name={`status-${task.id}`}
        value={optimisticStatus}
        onValueChange={updateStatus}
        options={statusOptions}
        disabled={isPending}
        className={cx("task-status-select", `is-${optimisticStatus.toLowerCase()}`)}
        aria-label={`${task.title} statusu`}
      />
    </article>
  );
}

function CreateTaskDialog({ employees, action }: { employees: TaskData["employees"]; action: TaskAction }) {
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
        setError(notifyCaughtError(caught, "Task yaradılmadı", "Task yaradılmadı"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus size={16} /> Yeni task</Button>
      </DialogTrigger>
      <DialogContent className="task-dialog">
        <DialogHeader>
          <DialogTitle>Yeni task</DialogTitle>
          <DialogDescription>Taskı işçiyə təyin edin və deadline seçin.</DialogDescription>
        </DialogHeader>
        <form className="task-form" onSubmit={submit}>
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
            <DatePicker name="dueDate" required allowClear={false} popoverPlacement="floating" />
          </label>
          <label>
            <span>Qısa qeyd <small>(istəyə bağlı)</small></span>
            <textarea name="description" rows={3} maxLength={500} placeholder="Əlavə məlumat..." />
          </label>
          {error ? <p className="task-form-error" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Ləğv et</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Yaradılır..." : "Task yarat"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
