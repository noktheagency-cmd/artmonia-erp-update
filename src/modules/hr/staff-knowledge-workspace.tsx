"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import {
  Bold,
  Check,
  Clock3,
  File,
  FileSpreadsheet,
  FileText,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  LoaderCircle,
  Paperclip,
  Plus,
  Quote,
  Save,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapActionResult } from "@/lib/action-result";
import type { HrStaffProfileData } from "@/modules/hr/staff-profile-data";
import { HR_DOCUMENT_ACCEPT, HR_DOCUMENT_MAX_BYTES } from "@/server/storage/hr-documents-public";
import "./staff-knowledge.css";

type Action = (formData: FormData) => Promise<unknown>;
type Knowledge = HrStaffProfileData["knowledge"];

export function StaffKnowledgeWorkspace({
  employeeId,
  employeeName,
  knowledge,
  createNoteAction,
  updateNoteAction,
  finalizeDocumentAction,
}: {
  employeeId: string;
  employeeName: string;
  knowledge: Knowledge;
  createNoteAction: Action;
  updateNoteAction: Action;
  finalizeDocumentAction: Action;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"notes" | "documents">(
    knowledge.permissions.canReadNotes ? "notes" : "documents",
  );
  const [selectedNoteId, setSelectedNoteId] = useState(knowledge.notes[0]?.id ?? "");
  const [title, setTitle] = useState(knowledge.notes[0]?.title ?? "");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedNote = knowledge.notes.find((note) => note.id === selectedNoteId) ?? knowledge.notes[0];

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
      LinkExtension.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
    ],
    content: selectedNote?.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: knowledge.permissions.canManageNotes,
    editorProps: { attributes: { class: "staff-rich-editor", "aria-label": "Əməkdaş qeydi" } },
    onUpdate: () => setDirty(true),
  });

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && selectedNote && !pending) saveNote();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  function saveNote() {
    if (!selectedNote || !editor || !knowledge.permissions.canManageNotes) return;
    const form = new FormData();
    form.set("employeeId", employeeId);
    form.set("noteId", selectedNote.id);
    form.set("title", title);
    form.set("content", JSON.stringify(editor.getJSON()));
    setNotice("");
    startTransition(() => {
      void updateNoteAction(form)
        .then((result) => {
          unwrapActionResult(result);
          setDirty(false);
          setNotice("Dəyişikliklər təhlükəsiz saxlanıldı.");
          router.refresh();
        })
        .catch((error) => setNotice(error instanceof Error ? error.message : "Qeyd saxlanılmadı"));
    });
  }

  function selectNote(note: Knowledge["notes"][number]) {
    setSelectedNoteId(note.id);
    setTitle(note.title);
    setDirty(false);
    setNotice("");
    editor?.commands.setContent(note.content ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
  }

  function createNote() {
    const form = new FormData();
    form.set("employeeId", employeeId);
    form.set("title", `Yeni qeyd ${knowledge.notes.length + 1}`);
    startTransition(() => {
      void createNoteAction(form)
        .then((result) => {
          unwrapActionResult(result);
          setNotice("Yeni qeyd yaradıldı.");
          router.refresh();
        })
        .catch((error) => setNotice(error instanceof Error ? error.message : "Qeyd yaradıla bilmədi"));
    });
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setNotice("");
    if (file.size <= 0 || file.size > HR_DOCUMENT_MAX_BYTES) {
      setNotice("Sənədin ölçüsü 15 MB-dan böyük ola bilməz.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/hr/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name: file.name, type: file.type, size: file.size }),
      });
      const payload = await response.json() as { uploadUrl?: string; objectKey?: string; error?: string };
      if (!response.ok || !payload.uploadUrl || !payload.objectKey) throw new Error(payload.error ?? "Yükləmə ünvanı hazırlanmadı");
      const upload = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!upload.ok) throw new Error("Fayl storage-a yüklənmədi. R2 CORS sazlamasını yoxlayın.");
      const form = new FormData();
      form.set("employeeId", employeeId);
      form.set("objectKey", payload.objectKey);
      form.set("name", file.name);
      form.set("type", file.type);
      form.set("size", String(file.size));
      unwrapActionResult(await finalizeDocumentAction(form));
      setNotice("Sənəd qorunan yaddaşa əlavə edildi.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sənəd yüklənmədi");
    } finally {
      setUploading(false);
    }
  }

  if (!knowledge.permissions.canReadNotes && !knowledge.permissions.canReadDocuments) return null;

  return (
    <section className="staff-knowledge" aria-busy={pending || uploading}>
      <header className="staff-knowledge-head">
        <div>
          <span className="staff-knowledge-eyebrow"><ShieldCheck /> Məxfi əməkdaş məlumatı</span>
          <h2>Qeydlər və sənədlər</h2>
        </div>
        <nav aria-label="Qeyd və sənəd bölmələri">
          {knowledge.permissions.canReadNotes ? (
            <button className={tab === "notes" ? "is-active" : ""} onClick={() => setTab("notes")}>
              <FileText /> Qeydlər <span>{knowledge.notes.length}</span>
            </button>
          ) : null}
          {knowledge.permissions.canReadDocuments ? (
            <button className={tab === "documents" ? "is-active" : ""} onClick={() => setTab("documents")}>
              <Paperclip /> Sənədlər <span>{knowledge.documents.length}</span>
            </button>
          ) : null}
        </nav>
      </header>

      {notice ? <div className="staff-knowledge-notice" role="status">{notice}</div> : null}

      {tab === "notes" ? (
        <div className="staff-knowledge-grid">
          <aside className="staff-note-list">
            <div className="staff-note-list-head">
              <strong>Yazılar</strong>
              {knowledge.permissions.canManageNotes ? (
                <Button size="icon-sm" variant="ghost" aria-label="Yeni qeyd yarat" onClick={createNote} disabled={pending}><Plus /></Button>
              ) : null}
            </div>
            {knowledge.notes.length ? knowledge.notes.map((note) => (
              <button key={note.id} className={note.id === selectedNote?.id ? "is-active" : ""} onClick={() => selectNote(note)}>
                <span>{note.title}</span>
                <small>{formatRelative(note.updatedAt)} · {note.updatedByName}</small>
              </button>
            )) : (
              <div className="staff-knowledge-empty"><FileText /><strong>Hələ qeyd yoxdur</strong><p>İlk daxili qeydi yaradın.</p></div>
            )}
          </aside>

          <main className="staff-editor-shell">
            {selectedNote ? (
              <>
                <div className="staff-editor-title-row">
                  <Input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} disabled={!knowledge.permissions.canManageNotes} maxLength={160} aria-label="Qeyd başlığı" />
                  <span>{dirty ? "Saxlanılmayıb" : "Saxlanılıb"}</span>
                </div>
                <div className="staff-editor-toolbar" role="toolbar" aria-label="Mətn formatlama">
                  <Tool label="Başlıq 1" active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 /></Tool>
                  <Tool label="Başlıq 2" active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 /></Tool>
                  <i />
                  <Tool label="Qalın" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></Tool>
                  <Tool label="Maili" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></Tool>
                  <Tool label="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List /></Tool>
                  <Tool label="Nömrəli list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered /></Tool>
                  <Tool label="Mətn bloku" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote /></Tool>
                  <Tool label="Link" active={editor?.isActive("link")} onClick={() => setEditorLink(editor)}><LinkIcon /></Tool>
                </div>
                <EditorContent editor={editor} />
                <footer className="staff-editor-footer">
                  <span className={dirty ? "is-dirty" : ""}>{dirty ? <Clock3 /> : <Check />} {dirty ? "Dəyişikliklər gözləyir" : "Bütün dəyişikliklər saxlanılıb"}</span>
                  {knowledge.permissions.canManageNotes ? (
                    <Button onClick={saveNote} disabled={!dirty || pending}>{pending ? <LoaderCircle className="is-spin" /> : <Save />} Yadda saxla</Button>
                  ) : null}
                </footer>
              </>
            ) : (
              <div className="staff-knowledge-empty is-large"><FileText /><strong>Yazı sahəsi hazırdır</strong><p>Yeni qeyd yaradaraq əməkdaş haqqında strukturlaşdırılmış məlumat yazın.</p>{knowledge.permissions.canManageNotes ? <Button onClick={createNote}><Plus /> İlk qeydi yarat</Button> : null}</div>
            )}
          </main>

          <ActivityRail activity={knowledge.activity} />
        </div>
      ) : (
        <div className="staff-documents-layout">
          <div className="staff-document-main">
            {knowledge.permissions.canManageDocuments ? (
              <div className="staff-document-drop">
                <input ref={fileInput} type="file" accept={HR_DOCUMENT_ACCEPT} onChange={uploadFile} />
                <span><UploadCloud /></span>
                <div><strong>{uploading ? "Sənəd yüklənir..." : "Sənəd əlavə edin"}</strong><p>PDF, Word, Excel, PNG və JPEG · maksimum 15 MB</p></div>
                <Button variant="outline" disabled={uploading || !knowledge.storageConfigured} onClick={() => fileInput.current?.click()}>{uploading ? <LoaderCircle className="is-spin" /> : <Plus />} Fayl seç</Button>
              </div>
            ) : null}
            {!knowledge.storageConfigured ? <div className="staff-storage-warning"><ShieldCheck /><span><strong>Storage bağlantısı gözləyir</strong>R2 server dəyişənləri tamamlandıqdan sonra sənəd yükləmə aktiv olacaq.</span></div> : null}
            <div className="staff-document-list">
              <div className="staff-document-row is-head"><span>Sənəd</span><span>Ölçü</span><span>Əlavə edən</span><span>Tarix</span><span /></div>
              {knowledge.documents.map((document) => (
                <div className="staff-document-row" key={document.id}>
                  <span className="staff-document-name">{fileIcon(document.mimeType)}<i><strong>{document.name}</strong><small>{mimeLabel(document.mimeType)}</small></i></span>
                  <span>{formatBytes(document.sizeBytes)}</span>
                  <span>{document.uploadedByName}</span>
                  <span>{formatDate(document.createdAt)}</span>
                  <a href={`/api/hr/documents/${document.id}/download`} target="_blank" rel="noreferrer">Aç</a>
                </div>
              ))}
              {!knowledge.documents.length ? <div className="staff-knowledge-empty is-large"><Paperclip /><strong>Hələ sənəd yoxdur</strong><p>Əməkdaşa aid müqavilə, ərizə və digər qorunan fayllar burada görünəcək.</p></div> : null}
            </div>
          </div>
          <ActivityRail activity={knowledge.activity} />
        </div>
      )}
    </section>
  );
}

