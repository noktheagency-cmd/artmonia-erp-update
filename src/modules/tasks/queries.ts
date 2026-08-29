import { TaskStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import { canAdministerTasks } from "@/modules/tasks/task-permissions";
import {
  buildCurrentTaskAssigneeWhere,
  buildTaskWorkspaceWhere,
} from "@/modules/tasks/task-scope";

export type TaskRow = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  createdLabel: string;
  updatedLabel: string;
  completedLabel: string;
  completionNote: string;
  creatorName: string;
  creatorInitials: string;
  ownerUserId: string | null;
  ownerName: string;
  ownerInitials: string;
  status: TaskStatusValue;
  priority: TaskPriorityValue;
  dueDate: string;
  dueLabel: string;
  isOverdue: boolean;
  canUpdateStatus: boolean;
};

export type TaskStatusValue = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type TaskPriorityValue = "URGENT" | "NORMAL" | "LOW";

export type TaskData = {
  tasks: TaskRow[];
  historyTasks: TaskRow[];
  employees: Array<{ value: string; label: string }>;
  permissions: { canAdminister: boolean; canViewHistory: boolean };
  currentUserId: string;
  initialView: "active" | "history";
  selectedTaskId: string | null;
  selectedTask: TaskRow | null;
  summary: { open: number; inProgress: number; done: number };
  pagination: { page: number; pageSize: number; total: number; hasNext: boolean };
  historyPagination: { page: number; pageSize: number; total: number; hasNext: boolean };
};

export async function getTaskData(input: {
  page?: string;
  pageSize?: string;
  historyPage?: string;
  view?: string;
  task?: string;
  includeHistory?: boolean;
} = {}): Promise<TaskData> {
  const actor = await requireErpActor("task.read");
  const prisma = getPrisma();
  const canAdminister = await canAdministerTasks(actor);
  const canViewAll = canAdminister;
  const canViewHistory = canAdminister;
  const shouldLoadHistory = canViewHistory && input.includeHistory === true;
  const page = Math.max(1, Number.parseInt(input.page ?? "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(10, Number.parseInt(input.pageSize ?? "25", 10) || 25));
  const historyPage = Math.max(1, Number.parseInt(input.historyPage ?? "1", 10) || 1);
  const historyPageSize = pageSize;
  const selectedTaskId = /^[0-9a-f-]{36}$/i.test(input.task ?? "") ? input.task : undefined;
  const workspaceWhere = buildTaskWorkspaceWhere(canViewAll ? undefined : actor.id);
  const activeWhere = { ...workspaceWhere, status: { not: TaskStatus.DONE } } as const;
  const historyWhere = { ...workspaceWhere, status: TaskStatus.DONE } as const;
  const taskSelect = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    ownerUserId: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    completionNote: true,
    dueAt: true,
    ownerUser: { select: { fullName: true } },
    createdBy: { select: { fullName: true } },
  } as const;

  const [tasks, total, statusCounts, employees, selectedTaskRecord, historyTasks, historyTotal] = await Promise.all([
    prisma.task.findMany({
      where: activeWhere,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: taskSelect,
    }),
    prisma.task.count({ where: activeWhere }),
    prisma.task.groupBy({ by: ["status"], where: workspaceWhere, _count: { _all: true } }),
    canAdminister
      ? prisma.user.findMany({
          where: buildCurrentTaskAssigneeWhere(),
          orderBy: { fullName: "asc" },
          take: 500,
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    selectedTaskId
      ? prisma.task.findFirst({
          where: {
            id: selectedTaskId,
            ...workspaceWhere,
            ...(canViewHistory ? {} : { status: { not: TaskStatus.DONE } }),
          },
          select: taskSelect,
        })
      : Promise.resolve(null),
    shouldLoadHistory
      ? prisma.task.findMany({
          where: historyWhere,
          orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
          skip: (historyPage - 1) * historyPageSize,
          take: historyPageSize,
          select: taskSelect,
        })
      : Promise.resolve([]),
    shouldLoadHistory ? prisma.task.count({ where: historyWhere }) : Promise.resolve(0),
  ]);

  const now = new Date();
  const toRow = (task: (typeof tasks)[number]) => {
    const ownerName = task.ownerUser?.fullName ?? "Təyin edilməyib";
    const creatorName = task.createdBy?.fullName ?? "Sistem";
    const dueDate = task.dueAt ? toDateInput(task.dueAt) : "";

    return {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      createdAt: task.createdAt.toISOString(),
      createdLabel: formatDateTime(task.createdAt),
      updatedLabel: formatDateTime(task.updatedAt),
      completedLabel: task.completedAt ? formatDateTime(task.completedAt) : "",
      completionNote: task.completionNote ?? "",
      creatorName,
      creatorInitials: initials(creatorName),
      ownerUserId: task.ownerUserId,
      ownerName,
      ownerInitials: initials(ownerName),
      status: task.status,
      priority: task.priority,
      dueDate,
      dueLabel: task.dueAt ? formatDeadline(task.dueAt) : "Deadline yoxdur",
      isOverdue:
        Boolean(task.dueAt) &&
        task.dueAt!.getTime() < now.getTime() &&
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED,
      canUpdateStatus: canViewAll || task.ownerUserId === actor.id,
    } satisfies TaskRow;
  };
  const rows = tasks.map(toRow);

  return {
    tasks: rows,
    historyTasks: historyTasks.map(toRow),
    employees: employees.map((employee) => ({ value: employee.id, label: employee.fullName })),
    permissions: { canAdminister, canViewHistory },
    currentUserId: actor.id,
    initialView: input.view === "history" && canViewHistory ? "history" : "active",
    selectedTaskId: selectedTaskId ?? null,
    selectedTask: selectedTaskRecord ? toRow(selectedTaskRecord) : null,
    summary: {
      open: statusCounts.find((item) => item.status === TaskStatus.OPEN)?._count._all ?? 0,
      inProgress: statusCounts.find((item) => item.status === TaskStatus.IN_PROGRESS)?._count._all ?? 0,
      done: statusCounts.find((item) => item.status === TaskStatus.DONE)?._count._all ?? 0,
    },
    pagination: { page, pageSize, total, hasNext: page * pageSize < total },
    historyPagination: {
      page: historyPage,
      pageSize: historyPageSize,
      total: historyTotal,
      hasNext: historyPage * historyPageSize < historyTotal,
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

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
