import type {
  KnowledgeDocument,
  KnowledgeDocumentMark,
  KnowledgeDocumentNode,
} from "@/modules/about/knowledge-types";

const allowedNodeTypes = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "hardBreak",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);

const allowedMarkTypes = new Set(["bold", "italic", "link"]);
const MAX_NODES = 5_000;
const MAX_TEXT_LENGTH = 50_000;

export function parseKnowledgeDocument(value: string): KnowledgeDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Məqalə məzmunu düzgün formatda deyil.");
  }

  const state = { nodes: 0, textLength: 0 };
  const document = sanitizeNode(parsed, state, true);

  if (document.type !== "doc") {
    throw new Error("Məqalə məzmununun əsas strukturu düzgün deyil.");
  }

  return document as KnowledgeDocument;
}

export function knowledgeDocumentToPlainText(document: KnowledgeDocument) {
  const blocks: string[] = [];

  function visit(node: KnowledgeDocumentNode) {
    if (node.type === "text" && node.text) {
      blocks.push(node.text);
      return;
    }

    const isBreak = node.type === "hardBreak" || node.type === "horizontalRule";
    if (isBreak) blocks.push("\n");

    node.content?.forEach(visit);

    if (["paragraph", "heading", "listItem", "taskItem", "tableRow"].includes(node.type)) {
      blocks.push("\n");
    }
  }

  visit(document);
  return blocks.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeNode(
  value: unknown,
  state: { nodes: number; textLength: number },
  isRoot = false,
): KnowledgeDocumentNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Məqalə məzmununda etibarsız element var.");
  }

  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    throw new Error("Məqalə məzmunu həddən artıq böyükdür.");
  }

  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type : "";
  if (!allowedNodeTypes.has(type) || (isRoot && type !== "doc") || (!isRoot && type === "doc")) {
    throw new Error("Məqalə məzmununda dəstəklənməyən element var.");
  }

  const node: KnowledgeDocumentNode = { type };

  if (type === "text") {
    if (typeof raw.text !== "string") {
      throw new Error("Məqalə mətnində etibarsız dəyər var.");
    }
    state.textLength += raw.text.length;
    if (state.textLength > MAX_TEXT_LENGTH) {
      throw new Error("Məqalə mətni 50 000 simvoldan uzun ola bilməz.");
    }
    node.text = raw.text;
    const marks = sanitizeMarks(raw.marks);
    if (marks.length) node.marks = marks;
  }

  const attrs = sanitizeAttributes(type, raw.attrs);
  if (Object.keys(attrs).length) node.attrs = attrs;

  if (raw.content !== undefined) {
    if (!Array.isArray(raw.content)) {
      throw new Error("Məqalə məzmununda etibarsız alt element var.");
    }
    node.content = raw.content.map((child) => sanitizeNode(child, state));
  }

  if (type === "doc" && (!node.content || node.content.length === 0)) {
    node.content = [{ type: "paragraph" }];
  }

  return node;
}

function sanitizeMarks(value: unknown): KnowledgeDocumentMark[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const raw = entry as Record<string, unknown>;
    const type = typeof raw.type === "string" ? raw.type : "";
    if (!allowedMarkTypes.has(type)) return [];

    if (type !== "link") return [{ type } as KnowledgeDocumentMark];
    const attrs = raw.attrs && typeof raw.attrs === "object" && !Array.isArray(raw.attrs)
      ? raw.attrs as Record<string, unknown>
      : {};
    const href = normalizeHref(attrs.href);
    if (!href) return [];

    return [{
      type: "link" as const,
      attrs: {
        href,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }];
  });
}

function sanitizeAttributes(type: string, value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  if (type === "heading") {
    const level = typeof raw.level === "number" ? Math.min(3, Math.max(1, Math.round(raw.level))) : 2;
    return { level };
  }
  if (type === "taskItem") return { checked: raw.checked === true };
  if (type === "orderedList" && typeof raw.start === "number") {
    return { start: Math.max(1, Math.round(raw.start)) };
  }
  if (type === "tableCell" || type === "tableHeader") {
    return {
      colspan: positiveInteger(raw.colspan, 1),
      rowspan: positiveInteger(raw.rowspan, 1),
      colwidth: Array.isArray(raw.colwidth)
        ? raw.colwidth.filter((item): item is number => typeof item === "number" && item > 0).slice(0, 20)
        : null,
    };
  }
  return {};
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

function normalizeHref(value: unknown) {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.length > 2_000) return null;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return null;
}
