"use client";

import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Grid2X2,
  Headphones,
  HeartHandshake,
  LoaderCircle,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui/cx";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import { notifyCaughtError } from "@/lib/app-notifications";
import {
  mapDepartmentRow,
  mapDocumentRow,
  type PlaybookData,
  type PlaybookDepartment,
  type PlaybookDocument,
  type PlaybookIconName,
  type PlaybookSection,
} from "@/modules/playbook/playbook-types";

const STORAGE_BUCKET = "playbook-documents";
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const OFFICE_PREVIEW_EXTENSIONS = new Set(["DOC", "DOCX", "XLS", "XLSX", "PPT", "PPTX"]);

const iconMap: Record<PlaybookIconName, LucideIcon> = {
  marketing: Megaphone,
  sales: HeartHandshake,
  people: UsersRound,
  finance: CircleDollarSign,
  briefcase: BriefcaseBusiness,
  book: BookOpen,
  shield: ShieldCheck,
  support: Headphones,
};

const iconOptions: PlaybookIconName[] = [
  "marketing",
  "sales",
  "people",
  "finance",
  "briefcase",
  "book",
  "shield",
  "support",
];

const colorOptions = [
  { color: "#146cff", softColor: "#eaf2ff" },
  { color: "#10b981", softColor: "#e8faf3" },
  { color: "#ff763b", softColor: "#fff0e9" },
  { color: "#8057e8", softColor: "#f0ebff" },
  { color: "#e8487f", softColor: "#ffedf4" },
  { color: "#e7a116", softColor: "#fff7df" },
  { color: "#13abc2", softColor: "#e7f9fc" },
  { color: "#5e6d85", softColor: "#edf1f6" },
];

