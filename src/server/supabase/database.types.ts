export type Database = {
  public: {
    Tables: {
      playbook_departments: {
        Row: {
          id: string;
          name: string;
          slug: string;
          section: string;
          color: string;
          soft_color: string;
          icon: string;
          position: number;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          section?: string;
          color: string;
          soft_color: string;
          icon: string;
          position?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          section?: string;
          color?: string;
          soft_color?: string;
          icon?: string;
          position?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      playbook_documents: {
        Row: {
          id: string;
          department_id: string;
          name: string;
          original_name: string;
          storage_path: string;
          extension: string;
          mime_type: string;
          size_bytes: number;
          page_count: number | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          department_id: string;
          name: string;
          original_name: string;
          storage_path: string;
          extension: string;
          mime_type: string;
          size_bytes: number;
          page_count?: number | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          department_id?: string;
          name?: string;
          original_name?: string;
          storage_path?: string;
          extension?: string;
          mime_type?: string;
          size_bytes?: number;
          page_count?: number | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playbook_documents_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "playbook_departments";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      delete_playbook_department: {
        Args: { target_department_id: string };
        Returns: { storage_path: string }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type PlaybookDepartmentRow = Database["public"]["Tables"]["playbook_departments"]["Row"];
export type PlaybookDocumentRow = Database["public"]["Tables"]["playbook_documents"]["Row"];
