import { TaskStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  ownerName: string;
  ownerInitials: string;
  status: TaskStatusValue;
  dueDate: string;
  dueLabel: string;
  isOverdue: boolean;
};

export type TaskStatusValue = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export type TaskData = {
  tasks: TaskRow[];
  employees: Array<{ value: string; label: string }>;
  permissions: { canManage: boolean };
  currentUserId: string;
  summary: { open: number; inProgress: number; done: number };
};

export async function getTaskData(): Promise<TaskData> {
  const actor = await requireErpActor("task.read");
  const prisma = getPrisma();
  const manageScope = scopeFor(actor.permissions, "task.manage");
  const canManage = manageScope !== null;
  const canManageAll = manageScope === "ALL";

  const [tasks, employees] = await Promise.all([
    prisma.task.findMany({
      where: canManageAll ? undefined : { ownerUserId: actor.id },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 250,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        dueAt: true,
        ownerUser: { select: { fullName: true } },
      },
    }),
    canManageAll
      ? prisma.user.findMany({
          where: { isActive: true },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        })
      : Promise.resolve(canManage ? [{ id: actor.id, fullName: actor.fullName }] : []),
  ]);

  const now = new Date();
  const rows = tasks.map((task) => {
    const ownerName = task.ownerUser?.fullName ?? "Təyin edilməyib";
    const dueDate = task.dueAt ? toDateInput(task.dueAt) : "";

    return {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      createdAt: task.createdAt.toISOString(),
      ownerName,
      ownerInitials: initials(ownerName),
      status: task.status,
      dueDate,
      dueLabel: task.dueAt ? formatDeadline(task.dueAt) : "Deadline yoxdur",
      isOverdue:
        Boolean(task.dueAt) &&
        task.dueAt!.getTime() < now.getTime() &&
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED,
    } satisfies TaskRow;
  });

  return {
    tasks: rows,
    employees: employees.map((employee) => ({ value: employee.id, label: employee.fullName })),
    permissions: { canManage },
    currentUserId: actor.id,
    summary: {
      open: rows.filter((task) => task.status === TaskStatus.OPEN).length,
      inProgress: rows.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
      done: rows.filter((task) => task.status === TaskStatus.DONE).length,
    },
  };
}

function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("az");
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDeadline(value: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}