const supportedMimeTypes: Record<string, string> = {
  PDF: "application/pdf",
  DOC: "application/msword",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLS: "application/vnd.ms-excel",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPT: "application/vnd.ms-powerpoint",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const sectionOptions: Record<PlaybookSection, {
  label: string;
  description: string;
  mapDescription: string;
  icon: LucideIcon;
}> = {
  GUIDELINE: {
    label: "Guideline",
    description: "Hazırkı şirkət məlumatları, qaydalar və proseslər",
    mapDescription: "Şirkətin aktiv bilik sahələri",
    icon: BookOpen,
  },
  ARCHIVE: {
    label: "Arxiv",
    description: "Əməkdaşlıqlar, hazırlanmış müqavilələr və tamamlanan sənədlər",
    mapDescription: "Tamamlanan işlərin sənəd xəritəsi",
    icon: Archive,
  },
};

type DeleteTarget =
  | { type: "department"; department: PlaybookDepartment }
  | { type: "document"; document: PlaybookDocument };

export function PlaybookWorkspace({
  initialData,
  canManage,
  canViewGuideline,
}: {
  initialData: PlaybookData;
  canManage: boolean;
  canViewGuideline: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [departments, setDepartments] = useState(initialData.departments);
  const [documents, setDocuments] = useState(initialData.documents);
  const [activeSection, setActiveSection] = useState<PlaybookSection>(canViewGuideline ? "GUIDELINE" : "ARCHIVE");
  const [activeDepartment, setActiveDepartment] = useState("all");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColorIndex, setNewColorIndex] = useState(0);
  const [newIcon, setNewIcon] = useState<PlaybookIconName>("briefcase");
  const [editingDocument, setEditingDocument] = useState<PlaybookDocument | null>(null);
  const [previewDocument, setPreviewDocument] = useState<PlaybookDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [documentName, setDocumentName] = useState("");
  const [documentDepartmentId, setDocumentDepartmentId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const visibleSectionOptions = (Object.entries(sectionOptions) as [PlaybookSection, (typeof sectionOptions)[PlaybookSection]][])
    .filter(([section]) => section !== "GUIDELINE" || canViewGuideline);

  const departmentById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments]
  );

  const visibleDepartments = useMemo(
    () => departments.filter((department) => department.section === activeSection),
    [activeSection, departments],
  );

  const sectionDocuments = useMemo(() => {
    const visibleDepartmentIds = new Set(visibleDepartments.map((department) => department.id));
    return documents.filter((document) => visibleDepartmentIds.has(document.departmentId));
  }, [documents, visibleDepartments]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("az");

    return sectionDocuments.filter((document) => {
      const matchesDepartment = activeDepartment === "all" || document.departmentId === activeDepartment;
      const departmentName = departmentById.get(document.departmentId)?.name ?? "";
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${document.name} ${departmentName} ${document.extension}`
          .toLocaleLowerCase("az")
          .includes(normalizedQuery);

      return matchesDepartment && matchesQuery;
    });
  }, [activeDepartment, departmentById, query, sectionDocuments]);

  const refreshFromSupabase = useCallback(async () => {
    const [departmentResult, documentResult] = await Promise.all([
      supabase
        .from("playbook_departments")
        .select("*")
        .order("section", { ascending: true })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("playbook_documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (!departmentResult.error) {
      setDepartments(departmentResult.data.map(mapDepartmentRow));
    }
    if (!documentResult.error) {
      setDocuments(documentResult.data.map(mapDocumentRow));
    }
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("playbook-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playbook_departments" },
        () => void refreshFromSupabase()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playbook_documents" },
        () => void refreshFromSupabase()
      )
      .subscribe();

    return () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [refreshFromSupabase, supabase]);

  function announce(message: string) {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 3200);
  }

  function openFilePicker() {
    if (!isUploading && visibleDepartments.length) fileInputRef.current?.click();
  }

  function selectSection(section: PlaybookSection) {
    setActiveSection(section);
    setActiveDepartment("all");
    setDrawerOpen(false);
    setEditingDocument(null);
    setQuery("");
  }

  function openCreateDepartment() {
    setDrawerMode("create");
    setEditingDepartmentId(null);
    setNewName("");
    setNewColorIndex(0);
    setNewIcon("briefcase");
    setDrawerOpen(true);
  }

  function openEditDepartment(department: PlaybookDepartment) {
    const colorIndex = colorOptions.findIndex((option) => option.color === department.color);
    setDrawerMode("edit");
    setEditingDepartmentId(department.id);
    setNewName(department.name);
    setNewColorIndex(colorIndex >= 0 ? colorIndex : 0);
    setNewIcon(department.icon);
    setDrawerOpen(true);
  }

  function openDocumentEditor(document: PlaybookDocument) {
    setEditingDocument(document);
    setDocumentName(document.name);
    setDocumentDepartmentId(document.departmentId);
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) {
      await addFiles(Array.from(event.target.files));
    }
    event.target.value = "";
  }

  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length) {
      await addFiles(Array.from(event.dataTransfer.files));
    }
  }

  async function addFiles(files: File[]) {
    if (isUploading || !visibleDepartments.length) return;

    const departmentId = activeDepartment === "all" ? visibleDepartments[0].id : activeDepartment;
    const validFiles = files.flatMap((file) => {
      const extension = getFileExtension(file.name);
      if (!extension || !supportedMimeTypes[extension]) return [];
      return [{ file, extension }];
    });

    if (!validFiles.length) {
      announce("PDF, DOCX, XLSX və ya PPTX faylı seçin.");
      return;
    }

    const oversizedFile = validFiles.find(({ file }) => file.size > MAX_FILE_SIZE);
    if (oversizedFile) {
      announce(`${oversizedFile.file.name} 6 MB limitini keçir.`);
      return;
    }

    setIsUploading(true);
    const uploadedDocuments: PlaybookDocument[] = [];

    try {
      for (const { file, extension } of validFiles) {
        const mimeType = supportedMimeTypes[extension];
        const storagePath = `${departmentId}/${crypto.randomUUID()}.${extension.toLocaleLowerCase()}`;
        const uploadResult = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });

        if (uploadResult.error) throw uploadResult.error;

        const insertResult = await supabase
          .from("playbook_documents")
          .insert({
            department_id: departmentId,
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 240),
            original_name: file.name.slice(0, 255),
            storage_path: storagePath,
            extension,
            mime_type: mimeType,
            size_bytes: file.size,
          })
          .select("*")
          .single();

        if (insertResult.error) {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
          throw insertResult.error;
        }

        uploadedDocuments.push(mapDocumentRow(insertResult.data));
      }

      setDocuments((current) => [...uploadedDocuments, ...current]);
      announce(`${uploadedDocuments.length} sənəd Supabase-ə yükləndi.`);
    } catch (error) {
      announce(notifyCaughtError(error, "Sənəd yüklənmədi.", "Sənəd yüklənmədi"));
    } finally {
      setIsUploading(false);
    }
  }

  async function saveDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || isMutating) return;

    const selectedColor = colorOptions[newColorIndex];
    setIsMutating(true);

    try {
      if (drawerMode === "edit" && editingDepartmentId) {
        const result = await supabase
          .from("playbook_departments")
          .update({
            name,
            color: selectedColor.color,
            soft_color: selectedColor.softColor,
            icon: newIcon,
          })
          .eq("id", editingDepartmentId)
          .select("*")
          .single();

        if (result.error) throw result.error;
        const updatedDepartment = mapDepartmentRow(result.data);
        setDepartments((current) =>
          current.map((department) =>
            department.id === updatedDepartment.id ? updatedDepartment : department
          )
        );
        announce(`${name} departamenti yeniləndi.`);
      } else {
        const result = await supabase
          .from("playbook_departments")
          .insert({
            name,
            slug: createUniqueSlug(name, departments),
            section: activeSection,
            color: selectedColor.color,
            soft_color: selectedColor.softColor,
            icon: newIcon,
            position: Math.max(0, ...visibleDepartments.map((department) => department.position)) + 10,
          })
          .select("*")
          .single();

        if (result.error) throw result.error;
        const createdDepartment = mapDepartmentRow(result.data);
        setDepartments((current) => [...current, createdDepartment]);
        setActiveDepartment(createdDepartment.id);
        announce(`${name} departamenti yaradıldı.`);
      }

      setDrawerOpen(false);
    } catch (error) {
      announce(notifyCaughtError(error, "Departament yadda saxlanmadı.", "Departament saxlanmadı"));
    } finally {
      setIsMutating(false);
    }
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDocument || !documentName.trim() || !documentDepartmentId || isMutating) return;

    setIsMutating(true);
    try {
      const result = await supabase
        .from("playbook_documents")
        .update({
          name: documentName.trim(),
          department_id: documentDepartmentId,
        })
        .eq("id", editingDocument.id)
        .select("*")
        .single();

      if (result.error) throw result.error;
      const updatedDocument = mapDocumentRow(result.data);
      setDocuments((current) =>
        current.map((document) =>
          document.id === updatedDocument.id ? updatedDocument : document
        )
      );
      setEditingDocument(null);
      announce(`${updatedDocument.name} yeniləndi.`);
    } catch (error) {
      announce(notifyCaughtError(error, "Sənəd yenilənmədi.", "Sənəd yenilənmədi"));
    } finally {
      setIsMutating(false);
    }
  }

  async function openDocumentPreview(document: PlaybookDocument) {
    setPreviewDocument(document);
    setPreviewUrl(null);
    setIsPreviewLoading(false);

    if (document.extension !== "PDF" && !OFFICE_PREVIEW_EXTENSIONS.has(document.extension)) {
      return;
    }

    if (OFFICE_PREVIEW_EXTENSIONS.has(document.extension)) return;
    await loadDocumentPreview(document);
  }

  async function loadDocumentPreview(document: PlaybookDocument) {
    setIsPreviewLoading(true);
    try {
      const signedUrl = await requestDocumentSignedUrl(document.id);
      setPreviewUrl(
        document.extension === "PDF"
          ? signedUrl
          : createOfficePreviewUrl(signedUrl),
      );
    } catch (error) {
      announce(notifyCaughtError(error, "Sənəd açıla bilmədi.", "Sənəd açıla bilmədi"));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function closeDocumentPreview() {
    setPreviewDocument(null);
    setPreviewUrl(null);
    setIsPreviewLoading(false);
  }

  async function downloadDocument(document: PlaybookDocument) {
    let signedUrl: string;
    try {
      signedUrl = await requestDocumentSignedUrl(document.id, true);
    } catch (error) {
      announce(notifyCaughtError(error, "Sənəd endirilə bilmədi.", "Sənəd endirilə bilmədi"));
      return;
    }

    const link = window.document.createElement("a");
    link.href = signedUrl;
    link.download = document.originalName;
    link.style.display = "none";
    window.document.body.append(link);
    link.click();
    link.remove();
  }

  async function confirmDelete() {
    if (!deleteTarget || isMutating) return;
    setIsMutating(true);

    try {
      if (deleteTarget.type === "document") {
        const targetDocument = deleteTarget.document;
        const deleteResult = await supabase
          .from("playbook_documents")
          .delete()
          .eq("id", targetDocument.id);
        if (deleteResult.error) throw deleteResult.error;

        const storageResult = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([targetDocument.storagePath]);

        setDocuments((current) => current.filter((document) => document.id !== targetDocument.id));
        announce(
          storageResult.error
            ? `${targetDocument.name} silindi, Storage təmizlənməsi təkrar yoxlanmalıdır.`
            : `${targetDocument.name} silindi.`
        );
      } else {
        const targetDepartment = deleteTarget.department;
        const rpcResult = await supabase.rpc("delete_playbook_department", {
          target_department_id: targetDepartment.id,
        });
        if (rpcResult.error) throw rpcResult.error;

        const paths = rpcResult.data.map((item) => item.storage_path).filter(Boolean);
        let storageCleanupFailed = false;
        if (paths.length) {
          const storageResult = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
          storageCleanupFailed = Boolean(storageResult.error);
        }

        setDepartments((current) => current.filter((department) => department.id !== targetDepartment.id));
        setDocuments((current) => current.filter((document) => document.departmentId !== targetDepartment.id));
        if (activeDepartment === targetDepartment.id) setActiveDepartment("all");
        setDrawerOpen(false);
        announce(
          storageCleanupFailed
            ? `${targetDepartment.name} silindi, Storage təmizlənməsi təkrar yoxlanmalıdır.`
            : `${targetDepartment.name} departamenti silindi.`
        );
      }

      setDeleteTarget(null);
      setEditingDocument(null);
    } catch (error) {
      announce(notifyCaughtError(error, "Silmə əməliyyatı tamamlanmadı.", "Silmə alınmadı"));
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="playbook-page" aria-labelledby="playbook-title">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        multiple
        onChange={handleFileInput}
      />

      <header className="playbook-header">
        <div>
          <h1 id="playbook-title">Şirkət Playbook-u</h1>
          <p>Şirkətin aktual bilikləri və tamamlanmış işləri, bir yerdə.</p>
        </div>
        {canManage ? <div className="playbook-header-actions">
          <button className="playbook-button playbook-button-primary" type="button" onClick={openCreateDepartment}>
            <Plus size={17} />
            Yeni departament
          </button>
          <button className="playbook-button playbook-button-secondary" type="button" onClick={openFilePicker} disabled={isUploading || !departments.length}>
            {isUploading ? <LoaderCircle className="playbook-spin" size={17} /> : <UploadCloud size={17} />}
            {isUploading ? "Yüklənir..." : "Sənəd yüklə"}
          </button>
        </div> : null}
      </header>

      <nav className={cx("playbook-section-switcher", visibleSectionOptions.length === 1 && "is-single")} aria-label="Playbook bölməsi">
        {visibleSectionOptions.map(([section, option]) => {
          const SectionIcon = option.icon;
          const departmentCount = departments.filter((department) => department.section === section).length;
          return (
            <button
              className={cx("playbook-section-button", activeSection === section && "is-active")}
              type="button"
              key={section}
              onClick={() => selectSection(section)}
              aria-current={activeSection === section ? "page" : undefined}
            >
              <span><SectionIcon size={19} /></span>
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
              <em>{departmentCount} departament</em>
            </button>
          );
        })}
      </nav>

      <div className="playbook-department-bar" aria-label="Departament filtri">
        <DepartmentTab active={activeDepartment === "all"} color="#146cff" icon={Grid2X2} label="Hamısı" onClick={() => setActiveDepartment("all")} />
        {visibleDepartments.map((department) => (
          <DepartmentTab
            key={department.id}
            active={activeDepartment === department.id}
            color={department.color}
            icon={iconMap[department.icon]}
            label={department.name}
            onClick={() => setActiveDepartment(department.id)}
          />
        ))}
        {canManage ? <button className="playbook-add-department" type="button" onClick={openCreateDepartment} aria-label="Yeni departament yarat"><Plus size={19} /></button> : null}
        {canManage && activeDepartment !== "all" && departmentById.get(activeDepartment) ? (
          <button className="playbook-edit-department" type="button" onClick={() => openEditDepartment(departmentById.get(activeDepartment)!)}>
            <Pencil size={15} />
            Redaktə et
          </button>
        ) : null}
      </div>

      <div className="playbook-library-layout">
        <article className="playbook-library-panel">
          <div className="playbook-library-head">
            <div>
              <h2>{sectionOptions[activeSection].label} sənədləri</h2>
              <span>{filteredDocuments.length} sənəd göstərilir</span>
            </div>
            <label className="playbook-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sənədlərdə axtar" />
            </label>
          </div>

          <div className="playbook-table" role="table" aria-label={`${sectionOptions[activeSection].label} sənədləri`}>
            <div className="playbook-table-header" role="row">
              <span>Sənəd adı</span><span>Departament</span><span>Növ</span><span>Yeniləndi</span><span />
            </div>
            {filteredDocuments.length ? (
              filteredDocuments.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  department={departmentById.get(document.departmentId)}
                  onPreview={() => void openDocumentPreview(document)}
                  onDownload={() => void downloadDocument(document)}
                  onMenu={() => openDocumentEditor(document)}
                  canManage={canManage}
                />
              ))
            ) : (
              <div className="playbook-empty-state">
                <Archive size={26} />
                <strong>{sectionDocuments.length ? "Sənəd tapılmadı" : `İlk ${sectionOptions[activeSection].label} sənədini əlavə edin`}</strong>
                <span>{sectionDocuments.length ? "Axtarışı və ya departament filtrini dəyişin." : activeSection === "ARCHIVE" ? "Əməkdaşlıqlar, müqavilələr və tamamlanmış işlər burada görünəcək." : "Aktual şirkət məlumatları və qaydalar burada görünəcək."}</span>
              </div>
            )}
          </div>

          {canManage ? <button className="playbook-dropzone" type="button" onClick={openFilePicker} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} disabled={isUploading || !visibleDepartments.length}>
            <span>{isUploading ? <LoaderCircle className="playbook-spin" size={22} /> : <UploadCloud size={22} />}</span>
            <strong>{isUploading ? "Fayllar Supabase-ə yüklənir..." : "Sənədləri bura sürükləyin və ya yükləmək üçün klikləyin"}</strong>
            <small>PDF, DOCX, XLSX və PPTX · maksimum 6 MB</small>
          </button> : null}
        </article>

        <aside className="playbook-side-stack">
          <article className="playbook-map-panel">
            <div className="playbook-panel-title">
              <div><h2>{sectionOptions[activeSection].label} xəritəsi</h2><p>{sectionOptions[activeSection].mapDescription}</p></div>
              <Sparkles size={18} />
            </div>
            <div className="playbook-map-list">
              {visibleDepartments.map((department) => {
                const Icon = iconMap[department.icon];
                const count = sectionDocuments.filter((document) => document.departmentId === department.id).length;
                return (
                  <div className="playbook-map-item" key={department.id}>
                    <button type="button" onClick={() => setActiveDepartment(department.id)}>
                      <span style={{ color: department.color, background: department.softColor }}><Icon size={15} /></span>
                      <strong>{department.name}</strong>
                      <small>{count} sənəd</small>
                    </button>
                    {canManage ? <button className="playbook-map-edit" type="button" onClick={() => openEditDepartment(department)} aria-label={`${department.name} departamentini redaktə et`}><Pencil size={13} /></button> : null}
                  </div>
                );
              })}
            </div>
            <div className="playbook-map-total"><span>Cəmi</span><strong>{sectionDocuments.length} sənəd</strong></div>
          </article>

          {canManage ? <button className="playbook-quick-upload" type="button" onClick={openFilePicker} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} disabled={isUploading || !visibleDepartments.length}>
            <span>{isUploading ? <LoaderCircle className="playbook-spin" size={25} /> : <UploadCloud size={25} />}</span>
            <strong>{isUploading ? "Yüklənir..." : "Sənəd əlavə et"}</strong>
            <small>Faylı seçin və ya bura buraxın</small>
            <ArrowDownToLine size={16} />
          </button> : null}
        </aside>
      </div>

      {drawerOpen ? (
        <BodyPortal><div className="playbook-drawer-backdrop" role="presentation">
          <aside className="playbook-drawer" role="dialog" aria-modal="true" aria-labelledby="department-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="playbook-drawer-head">
              <div><span><FolderKanban size={17} /></span><h2 id="department-drawer-title">{drawerMode === "edit" ? "Departamenti redaktə et" : `Yeni ${sectionOptions[activeSection].label} departamenti`}</h2></div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Pəncərəni bağla" disabled={isMutating}><X size={19} /></button>
            </div>
            <form onSubmit={saveDepartment}>
              <label className="playbook-field"><span>Departament adı</span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Məsələn: Məhsul" maxLength={80} /></label>

              <fieldset className="playbook-choice-field" disabled={isMutating}>
                <legend>Rəng</legend>
                <div className="playbook-color-grid">
                  {colorOptions.map((option, index) => (
                    <button key={option.color} type="button" className={cx(index === newColorIndex && "is-selected")} onClick={() => setNewColorIndex(index)} aria-label={`${option.color} rəngini seç`}>
                      <i style={{ background: option.color }} />{index === newColorIndex ? <Check size={13} /> : null}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="playbook-choice-field" disabled={isMutating}>
                <legend>İkon</legend>
                <div className="playbook-icon-grid">
                  {iconOptions.map((iconName) => {
                    const Icon = iconMap[iconName];
                    return <button key={iconName} type="button" className={cx(iconName === newIcon && "is-selected")} onClick={() => setNewIcon(iconName)} aria-label={`${iconName} ikonunu seç`}><Icon size={19} /></button>;
                  })}
                </div>
              </fieldset>

              <div className="playbook-drawer-preview">
                <span style={{ color: colorOptions[newColorIndex].color, background: colorOptions[newColorIndex].softColor }}>{(() => { const PreviewIcon = iconMap[newIcon]; return <PreviewIcon size={20} />; })()}</span>
                <div><small>{sectionOptions[activeSection].label} · Ön baxış</small><strong>{newName || "Yeni departament"}</strong></div>
              </div>

              <div className="playbook-drawer-actions">
                {drawerMode === "edit" && editingDepartmentId ? (
                  <button className="playbook-danger-button" type="button" onClick={() => {
                    const department = departmentById.get(editingDepartmentId);
                    if (department) setDeleteTarget({ type: "department", department });
                  }}><Trash2 size={14} /> Sil</button>
                ) : <span />}
                <button type="button" onClick={() => setDrawerOpen(false)}>Ləğv et</button>
                <button type="submit" disabled={!newName.trim() || isMutating}>{isMutating ? <LoaderCircle className="playbook-spin" size={15} /> : null}{drawerMode === "edit" ? "Yadda saxla" : "Yarat"}</button>
              </div>
            </form>
          </aside>
        </div></BodyPortal>
      ) : null}

      {editingDocument ? (
        <BodyPortal><div className="playbook-modal-backdrop" role="presentation">
          <section className="playbook-document-modal" role="dialog" aria-modal="true" aria-labelledby="document-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="playbook-modal-head">
              <div><span><FileText size={18} /></span><div><h2 id="document-editor-title">Sənədi redaktə et</h2><p>{editingDocument.originalName}</p></div></div>
              <button type="button" onClick={() => setEditingDocument(null)} aria-label="Pəncərəni bağla"><X size={18} /></button>
            </div>
            <form onSubmit={saveDocument}>
              <label className="playbook-field"><span>Sənəd adı</span><input value={documentName} onChange={(event) => setDocumentName(event.target.value)} maxLength={240} /></label>
              <label className="playbook-field"><span>Departament</span><select value={documentDepartmentId} onChange={(event) => setDocumentDepartmentId(event.target.value)}>{visibleDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
              <div className="playbook-document-meta"><span>{editingDocument.extension}</span><span>{formatFileSize(editingDocument.sizeBytes)}</span><span suppressHydrationWarning>{formatRelativeDate(editingDocument.updatedAt)}</span></div>
              <div className="playbook-modal-actions">
                <button className="playbook-danger-button" type="button" onClick={() => setDeleteTarget({ type: "document", document: editingDocument })}><Trash2 size={14} /> Sil</button>
                <span />
                <button type="button" onClick={() => setEditingDocument(null)}>Ləğv et</button>
                <button type="submit" disabled={!documentName.trim() || isMutating}>{isMutating ? <LoaderCircle className="playbook-spin" size={15} /> : <Check size={15} />} Yadda saxla</button>
              </div>
            </form>
          </section>
        </div></BodyPortal>
      ) : null}

      {previewDocument ? (
        <BodyPortal><div className="playbook-modal-backdrop playbook-preview-backdrop" role="presentation">
          <section className="playbook-preview-modal" role="dialog" aria-modal="true" aria-labelledby="playbook-preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="playbook-modal-head">
              <div><span><FileText size={18} /></span><div><h2 id="playbook-preview-title">Sənədə baxış</h2><p>{previewDocument.name}</p></div></div>
              <button type="button" onClick={closeDocumentPreview} aria-label="Pəncərəni bağla"><X size={18} /></button>
            </div>
            <div className="playbook-preview-toolbar">
              <span>{previewDocument.extension} · {formatFileSize(previewDocument.sizeBytes)}</span>
              <button type="button" onClick={() => void downloadDocument(previewDocument)}><Download size={15} /> Endir</button>
            </div>
            <div className="playbook-preview-body">
              {isPreviewLoading ? (
                <div className="playbook-preview-loading"><LoaderCircle className="playbook-spin" size={26} /><span>Sənəd hazırlanır...</span></div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`${previewDocument.name} önbaxış`}
                  allowFullScreen
                  referrerPolicy="no-referrer"
                />
              ) : OFFICE_PREVIEW_EXTENSIONS.has(previewDocument.extension) ? (
                <div className="playbook-preview-consent">
                  <FileText size={34} />
                  <strong>Office önbaxışı hazırdır</strong>
                  <span>Sənəd yalnız bu əməliyyatdan sonra 5 dəqiqəlik imzalı keçidlə Microsoft Office viewer-də açılacaq.</span>
                  <button type="button" onClick={() => void loadDocumentPreview(previewDocument)}>
                    Microsoft Office ilə önbaxışı aç
                  </button>
                </div>
              ) : (
                <div className="playbook-preview-unavailable"><FileText size={30} /><strong>Bu format üçün daxili önbaxış yoxdur</strong><span>Sənədi cihazınızda açmaq üçün “Endir” düyməsindən istifadə edin.</span></div>
              )}
            </div>
          </section>
        </div></BodyPortal>
      ) : null}

      {deleteTarget ? (
        <BodyPortal><div className="playbook-confirm-backdrop" role="presentation">
          <section className="playbook-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="playbook-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="playbook-confirm-icon"><AlertTriangle size={22} /></span>
            <h2 id="playbook-confirm-title">Silməni təsdiqləyin</h2>
            <p>{deleteTarget.type === "department" ? `${deleteTarget.department.name} və ona aid bütün sənədlər silinəcək.` : `${deleteTarget.document.name} həm siyahıdan, həm də Storage-dan silinəcək.`}</p>
            <div><button type="button" onClick={() => setDeleteTarget(null)} disabled={isMutating}>Ləğv et</button><button type="button" onClick={() => void confirmDelete()} disabled={isMutating}>{isMutating ? <LoaderCircle className="playbook-spin" size={15} /> : <Trash2 size={15} />} Sil</button></div>
          </section>
        </div></BodyPortal>
      ) : null}

      <div className={cx("playbook-toast", toast && "is-visible")} role="status" aria-live="polite"><Check size={16} />{toast}</div>
    </section>
  );
}

function BodyPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return createPortal(children, document.body);
}

function DepartmentTab({ active, color, icon: Icon, label, onClick }: { active: boolean; color: string; icon: LucideIcon; label: string; onClick: () => void }) {
  return <button className={cx("playbook-department-tab", active && "is-active")} type="button" onClick={onClick} style={{ "--department-color": color } as React.CSSProperties}><Icon size={16} />{label}</button>;
}

function DocumentRow({ document, department, onPreview, onDownload, onMenu, canManage }: { document: PlaybookDocument; department?: PlaybookDepartment; onPreview: () => void; onDownload: () => void; onMenu: () => void; canManage: boolean }) {
  const FileIcon = document.extension === "XLSX" || document.extension === "XLS" ? FileSpreadsheet : document.extension === "PDF" ? FileText : File;

  return (
    <div className="playbook-document-row" role="row">
      <div className="playbook-document-name" role="cell">
        <button type="button" onClick={onPreview}>
          <span className={cx("playbook-file-icon", `is-${document.extension.toLocaleLowerCase()}`)}><FileIcon size={18} /></span>
          <span><strong>{document.name}</strong><small>{formatFileSize(document.sizeBytes)}</small></span>
        </button>
      </div>
      <div role="cell">{department ? <span className="playbook-department-tag" style={{ color: department.color, background: department.softColor }}>{department.name}</span> : "—"}</div>
      <div className="playbook-document-kind" role="cell">{document.extension}{document.pageCount ? ` · ${document.pageCount} səhifə` : ""}</div>
      <div className="playbook-document-date" role="cell" suppressHydrationWarning>{formatRelativeDate(document.updatedAt)}</div>
      <div className="playbook-row-actions">
        <button type="button" className="playbook-row-menu" aria-label={`${document.name} sənədini endir`} onClick={onDownload}><Download size={16} /></button>
        {canManage ? <button type="button" className="playbook-row-menu" aria-label={`${document.name} sənədini redaktə et`} onClick={onMenu}><MoreHorizontal size={18} /></button> : null}
      </div>
    </div>
  );
}

function createUniqueSlug(name: string, departments: PlaybookDepartment[]) {
  const base = name
    .toLocaleLowerCase("az")
    .replace(/ə/g, "e").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/ç/g, "c").replace(/ğ/g, "g")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "departament";
  const existing = new Set(departments.map((department) => department.slug));
  if (!existing.has(base)) return base;

  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

async function requestDocumentSignedUrl(documentId: string, download = false) {
  const response = await fetch(
    `/api/playbook/documents/${encodeURIComponent(documentId)}/signed-url?download=${download ? "1" : "0"}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { url?: string; error?: string }
    | null;

  if (!response.ok || !payload?.url) {
    throw new Error(payload?.error ?? "Sənəd üçün keçid yaradıla bilmədi.");
  }

  return payload.url;
}

function createOfficePreviewUrl(signedUrl: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
}

function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeDate(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "İndi";
  if (minutes < 60) return `${minutes} dəq əvvəl`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat əvvəl`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün əvvəl`;
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