function Tool({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} className={active ? "is-active" : ""} onClick={onClick}>{children}</button>;
}

function ActivityRail({ activity }: { activity: Knowledge["activity"] }) {
  return <aside className="staff-knowledge-activity"><header><Clock3 /><div><strong>Dəyişiklik tarixçəsi</strong><small>Kim və nə vaxt</small></div></header>{activity.length ? <div>{activity.map((item) => <article key={item.id}><i /><span><strong>{item.actorName}</strong><p>{item.reason}</p><small>{formatDateTime(item.createdAt)}</small></span></article>)}</div> : <p className="staff-activity-empty">Hələ dəyişiklik qeydi yoxdur.</p>}</aside>;
}

function setEditorLink(editor: Editor | null) {
  if (!editor) return;
  const current = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("Link ünvanını daxil edin", current ?? "https://");
  if (href === null) return;
  if (!href.trim()) editor.chain().focus().unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}

function fileIcon(mime: string) {
  if (mime.includes("sheet") || mime.includes("excel")) return <FileSpreadsheet />;
  if (mime.includes("pdf") || mime.includes("word")) return <FileText />;
  return <File />;
}

function mimeLabel(mime: string) {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("word")) return "Word";
  if (mime.includes("sheet") || mime.includes("excel")) return "Excel";
  return mime.includes("image") ? "Şəkil" : "Sənəd";
}

function formatBytes(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatRelative(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); return days <= 0 ? "Bu gün" : days === 1 ? "Dünən" : `${days} gün əvvəl`; }
