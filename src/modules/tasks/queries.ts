import { TaskStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { scopeFor } from "@/server/rbac/permissions";
import {
  buildCurrentTaskAssigneeWhere,
  buildTaskWorkspaceWhere,
} from "@/modules/tasks/task-scope";

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
  pagination: { page: number; pageSize: number; total: number; hasNext: boolean };
};

export async function getTaskData(input: { page?: string; pageSize?: string } = {}): Promise<TaskData> {
  const actor = await requireErpActor("task.read");
  const prisma = getPrisma();
  const manageScope = scopeFor(actor.permissions, "task.manage");
  const canManage = manageScope !== null;
  const canManageAll = manageScope === "ALL";
  const page = Math.max(1, Number.parseInt(input.page ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(input.pageSize ?? "25", 10) || 25));
  const where = buildTaskWorkspaceWhere(canManageAll ? undefined : actor.id);

  const [tasks, total, statusCounts, employees] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    prisma.task.count({ where }),
    prisma.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
    canManageAll
      ? prisma.user.findMany({
          where: buildCurrentTaskAssigneeWhere(),
          orderBy: { fullName: "asc" },
          take: 500,
          select: { id: true, fullName: true },
        })
      : canManage
        ? prisma.user.findMany({
            where: buildCurrentTaskAssigneeWhere(actor.id),
            take: 1,
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
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
      open: statusCounts.find((item) => item.status === TaskStatus.OPEN)?._count._all ?? 0,
      inProgress: statusCounts.find((item) => item.status === TaskStatus.IN_PROGRESS)?._count._all ?? 0,
      done: statusCounts.find((item) => item.status === TaskStatus.DONE)?._count._all ?? 0,
    },
    pagination: { page, pageSize, total, hasNext: page * pageSize < total },
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
