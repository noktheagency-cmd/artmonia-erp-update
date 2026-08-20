"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";
import {
  isHrDocumentObjectKey,
  validateHrDocument,
  verifyHrDocumentUpload,
} from "@/server/storage/hr-documents";

const EMPTY_DOCUMENT = { type: "doc", content: [{ type: "paragraph" }] } as const;

async function createNote(formData: FormData) {
  const actor = await requireMutationActor("hr.note.manage");
  const employeeId = requiredUuid(formData.get("employeeId"), "Əməkdaş seçimi düzgün deyil");
  const title = normalizeTitle(formData.get("title") || "Yeni qeyd");
  const [employee, noteCount] = await Promise.all([
    getPrisma().hrEmployee.findUnique({ where: { id: employeeId }, select: { id: true } }),
    getPrisma().hrEmployeeNote.count({ where: { employeeId } }),
  ]);
  if (!employee) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
  if (noteCount >= 100) throw new PublicActionError("Bir əməkdaş üçün maksimum 100 qeyd yaradıla bilər");

  const note = await getPrisma().$transaction(async (tx) => {
    const created = await tx.hrEmployeeNote.create({
      data: {
        employeeId,
        title,
        content: EMPTY_DOCUMENT,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.note.create",
      entityType: "hr_employee_note",
      entityId: employeeId,
      after: { noteId: created.id, title, characterCount: 0 },
      reason: "Əməkdaş üçün daxili qeyd yaradıldı",
    });
    return created;
  });
  revalidateEmployee(employeeId);
  return { id: note.id };
}

async function updateNote(formData: FormData) {
  const actor = await requireMutationActor("hr.note.manage");
  const noteId = requiredUuid(formData.get("noteId"), "Qeyd seçimi düzgün deyil");
  const employeeId = requiredUuid(formData.get("employeeId"), "Əməkdaş seçimi düzgün deyil");
  const title = normalizeTitle(formData.get("title"));
  const content = parseEditorDocument(formData.get("content"));
  const before = await getPrisma().hrEmployeeNote.findFirst({
    where: { id: noteId, employeeId },
    select: { id: true, title: true, content: true },
  });
  if (!before) throw new PublicActionError("Qeyd tapılmadı", "NOT_FOUND");

  await getPrisma().$transaction(async (tx) => {
    await tx.hrEmployeeNote.update({
      where: { id: noteId },
      data: { title, content, updatedById: actor.id },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.note.update",
      entityType: "hr_employee_note",
      entityId: employeeId,
      before: { noteId, title: before.title, characterCount: editorTextLength(before.content) },
      after: { noteId, title, characterCount: editorTextLength(content) },
      reason: "Əməkdaşın daxili qeydi yeniləndi",
    });
  });
  revalidateEmployee(employeeId);
  return { id: noteId };
}

async function finalizeDocument(formData: FormData) {
  const actor = await requireMutationActor("hr.document.manage");
  const employeeId = requiredUuid(formData.get("employeeId"), "Əməkdaş seçimi düzgün deyil");
  const objectKey = String(formData.get("objectKey") ?? "");
  if (!isHrDocumentObjectKey(employeeId, objectKey)) {
    throw new PublicActionError("Sənəd yolu düzgün deyil");
  }
  const validated = validateHrDocument({
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? ""),
    size: Number(formData.get("size")),
  });
  const [employee, uploaded, documentCount] = await Promise.all([
    getPrisma().hrEmployee.findUnique({ where: { id: employeeId }, select: { id: true } }),
    verifyHrDocumentUpload(objectKey),
    getPrisma().hrEmployeeDocument.count({ where: { employeeId } }),
  ]);
  if (!employee) throw new PublicActionError("Əməkdaş tapılmadı", "NOT_FOUND");
  if (documentCount >= 250) throw new PublicActionError("Bir əməkdaş üçün maksimum 250 sənəd əlavə edilə bilər");
  if (uploaded.size !== validated.size || uploaded.mimeType !== validated.mimeType) {
    throw new PublicActionError("Yüklənən sənəd yoxlamadan keçmədi");
  }

  const document = await getPrisma().$transaction(async (tx) => {
    const created = await tx.hrEmployeeDocument.create({
      data: {
        employeeId,
        originalName: validated.name,
        objectKey,
        mimeType: validated.mimeType,
        sizeBytes: validated.size,
        uploadedById: actor.id,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.document.upload",
      entityType: "hr_employee_document",
      entityId: employeeId,
      after: {
        documentId: created.id,
        fileName: created.originalName,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
      },
      reason: "Əməkdaşa aid qorunan sənəd əlavə edildi",
    });
    return created;
  });
  revalidateEmployee(employeeId);
  return { id: document.id };
}

export const createHrEmployeeNoteAction = safeServerAction(createNote, "Qeyd yaradıla bilmədi.");
export const updateHrEmployeeNoteAction = safeServerAction(updateNote, "Qeyd saxlanıla bilmədi.");
export const finalizeHrEmployeeDocumentAction = safeServerAction(finalizeDocument, "Sənəd qeydə alına bilmədi.");

function requiredUuid(value: FormDataEntryValue | null, message: string) {
  const text = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new PublicActionError(message);
  }
  return text;
}

