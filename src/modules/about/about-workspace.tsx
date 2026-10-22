"use client";

import {
  BookOpenText,
  Check,
  ChevronRight,
  Clock3,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type DragEvent, type FormEvent, type ReactNode, useDeferredValue, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui/cx";
import {
  createKnowledgeArticleAction,
  createKnowledgeCategoryAction,
  deleteKnowledgeArticleAction,
  deleteKnowledgeCategoryAction,
  reorderKnowledgeArticlesAction,
  reorderKnowledgeCategoriesAction,
  updateKnowledgeArticleAction,
  updateKnowledgeCategoryAction,
} from "@/modules/about/actions";
import {
  emptyKnowledgeDocument,
  type CompanyKnowledgeData,
  type KnowledgeArticle,
  type KnowledgeCategory,
  type KnowledgeStatus,
} from "@/modules/about/knowledge-types";

const KnowledgeRichTextEditor = dynamic(
  () => import("@/modules/about/knowledge-rich-text").then((module) => module.KnowledgeRichTextEditor),
  { ssr: false, loading: () => <div className="knowledge-editor-loading">Editor hazırlanır…</div> },
);
const KnowledgeRichTextViewer = dynamic(
  () => import("@/modules/about/knowledge-rich-text").then((module) => module.KnowledgeRichTextViewer),
  { ssr: false, loading: () => <div className="knowledge-article-loading" aria-label="Məqalə hazırlanır" /> },
);

type CategoryDialog = { mode: "create" } | { mode: "edit"; category: KnowledgeCategory };
type ArticleDialog =
  | { mode: "create"; categoryId: string }
  | { mode: "edit"; article: KnowledgeArticle };
type DeleteTarget =
  | { type: "category"; id: string; name: string }
  | { type: "article"; id: string; name: string };

export function AboutWorkspace({
  initialData,
  canEdit,
}: {
  initialData: CompanyKnowledgeData;
  canEdit: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialData.categories[0]?.id ?? null);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(initialData.categories[0]?.articles[0]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const contentRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ kind: "category" | "article"; id: string } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialog | null>(null);
  const [articleDialog, setArticleDialog] = useState<ArticleDialog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const selectedCategory = data.categories.find(({ id }) => id === selectedCategoryId) ?? data.categories[0] ?? null;
  const selectedArticle = selectedCategory?.articles.find(({ id }) => id === selectedArticleId)
    ?? selectedCategory?.articles[0]
    ?? null;
  const searchResults = useMemo(() => buildSearchResults(data, deferredSearchQuery), [data, deferredSearchQuery]);

  function selectCategory(category: KnowledgeCategory) {
    const staying = selectedCategoryId === category.id;
    setSelectedCategoryId(category.id);
    if (!staying) setSelectedArticleId(category.articles[0]?.id ?? null);
    setSearchQuery("");
  }

  function selectArticle(category: KnowledgeCategory, article: KnowledgeArticle) {
    setSelectedCategoryId(category.id);
    setSelectedArticleId(article.id);
    setSearchQuery("");
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 960px)").matches) {
        contentRef.current?.scrollIntoView({ block: "start" });
      }
      contentRef.current?.focus({ preventScroll: true });
    });
  }

  function applyMutation(
    operation: () => Promise<Awaited<ReturnType<typeof createKnowledgeCategoryAction>>>,
    successMessage: string,
  ) {
    setFeedback(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }

      setData(result.data.data);
      const nextCategoryId = result.data.selectedCategoryId
        ?? result.data.data.categories.find(({ id }) => id === selectedCategoryId)?.id
        ?? result.data.data.categories[0]?.id
        ?? null;
      const nextCategory = result.data.data.categories.find(({ id }) => id === nextCategoryId) ?? null;
      const nextArticleId = result.data.selectedArticleId
        ?? nextCategory?.articles.find(({ id }) => id === selectedArticleId)?.id
        ?? nextCategory?.articles[0]?.id
        ?? null;
      setSelectedCategoryId(nextCategoryId);
      setSelectedArticleId(nextArticleId);
      setCategoryDialog(null);
      setArticleDialog(null);
      setDeleteTarget(null);
      setFeedback({ tone: "success", text: successMessage });
    });
  }

  function reorderById<T extends { id: string }>(items: T[], fromId: string, toId: string) {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function beginDrag(event: DragEvent<HTMLElement>, kind: "category" | "article", id: string) {
    dragRef.current = { kind, id };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${kind}:${id}`);
    const row = event.currentTarget.closest("[data-drag-row]");
    if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 20, 18);
  }

  function allowDrop(event: DragEvent<HTMLElement>, kind: "category" | "article", id: string) {
    if (dragRef.current?.kind !== kind) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(id);
  }

  function finishDrag() {
    dragRef.current = null;
    setDropTargetId(null);
  }

  function dropCategory(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const drag = dragRef.current;
    finishDrag();
    if (!drag || drag.kind !== "category" || drag.id === targetId) return;
    const next = reorderById(data.categories, drag.id, targetId);
    if (!next) return;
    const previous = data;
    setData({ ...data, categories: next });
    startTransition(async () => {
      const result = await reorderKnowledgeCategoriesAction(next.map((category) => category.id));
      if (!result.ok) {
        setData(previous);
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      setData(result.data.data);
    });
  }

  function dropArticle(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const drag = dragRef.current;
    finishDrag();
    if (!selectedCategory || !drag || drag.kind !== "article" || drag.id === targetId) return;
    const nextArticles = reorderById(selectedCategory.articles, drag.id, targetId);
    if (!nextArticles) return;
    const previous = data;
    setData({
      ...data,
      categories: data.categories.map((category) => category.id === selectedCategory.id ? { ...category, articles: nextArticles } : category),
    });
    startTransition(async () => {
      const result = await reorderKnowledgeArticlesAction(selectedCategory.id, nextArticles.map((article) => article.id));
      if (!result.ok) {
        setData(previous);
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      setData(result.data.data);
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "category") {
      applyMutation(() => deleteKnowledgeCategoryAction(deleteTarget.id), "Kateqoriya silindi.");
      return;
    }
    applyMutation(() => deleteKnowledgeArticleAction(deleteTarget.id), "Məqalə silindi.");
  }

  return (
    <div className="knowledge-page">
      <header className="knowledge-header">
        <div>
          <h1>Qaydalar</h1>
          <p>Şirkət qaydaları və daxili məlumatlar</p>
        </div>
        {canEdit ? (
          <div className="knowledge-header-actions">
            <button className="knowledge-button is-secondary" type="button" onClick={() => setCategoryDialog({ mode: "create" })}>
              <FolderPlus size={16} /> Kateqoriya
            </button>
            <button
              className="knowledge-button is-primary"
              type="button"
              disabled={!selectedCategory}
              onClick={() => selectedCategory && setArticleDialog({ mode: "create", categoryId: selectedCategory.id })}
            >
              <FilePlus2 size={16} /> Məqalə
            </button>
          </div>
        ) : null}
      </header>

      <div className="knowledge-search-wrap">
        <Search size={18} aria-hidden="true" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Kateqoriya, məqalə və ya mətn daxilində axtar…"
          aria-label="Qaydalar bölməsində axtar"
        />
        {searchQuery ? (
          <button type="button" aria-label="Axtarışı təmizlə" onClick={() => setSearchQuery("")}><X size={16} /></button>
        ) : null}

        {searchQuery.trim() ? (
          <div className="knowledge-search-results" role="listbox" aria-label="Axtarış nəticələri">
            <div className="knowledge-search-results-head">
              <span>{searchResults.length} nəticə</span>
              <small>Yalnız görə bildiyiniz məzmun</small>
            </div>
            {searchResults.length ? searchResults.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => result.article ? selectArticle(result.category, result.article) : selectCategory(result.category)}
              >
                {result.type === "category" ? <FolderOpen size={16} /> : <BookOpenText size={16} />}
                <span>
                  <strong>{result.label}</strong>
                  <small>Qaydalar <ChevronRight size={11} /> {result.category.name}{result.article ? <><ChevronRight size={11} /> {result.article.title}</> : null}</small>
                </span>
              </button>
            )) : (
              <div className="knowledge-search-empty">Bu sorğuya uyğun nəticə tapılmadı.</div>
            )}
          </div>
        ) : null}
      </div>

      {feedback ? (
        <div className={cx("knowledge-feedback", `is-${feedback.tone}`)} role="status">
          {feedback.tone === "success" ? <Check size={15} /> : null}
          <span>{feedback.text}</span>
          <button type="button" aria-label="Bildirişi bağla" onClick={() => setFeedback(null)}><X size={14} /></button>
        </div>
      ) : null}

      {data.categories.length ? (
        <div className="knowledge-reader">
          <div className="knowledge-tabs-bar">
            <div className="knowledge-tabs" role="tablist" aria-label="Kateqoriyalar">
              {data.categories.map((category) => {
                const active = selectedCategory?.id === category.id;
                return (
                  <div
                    key={category.id}
                    className={cx("knowledge-choice", active && "is-active", dropTargetId === category.id && "is-drop")}
                    data-drag-row
                    onDragOver={canEdit ? (event) => allowDrop(event, "category", category.id) : undefined}
                    onDrop={canEdit ? (event) => dropCategory(event, category.id) : undefined}
                  >
                    {canEdit ? (
                      <span
                        className="knowledge-grip"
                        draggable
                        title="Sürüşdürərək sıranı dəyiş"
                        aria-label={`${category.name} sırasını dəyiş`}
                        onDragStart={(event) => beginDrag(event, "category", category.id)}
                        onDragEnd={finishDrag}
                      >
                        <GripVertical size={14} />
                      </span>
                    ) : null}
                    <button type="button" role="tab" aria-selected={active} onClick={() => selectCategory(category)}>
                      {category.name}
                      {category.status === "DRAFT" ? <span className="knowledge-draft-dot" title="Draft" /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
            {canEdit && selectedCategory ? (
              <div className="knowledge-choice-tools">
                <button type="button" aria-label="Kateqoriyanı redaktə et" onClick={() => setCategoryDialog({ mode: "edit", category: selectedCategory })}><Pencil size={14} /></button>
              </div>
            ) : null}
          </div>

          <div className="knowledge-stage">
            {selectedCategory ? (
              <aside className="knowledge-article-choices" aria-label="Məqalələr">
                {selectedCategory.articles.length ? selectedCategory.articles.map((article) => {
                  const articleActive = selectedArticle?.id === article.id;
                  return (
                    <div
                      key={article.id}
                      className={cx("knowledge-article-row", articleActive && "is-active", dropTargetId === article.id && "is-drop")}
                      data-drag-row
                      onDragOver={canEdit ? (event) => allowDrop(event, "article", article.id) : undefined}
                      onDrop={canEdit ? (event) => dropArticle(event, article.id) : undefined}
                    >
                      {canEdit ? (
                        <span
                          className="knowledge-grip"
                          draggable
                          title="Sürüşdürərək sıranı dəyiş"
                          aria-label={`${article.title} sırasını dəyiş`}
                          onDragStart={(event) => beginDrag(event, "article", article.id)}
                          onDragEnd={finishDrag}
                        >
                          <GripVertical size={14} />
                        </span>
                      ) : null}
                      <button type="button" aria-pressed={articleActive} onClick={() => selectArticle(selectedCategory, article)}>
                        <span>{article.title}</span>
                        {article.status === "DRAFT" ? <span className="knowledge-draft-dot" title="Draft" /> : null}
                      </button>
                    </div>
                  );
                }) : (
                  <p className="knowledge-picker-empty">Bu kateqoriyada məqalə yoxdur.</p>
                )}
              </aside>
            ) : null}

            <main className="knowledge-content" ref={contentRef} tabIndex={-1} aria-label="Məqalə məzmunu">
            {selectedArticle && selectedCategory ? (
              <article className="knowledge-article">
                <header>
                  <div>
                    <p className="knowledge-kicker">{selectedCategory.name}</p>
                    <div className="knowledge-title-row">
                      <h2>{selectedArticle.title}</h2>
                      {selectedArticle.status === "DRAFT" ? <StatusBadge status={selectedArticle.status} /> : null}
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="knowledge-article-actions">
                      <button type="button" aria-label="Məqaləni redaktə et" title="Redaktə et" onClick={() => setArticleDialog({ mode: "edit", article: selectedArticle })}><Pencil size={15} /></button>
                      <button className="is-danger" type="button" aria-label="Məqaləni sil" title="Sil" onClick={() => setDeleteTarget({ type: "article", id: selectedArticle.id, name: selectedArticle.title })}><Trash2 size={15} /></button>
                    </div>
                  ) : null}
                </header>
                  <KnowledgeRichTextViewer key={selectedArticle.id} value={selectedArticle.content} />
                  <footer>
                    <span><Clock3 size={14} /> Son yenilənmə: {formatUpdatedAt(selectedArticle.updatedAt)}</span>
                    <span><UserRound size={14} /> {selectedArticle.updatedBy ?? "Sistem"}</span>
                  </footer>
                </article>
            ) : selectedCategory ? (
              <EmptyArticleState canEdit={canEdit} category={selectedCategory} onCreate={() => setArticleDialog({ mode: "create", categoryId: selectedCategory.id })} />
            ) : null}
            </main>
          </div>
        </div>
      ) : (
        <EmptyKnowledgeState canEdit={canEdit} onCreate={() => setCategoryDialog({ mode: "create" })} />
      )}

      {categoryDialog ? (
        <KnowledgePortal>
          <CategoryDialogView
            dialog={categoryDialog}
            employeeOptions={data.employeeOptions}
            isPending={isPending}
            onClose={() => setCategoryDialog(null)}
            onDelete={(category) => setDeleteTarget({ type: "category", id: category.id, name: category.name })}
            onSubmit={(formData) => applyMutation(
              () => categoryDialog.mode === "create"
                ? createKnowledgeCategoryAction(formData)
                : updateKnowledgeCategoryAction(formData),
              categoryDialog.mode === "create" ? "Kateqoriya yaradıldı." : "Kateqoriya yeniləndi.",
            )}
          />
        </KnowledgePortal>
      ) : null}

      {articleDialog ? (
        <KnowledgePortal>
          <ArticleDialogView
            key={articleDialog.mode === "edit" ? articleDialog.article.id : `new-${articleDialog.categoryId}`}
            dialog={articleDialog}
            employeeOptions={data.employeeOptions}
            categories={data.categories}
            isPending={isPending}
            onClose={() => setArticleDialog(null)}
            onSubmit={(formData) => applyMutation(
              () => articleDialog.mode === "create"
                ? createKnowledgeArticleAction(formData)
                : updateKnowledgeArticleAction(formData),
              articleDialog.mode === "create" ? "Məqalə yaradıldı." : "Məqalə yeniləndi.",
            )}
          />
        </KnowledgePortal>
      ) : null}

      {deleteTarget ? (
        <KnowledgePortal>
          <DeleteDialog target={deleteTarget} isPending={isPending} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
        </KnowledgePortal>
      ) : null}
    </div>
  );
}

function KnowledgePortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(<div className="knowledge-portal-theme">{children}</div>, document.body);
}

function CategoryDialogView({
  dialog,
  employeeOptions,
  isPending,
  onClose,
  onDelete,
  onSubmit,
}: {
  dialog: CategoryDialog;
  employeeOptions: CompanyKnowledgeData["employeeOptions"];
  isPending: boolean;
  onClose: () => void;
  onDelete: (category: KnowledgeCategory) => void;
  onSubmit: (formData: FormData) => void;
}) {
  const category = dialog.mode === "edit" ? dialog.category : null;
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(category?.audienceEmployeeIds ?? []);
  const isForEveryone = selectedEmployeeIds.length === 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div className="knowledge-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="knowledge-dialog is-category" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title">
        <header>
          <span><FolderPlus size={19} /></span>
          <div><h2 id="category-dialog-title">{category ? "Kateqoriyanı redaktə et" : "Yeni kateqoriya"}</h2><p>Kateqoriya daxilində istənilən sayda məqalə yarada bilərsiniz.</p></div>
          <button type="button" aria-label="Pəncərəni bağla" onClick={onClose}><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          {category ? <input type="hidden" name="id" value={category.id} /> : null}
          <label className="knowledge-field"><span>Kateqoriya adı</span><input name="name" defaultValue={category?.name ?? ""} minLength={2} maxLength={120} required autoFocus /></label>
          <StatusField defaultValue={category?.status ?? "PUBLISHED"} />
          <fieldset className="knowledge-audience-field">
            <legend>Kimlər görə bilər?</legend>
            <label className="knowledge-audience-all"><input type="checkbox" checked={isForEveryone} onChange={() => setSelectedEmployeeIds([])} /><span><strong>Bütün əməkdaşlar</strong><small>Heç kim seçilmədikdə kateqoriya hamıya açıqdır.</small></span></label>
            <div className="knowledge-audience-list">
              {employeeOptions.map((employee) => {
                const checked = selectedEmployeeIds.includes(employee.id);
                return <label key={employee.id}><input type="checkbox" name="employeeIds" value={employee.id} checked={checked} onChange={() => setSelectedEmployeeIds((current) => checked ? current.filter((id) => id !== employee.id) : [...current, employee.id])} /><UserRound size={14} /><span><strong>{employee.name}</strong><small>{employee.department} · {employee.position}</small></span></label>;
              })}
            </div>
          </fieldset>
          <footer>
            {category ? <button className="knowledge-dialog-delete" type="button" onClick={() => onDelete(category)}><Trash2 size={15} /> Sil</button> : <span />}
            <button type="button" onClick={onClose}>Ləğv et</button>
            <button className="is-primary" type="submit" disabled={isPending}>{isPending ? <LoaderCircle className="knowledge-spin" size={16} /> : <Check size={16} />} Yadda saxla</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ArticleDialogView({
  dialog,
  categories,
  employeeOptions,
  isPending,
  onClose,
  onSubmit,
}: {
  dialog: ArticleDialog;
  categories: KnowledgeCategory[];
  employeeOptions: CompanyKnowledgeData["employeeOptions"];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const article = dialog.mode === "edit" ? dialog.article : null;
  const [inheritAudience, setInheritAudience] = useState(article?.inheritAudience ?? true);
  const [employeeIds, setEmployeeIds] = useState(article?.audienceEmployeeIds ?? []);
  const initialCategoryId = article?.categoryId ?? (dialog.mode === "create" ? dialog.categoryId : categories[0]?.id ?? "");
  const [content, setContent] = useState(JSON.stringify(article?.content ?? emptyKnowledgeDocument));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("content", content);
    onSubmit(formData);
  }

  return (
    <div className="knowledge-dialog-backdrop" role="presentation">
      <section className="knowledge-dialog is-article" role="dialog" aria-modal="true" aria-labelledby="article-dialog-title">
        <header>
          <span><FilePlus2 size={19} /></span>
          <div><h2 id="article-dialog-title">{article ? "Məqaləni redaktə et" : "Yeni məqalə"}</h2><p>Məzmunu canlı səhifə kimi formatlayın və uyğun statusu seçin.</p></div>
          <button type="button" aria-label="Pəncərəni bağla" onClick={onClose}><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          {article ? <input type="hidden" name="id" value={article.id} /> : null}
          <div className="knowledge-dialog-form-grid">
            <label className="knowledge-field"><span>Başlıq</span><input name="title" defaultValue={article?.title ?? ""} minLength={2} maxLength={180} required autoFocus /></label>
            <label className="knowledge-field"><span>Kateqoriya</span><select name="categoryId" defaultValue={initialCategoryId} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
          <div className="knowledge-editor-field"><span>Məqalə mətni</span><KnowledgeRichTextEditor value={article?.content ?? emptyKnowledgeDocument} onChange={setContent} /></div>
          <StatusField defaultValue={article?.status ?? "DRAFT"} />
          <fieldset className="knowledge-audience-field">
            <legend>Bu qaydanı kimlər görə bilər?</legend>
            <input type="hidden" name="inheritAudience" value={String(inheritAudience)} />
            <label className="knowledge-audience-all"><input type="checkbox" checked={inheritAudience} onChange={(event) => setInheritAudience(event.currentTarget.checked)} /><span>Kateqoriyanın icazələrini tətbiq et</span></label>
            {!inheritAudience ? <div className="knowledge-audience-list">
              {employeeOptions.map((employee) => <label key={employee.id}><input type="checkbox" name="employeeIds" value={employee.id} checked={employeeIds.includes(employee.id)} onChange={(event) => setEmployeeIds((ids) => event.target.checked ? [...ids, employee.id] : ids.filter((id) => id !== employee.id))} /><span><strong>{employee.name}</strong><small>{employee.department} · {employee.position}</small></span></label>)}
              {employeeIds.length === 0 ? <p role="alert">Ən azı bir əməkdaş seçin.</p> : null}
            </div> : null}
          </fieldset>
          <footer>
            <span />
            <button type="button" onClick={onClose}>Ləğv et</button>
            <button className="is-primary" type="submit" disabled={isPending || (!inheritAudience && employeeIds.length === 0)}>{isPending ? <LoaderCircle className="knowledge-spin" size={16} /> : <Check size={16} />} Yadda saxla</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function StatusField({ defaultValue }: { defaultValue: KnowledgeStatus }) {
  return (
    <fieldset className="knowledge-status-field">
      <legend>Status</legend>
      <label><input type="radio" name="status" value="DRAFT" defaultChecked={defaultValue === "DRAFT"} /><span><strong>Draft</strong><small>Yalnız adminlər görür</small></span></label>
      <label><input type="radio" name="status" value="PUBLISHED" defaultChecked={defaultValue === "PUBLISHED"} /><span><strong>Published</strong><small>Görünmə icazəsi olan əməkdaşlar görür</small></span></label>
    </fieldset>
  );
}

function DeleteDialog({ target, isPending, onCancel, onConfirm }: { target: DeleteTarget; isPending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="knowledge-dialog-backdrop is-confirm" role="presentation">
      <section className="knowledge-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title">
        <span><Trash2 size={20} /></span>
        <h2 id="delete-dialog-title">{target.type === "category" ? "Kateqoriya silinsin?" : "Məqalə silinsin?"}</h2>
        <p><strong>“{target.name}”</strong> geri qaytarılmadan silinəcək.{target.type === "category" ? " Daxilindəki bütün məqalələr də silinəcək." : ""}</p>
        <div><button type="button" onClick={onCancel}>Ləğv et</button><button type="button" disabled={isPending} onClick={onConfirm}>{isPending ? <LoaderCircle className="knowledge-spin" size={15} /> : <Trash2 size={15} />} Sil</button></div>
      </section>
    </div>
  );
}

function EmptyKnowledgeState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <section className="knowledge-empty-state">
      <span><FolderOpen size={28} /></span>
      <h2>{canEdit ? "İlk kateqoriyanı yaradın" : "Məzmun hələ yayımlanmayıb"}</h2>
      <p>{canEdit ? "“Qaydalar” bilik bazasını kateqoriya və məqalələrlə qurmağa başlayın." : "Yeni şirkət qaydaları yayımlandıqda burada görünəcək."}</p>
      {canEdit ? <button className="knowledge-button is-primary" type="button" onClick={onCreate}><FolderPlus size={16} /> Kateqoriya yarat</button> : null}
    </section>
  );
}

function EmptyArticleState({ canEdit, category, onCreate }: { canEdit: boolean; category: KnowledgeCategory; onCreate: () => void }) {
  return (
    <section className="knowledge-empty-state is-inline">
      <span><BookOpenText size={26} /></span>
      <h2>“{category.name}” kateqoriyası boşdur</h2>
      <p>{canEdit ? "Bu kateqoriyaya ilk məqaləni əlavə edin." : "Bu kateqoriyada yayımlanmış məqalə yoxdur."}</p>
      {canEdit ? <button className="knowledge-button is-primary" type="button" onClick={onCreate}><FilePlus2 size={16} /> Məqalə yarat</button> : null}
    </section>
  );
}

function StatusBadge({ status }: { status: KnowledgeStatus }) {
  return <span className={cx("knowledge-status-badge", status === "PUBLISHED" ? "is-published" : "is-draft")}>{status === "PUBLISHED" ? "Published" : "Draft"}</span>;
}

function buildSearchResults(data: CompanyKnowledgeData, query: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];
  const results: Array<{ type: "category" | "article"; id: string; label: string; category: KnowledgeCategory; article?: KnowledgeArticle }> = [];

  for (const category of data.categories) {
    const categoryMatch = normalizeSearch(category.name).includes(normalizedQuery);
    if (categoryMatch) results.push({ type: "category", id: category.id, label: category.name, category });
    for (const article of category.articles) {
      if (categoryMatch || normalizeSearch(`${article.title} ${article.plainText}`).includes(normalizedQuery)) {
        results.push({ type: "article", id: article.id, label: article.title, category, article });
      }
    }
  }

  return results.slice(0, 30);
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase("az-AZ").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
}

function formatUpdatedAt(value: string) {
  const bakuDate = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1_000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(bakuDate.getUTCDate())}.${pad(bakuDate.getUTCMonth() + 1)}.${bakuDate.getUTCFullYear()}, ${pad(bakuDate.getUTCHours())}:${pad(bakuDate.getUTCMinutes())}`;
}
