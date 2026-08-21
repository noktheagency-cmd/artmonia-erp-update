"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { type FormEvent, type ReactNode, useDeferredValue, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui/cx";
import {
  createKnowledgeArticleAction,
  createKnowledgeCategoryAction,
  deleteKnowledgeArticleAction,
  deleteKnowledgeCategoryAction,
  moveKnowledgeArticleAction,
  moveKnowledgeCategoryAction,
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
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(initialData.categories[0]?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");
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
    setSelectedCategoryId(category.id);
    setSelectedArticleId(category.articles[0]?.id ?? null);
    setExpandedCategoryId(category.id);
    setSearchQuery("");
  }

  function selectArticle(category: KnowledgeCategory, article: KnowledgeArticle) {
    setSelectedCategoryId(category.id);
    setSelectedArticleId(article.id);
    setExpandedCategoryId(category.id);
    setSearchQuery("");
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
      setExpandedCategoryId(nextCategoryId);
      setCategoryDialog(null);
      setArticleDialog(null);
      setDeleteTarget(null);
      setFeedback({ tone: "success", text: successMessage });
    });
  }

  function moveCategory(categoryId: string, direction: "up" | "down") {
    applyMutation(() => moveKnowledgeCategoryAction(categoryId, direction), "Kateqoriya sıralaması yeniləndi.");
  }

  function moveArticle(articleId: string, direction: "up" | "down") {
    applyMutation(() => moveKnowledgeArticleAction(articleId, direction), "Məqalə sıralaması yeniləndi.");
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
          <span className="knowledge-header-icon" aria-hidden="true"><BookOpenText size={22} /></span>
          <div>
            <p>Daxili bilik bazası</p>
            <h1>Biz Kimik</h1>
            <span>Şirkət haqqında ortaq məlumatları kateqoriyalar üzrə kəşf edin.</span>
          </div>
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
          aria-label="Biz Kimik bölməsində axtar"
        />
        {searchQuery ? (
          <button type="button" aria-label="Axtarışı təmizlə" onClick={() => setSearchQuery("")}><X size={16} /></button>
        ) : <kbd>⌘ K</kbd>}

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
                  <small>Biz Kimik <ChevronRight size={11} /> {result.category.name}{result.article ? <><ChevronRight size={11} /> {result.article.title}</> : null}</small>
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
        <div className="knowledge-layout">
          <aside className="knowledge-library" aria-label="Biz Kimik kateqoriyaları">
            <div className="knowledge-library-heading">
              <span>Kateqoriyalar</span>
              <small>{data.categories.length}</small>
            </div>
            <div className="knowledge-category-list">
              {data.categories.map((category, categoryIndex) => {
                const expanded = expandedCategoryId === category.id;
                const active = selectedCategory?.id === category.id;
                return (
                  <section className={cx("knowledge-category", active && "is-active")} key={category.id}>
                    <div className="knowledge-category-row">
                      <button
                        className="knowledge-category-select"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => {
                          setExpandedCategoryId(expanded ? null : category.id);
                          if (!active) selectCategory(category);
                        }}
                      >
                        <span className="knowledge-folder-icon"><FolderOpen size={16} /></span>
                        <span><strong>{category.name}</strong><small>{category.articles.length} məqalə</small></span>
                        {category.status === "DRAFT" ? <StatusBadge status="DRAFT" /> : null}
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      {canEdit ? (
                        <div className="knowledge-row-actions">
                          <button type="button" disabled={categoryIndex === 0 || isPending} aria-label="Kateqoriyanı yuxarı daşı" onClick={() => moveCategory(category.id, "up")}><ArrowUp size={13} /></button>
                          <button type="button" disabled={categoryIndex === data.categories.length - 1 || isPending} aria-label="Kateqoriyanı aşağı daşı" onClick={() => moveCategory(category.id, "down")}><ArrowDown size={13} /></button>
                          <button type="button" aria-label="Kateqoriyanı redaktə et" onClick={() => setCategoryDialog({ mode: "edit", category })}><Pencil size={13} /></button>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? (
                      <div className="knowledge-article-list">
                        {category.articles.map((article) => (
                          <button
                            type="button"
                            key={article.id}
                            className={cx(selectedArticle?.id === article.id && "is-active")}
                            onClick={() => selectArticle(category, article)}
                          >
                            <BookOpenText size={14} />
                            <span>{article.title}</span>
                            {article.status === "DRAFT" ? <i>Draft</i> : null}
                            <ChevronRight size={13} />
                          </button>
                        ))}
                        {!category.articles.length ? <p>Bu kateqoriyada məqalə yoxdur.</p> : null}
                        {canEdit ? (
                          <button className="knowledge-add-article-inline" type="button" onClick={() => setArticleDialog({ mode: "create", categoryId: category.id })}>
                            <Plus size={14} /> Yeni məqalə
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </aside>

          <main className="knowledge-content">
            {selectedArticle && selectedCategory ? (
              <>
                <nav className="knowledge-breadcrumb" aria-label="Breadcrumb">
                  <span>Biz Kimik</span><ChevronRight size={13} />
                  <button type="button" onClick={() => selectCategory(selectedCategory)}>{selectedCategory.name}</button><ChevronRight size={13} />
                  <strong>{selectedArticle.title}</strong>
                </nav>
                <article className="knowledge-article">
                  <header>
                    <div>
                      <StatusBadge status={selectedArticle.status} />
                      <h2>{selectedArticle.title}</h2>
                    </div>
                    {canEdit ? (
                      <div className="knowledge-article-actions">
                        <button type="button" disabled={selectedCategory.articles[0]?.id === selectedArticle.id || isPending} aria-label="Məqaləni yuxarı daşı" title="Yuxarı daşı" onClick={() => moveArticle(selectedArticle.id, "up")}><ArrowUp size={15} /></button>
                        <button type="button" disabled={selectedCategory.articles.at(-1)?.id === selectedArticle.id || isPending} aria-label="Məqaləni aşağı daşı" title="Aşağı daşı" onClick={() => moveArticle(selectedArticle.id, "down")}><ArrowDown size={15} /></button>
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
              </>
            ) : selectedCategory ? (
              <EmptyArticleState canEdit={canEdit} category={selectedCategory} onCreate={() => setArticleDialog({ mode: "create", categoryId: selectedCategory.id })} />
            ) : null}
          </main>
        </div>
      ) : (
        <EmptyKnowledgeState canEdit={canEdit} onCreate={() => setCategoryDialog({ mode: "create" })} />
      )}

      {categoryDialog ? (
        <KnowledgePortal>
          <CategoryDialogView
            dialog={categoryDialog}
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
  isPending,
  onClose,
  onDelete,
  onSubmit,
}: {
  dialog: CategoryDialog;
  isPending: boolean;
  onClose: () => void;
  onDelete: (category: KnowledgeCategory) => void;
  onSubmit: (formData: FormData) => void;
}) {
  const category = dialog.mode === "edit" ? dialog.category : null;

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
  isPending,
  onClose,
  onSubmit,
}: {
  dialog: ArticleDialog;
  categories: KnowledgeCategory[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const article = dialog.mode === "edit" ? dialog.article : null;
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
          <footer>
            <span />
            <button type="button" onClick={onClose}>Ləğv et</button>
            <button className="is-primary" type="submit" disabled={isPending}>{isPending ? <LoaderCircle className="knowledge-spin" size={16} /> : <Check size={16} />} Yadda saxla</button>
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
      <label><input type="radio" name="status" value="PUBLISHED" defaultChecked={defaultValue === "PUBLISHED"} /><span><strong>Published</strong><small>Bütün əməkdaşlar görür</small></span></label>
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
      <p>{canEdit ? "“Biz Kimik” bilik bazasını kateqoriya və məqalələrlə qurmağa başlayın." : "Yeni şirkət məlumatları yayımlandıqda burada görünəcək."}</p>
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