function normalizeTitle(value: FormDataEntryValue | null) {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 160) {
    throw new PublicActionError("Qeyd başlığı 2–160 simvol olmalıdır");
  }
  return title;
}

function parseEditorDocument(value: FormDataEntryValue | null): Prisma.InputJsonValue {
  const source = String(value ?? "");
  if (!source || source.length > 120_000) throw new PublicActionError("Qeyd çox böyükdür");
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new PublicActionError("Qeyd formatı düzgün deyil");
  }
  const state = { nodes: 0, text: 0 };
  validateNode(parsed, state, true);
  if (state.nodes > 2_000 || state.text > 50_000) throw new PublicActionError("Qeyd icazə verilən həddi keçir");
  return parsed as Prisma.InputJsonValue;
}

function validateNode(value: unknown, state: { nodes: number; text: number }, root = false): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicActionError("Qeyd formatı düzgün deyil");
  const node = value as Record<string, unknown>;
  const allowedNodes = new Set(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "text", "hardBreak", "blockquote"]);
  if (typeof node.type !== "string" || !allowedNodes.has(node.type) || (root && node.type !== "doc")) {
    throw new PublicActionError("Qeyd formatında dəstəklənməyən blok var");
  }
  state.nodes += 1;
  if (node.type === "text") {
    if (typeof node.text !== "string") throw new PublicActionError("Qeyd mətni düzgün deyil");
    state.text += node.text.length;
  }
  if (node.type === "heading") {
    const level = (node.attrs as { level?: unknown } | undefined)?.level;
    if (level !== 1 && level !== 2 && level !== 3) throw new PublicActionError("Başlıq səviyyəsi düzgün deyil");
  }
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks) || node.marks.length > 8) throw new PublicActionError("Mətn formatı düzgün deyil");
    for (const markValue of node.marks) {
      if (!markValue || typeof markValue !== "object") throw new PublicActionError("Mətn formatı düzgün deyil");
      const mark = markValue as { type?: unknown; attrs?: { href?: unknown } };
      if (mark.type !== "bold" && mark.type !== "italic" && mark.type !== "link") throw new PublicActionError("Mətn formatı dəstəklənmir");
      if (mark.type === "link") {
        const href = String(mark.attrs?.href ?? "");
        if (!/^(https?:\/\/|mailto:)/i.test(href) || href.length > 1_000) throw new PublicActionError("Link təhlükəsiz deyil");
      }
    }
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw new PublicActionError("Qeyd blokları düzgün deyil");
    node.content.forEach((child) => validateNode(child, state));
  }
}

function editorTextLength(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + editorTextLength(item), 0);
  const record = value as Record<string, unknown>;
  return (typeof record.text === "string" ? record.text.length : 0) + editorTextLength(record.content);
}

function revalidateEmployee(employeeId: string) {
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/audit");
}
