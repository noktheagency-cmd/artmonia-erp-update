import type {
  PlaybookDepartmentRow,
  PlaybookDocumentRow,
} from "@/server/supabase/database.types";

export type PlaybookIconName =
  | "marketing"
  | "sales"
  | "people"
  | "finance"
  | "briefcase"
  | "book"
  | "shield"
  | "support";

export type PlaybookDepartment = {
  id: string;
  name: string;
  slug: string;
  color: string;
  softColor: string;
  icon: PlaybookIconName;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type PlaybookDocument = {
  id: string;
  departmentId: string;
  name: string;
  originalName: string;
  storagePath: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaybookData = {
  departments: PlaybookDepartment[];
  documents: PlaybookDocument[];
};

export function mapDepartmentRow(row: PlaybookDepartmentRow): PlaybookDepartment {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    softColor: row.soft_color,
    icon: row.icon as PlaybookIconName,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapDocumentRow(row: PlaybookDocumentRow): PlaybookDocument {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    originalName: row.original_name,
    storagePath: row.storage_path,
    extension: row.extension,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
