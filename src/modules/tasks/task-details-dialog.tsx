"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Flag,
  History,
  UserRound,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import type { TaskRow, TaskStatusValue } from "@/modules/tasks/queries";
import { TaskCompletionDialog } from "@/modules/tasks/task-completion-dialog";
import "./task-details.css";

type TaskAction = (formData: FormData) => unknown | Promise<unknown>;

export const taskStatusOptions = [
  { value: "OPEN", label: "Gözləyir" },
  { value: "IN_PROGRESS", label: "İcradadır" },
  { value: "DONE", label: "Tamamlandı" },
  { value: "CANCELLED", label: "Ləğv edildi" },
] as const;

export const taskPriorityOptions = [
  { value: "URGENT", label: "Təcili" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Aşağı" },
] as const;

export function TaskDetailsDialog({
  task,
  open,
  onOpenChange,
  updateTaskStatusAction,
}: {
  task: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateTaskStatusAction: TaskAction;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [completionOpen, setCompletionOpen] = useState(false);
  const [confirmedStatus, setConfirmedStatus] = useState<TaskStatusValue>(task?.status ?? "OPEN");
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(
    confirmedStatus,
    (_current, next: TaskStatusValue) => next,
  );

  if (!task) return null;

  function updateStatus(status: string, completionNote?: string) {
    if (!task || status === optimisticStatus) return;
    if (status === "DONE" && !completionNote) {
      setError("");
      setCompletionError("");
      setCompletionOpen(true);
      return;
    }
    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("status", status);
    if (completionNote) formData.set("completionNote", completionNote);
    setError("");
    setCompletionError("");
    startTransition(async () => {
      setOptimisticStatus(status as TaskStatusValue);
      try {
        unwrapActionResult(await updateTaskStatusAction(formData));
        setConfirmedStatus(status as TaskStatusValue);
        setCompletionOpen(false);
        router.refresh();
      } catch (caught) {
        const message = notifyCaughtError(caught, "Task statusu yenilənmədi", "Status yenilənmədi");
        if (status === "DONE") setCompletionError(message);
        else setError(message);
      }
    });
  }

  const statusLabel = taskStatusOptions.find((item) => item.value === optimisticStatus)?.label;
  const priorityLabel = taskPriorityOptions.find((item) => item.value === task.priority)?.label;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="task-detail-dialog">
        <DialogHeader className="task-detail-header">
          <div className="task-detail-badges">
            <span className={cx("task-detail-priority", `is-${task.priority.toLowerCase()}`)}>
              <Flag size={13} /> {priorityLabel}
            </span>
            <span className={cx("task-detail-status", `is-${optimisticStatus.toLowerCase()}`)}>
              {task.isOverdue && optimisticStatus !== "DONE" ? <CircleAlert size={13} /> : <Clock3 size={13} />}
              {task.isOverdue && optimisticStatus !== "DONE" ? "Gecikib" : statusLabel}
            </span>
          </div>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            Taskın tam məlumatları və icra vəziyyəti
          </DialogDescription>
        </DialogHeader>

        <div className="task-detail-scroll" data-dialog-scroll-body>
          <section className="task-detail-description-block">
            <h3>Açıqlama</h3>
            <p>{task.description || "Bu task üçün əlavə açıqlama qeyd edilməyib."}</p>
          </section>

          {task.completionNote ? (
            <section className="task-detail-completion-note">
              <h3><CheckCircle2 size={15} /> Tamamlanma qeydi</h3>
              <p>{task.completionNote}</p>
            </section>
          ) : null}

          <div className="task-detail-people">
            <DetailPerson label="İcraçı" name={task.ownerName} initials={task.ownerInitials} />
            <DetailPerson label="Yaradan" name={task.creatorName} initials={task.creatorInitials} />
          </div>

          <div className="task-detail-meta-grid">
            <DetailMeta icon={CalendarClock} label={task.isOverdue ? "Gecikmiş deadline" : "Deadline"} value={task.dueLabel} tone={task.isOverdue ? "danger" : undefined} />
            <DetailMeta icon={History} label="Yaradılıb" value={task.createdLabel} />
            <DetailMeta icon={Clock3} label="Son dəyişiklik" value={task.updatedLabel} />
            {task.completedLabel ? <DetailMeta icon={CheckCircle2} label="Tamamlanıb" value={task.completedLabel} tone="success" /> : null}
          </div>

          <section className="task-detail-status-control">
            <div>
              <h3>Statusu yenilə</h3>
              <p>{task.canUpdateStatus ? "İş axışını buradan sürətlə idarə edin." : "Statusu yalnız taskın icraçısı və super admin dəyişə bilər."}</p>
            </div>
            <FormSelect
              name={`detail-status-${task.id}`}
              value={optimisticStatus}
              onValueChange={updateStatus}
              options={[...taskStatusOptions]}
              disabled={isPending || !task.canUpdateStatus}
              className={cx("task-detail-status-select", `is-${optimisticStatus.toLowerCase()}`)}
              aria-label={`${task.title} statusu`}
            />
          </section>
          {error ? <p className="task-detail-error" role="alert">{error}</p> : null}
        </div>
      </DialogContent>
      </Dialog>
      <TaskCompletionDialog
        taskTitle={task.title}
        open={completionOpen}
        pending={isPending}
        error={completionError}
        onOpenChange={setCompletionOpen}
        onConfirm={(completionNote) => updateStatus("DONE", completionNote)}
      />
    </>
  );
}

function DetailPerson({ label, name, initials }: { label: string; name: string; initials: string }) {
  return (
    <div className="task-detail-person">
      <span>{initials || <UserRound size={17} />}</span>
      <div><small>{label}</small><strong>{name}</strong></div>
    </div>
  );
}

function DetailMeta({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  return (
    <div className={cx("task-detail-meta", tone && `is-${tone}`)}>
      <span><Icon size={17} /></span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}
