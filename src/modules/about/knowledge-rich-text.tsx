"use client";

import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Table2,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import type { KnowledgeDocument } from "@/modules/about/knowledge-types";

const extensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: true }, tableCell: {}, tableHeader: {}, tableRow: {} }),
];

export function KnowledgeRichTextEditor({
  value,
  onChange,
}: {
  value: KnowledgeDocument;
  onChange: (value: string) => void;
}) {
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editorProps: { attributes: { class: "knowledge-prose is-editable" } },
    onCreate: ({ editor: activeEditor }) => onChange(JSON.stringify(activeEditor.getJSON())),
    onUpdate: ({ editor: activeEditor }) => onChange(JSON.stringify(activeEditor.getJSON())),
  });

  if (!editor) return <div className="knowledge-editor-loading">Editor hazırlanır…</div>;

  function setLink() {
    const previousUrl = editor?.getAttributes("link").href as string | undefined;
    const url = window.prompt("Keçid ünvanı", previousUrl ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const buttons = [
    { label: "Qalın", icon: Bold, active: editor.isActive("bold"), action: () => editor.chain().focus().toggleBold().run() },
    { label: "Kursiv", icon: Italic, active: editor.isActive("italic"), action: () => editor.chain().focus().toggleItalic().run() },
    { label: "Başlıq", icon: Heading2, active: editor.isActive("heading", { level: 2 }), action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Markerli siyahı", icon: List, active: editor.isActive("bulletList"), action: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Nömrəli siyahı", icon: ListOrdered, active: editor.isActive("orderedList"), action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Checklist", icon: ListChecks, active: editor.isActive("taskList"), action: () => editor.chain().focus().toggleTaskList().run() },
    { label: "Keçid", icon: Link2, active: editor.isActive("link"), action: setLink },
    { label: "Cədvəl", icon: Table2, active: editor.isActive("table"), action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: "Ayırıcı", icon: Minus, active: false, action: () => editor.chain().focus().setHorizontalRule().run() },
  ];

  return (
    <div className="knowledge-editor-shell">
      <div className="knowledge-editor-toolbar" role="toolbar" aria-label="Mətn formatlama alətləri">
        {buttons.map(({ label, icon: Icon, active, action }) => (
          <button
            key={label}
            type="button"
            className={cx(active && "is-active")}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={action}
          >
            <Icon size={17} aria-hidden="true" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function KnowledgeRichTextViewer({ value }: { value: KnowledgeDocument }) {
  const editor = useEditor({
    extensions,
    content: value,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "knowledge-prose" } },
  });

  return <EditorContent editor={editor} />;
}
