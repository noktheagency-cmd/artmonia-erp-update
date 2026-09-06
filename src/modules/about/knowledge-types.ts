export type KnowledgeStatus = "DRAFT" | "PUBLISHED";

export type KnowledgeDocumentMark = {
  type: "bold" | "italic" | "link";
  attrs?: Record<string, unknown>;
};

export type KnowledgeDocumentNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: KnowledgeDocumentNode[];
  marks?: KnowledgeDocumentMark[];
  text?: string;
};

export type KnowledgeDocument = KnowledgeDocumentNode & { type: "doc" };

export type KnowledgeArticle = {
  id: string;
  categoryId: string;
  inheritAudience: boolean;
  audienceEmployeeIds: string[];
  title: string;
  content: KnowledgeDocument;
  plainText: string;
  position: number;
  status: KnowledgeStatus;
  updatedAt: string;
  updatedBy: string | null;
};

export type KnowledgeCategory = {
  id: string;
  name: string;
  position: number;
  status: KnowledgeStatus;
  audienceEmployeeIds: string[];
  articles: KnowledgeArticle[];
};

export type CompanyKnowledgeData = {
  sectionId: string | null;
  categories: KnowledgeCategory[];
  employeeOptions: Array<{ id: string; name: string; department: string; position: string }>;
};

export const emptyKnowledgeDocument: KnowledgeDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
