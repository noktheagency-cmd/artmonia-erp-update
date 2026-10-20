"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Command,
  GraduationCap,
  ListTodo,
  LoaderCircle,
  Search,
  Sparkles,
  UserRoundSearch,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type {
  GlobalSearchItem,
  GlobalSearchKind,
  GlobalSearchResponse,
} from "@/modules/search/global-search";
import { cx } from "@/components/ui/cx";

export type GlobalSearchNavigationItem = {
  href: string;
  label: string;
  section: "İş axını" | "Resurslar";
};

type NavigationSearchItem = Omit<GlobalSearchItem, "kind"> & { kind: "navigation" };
type DisplaySearchItem = GlobalSearchItem | NavigationSearchItem;
type RequestState = "idle" | "loading" | "ready" | "error";

const recentStorageKey = "artmonia:global-search:recent:v2";
const legacyRecentStorageKey = "artmonia:global-search:recent:v1";
const kindLabels: Record<GlobalSearchKind, string> = {
  student: "Tələbələr",
  lead: "CRM müraciətləri",
  employee: "Əməkdaşlar",
  task: "Tasklar",
  slot: "Slotlar",
  workshop: "Workshoplar",
};

export function GlobalSearch({
  navigationItems,
  onNavigate,
}: {
  navigationItems: GlobalSearchNavigationItem[];
  onNavigate: (href: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, GlobalSearchItem[]>());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [remoteItems, setRemoteItems] = useState<GlobalSearchItem[]>([]);
  const [recentItems, setRecentItems] = useState<DisplaySearchItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmedQuery = query.replace(/\s+/g, " ").trim();
  const normalizedQuery = normalizeText(trimmedQuery);

  const navigationSearchItems = useMemo(
    () => navigationItems.map(toNavigationSearchItem),
    [navigationItems],
  );

  const matchingNavigationItems = useMemo(() => {
    if (!normalizedQuery) {
      return navigationSearchItems.slice(0, 6);
    }

    return navigationSearchItems.filter((item) =>
      normalizeText(`${item.title} ${item.meta}`).includes(normalizedQuery),
    );
  }, [navigationSearchItems, normalizedQuery]);

  const sections = useMemo(() => {
    if (!trimmedQuery) {
      const visibleRecentItems = recentItems.slice(0, 4);
      const recentKeys = new Set(visibleRecentItems.map(itemKey));
      return [
        ...(visibleRecentItems.length > 0
          ? [{ label: "Son açılanlar", items: visibleRecentItems }]
          : []),
        {
          label: "Sürətli keçidlər",
          items: matchingNavigationItems.filter((item) => !recentKeys.has(itemKey(item))),
        },
      ];
    }

    const groupedRemoteItems = Object.entries(kindLabels).flatMap(([kind, label]) => {
      const items = remoteItems.filter((item) => item.kind === kind);
      return items.length > 0 ? [{ label, items }] : [];
    });

    return [
      ...(matchingNavigationItems.length > 0
        ? [{ label: "Bölmələr", items: matchingNavigationItems }]
        : []),
      ...groupedRemoteItems,
    ];
  }, [matchingNavigationItems, recentItems, remoteItems, trimmedQuery]);

  const flatItems = useMemo(
    () => dedupeItems(sections.flatMap((section) => section.items)),
    [sections],
  );
  const resolvedActiveIndex = flatItems.length
    ? Math.min(activeIndex, flatItems.length - 1)
    : 0;
  const hasRemoteQuery = trimmedQuery.length >= 2;
  const showNoResults =
    hasRemoteQuery && requestState === "ready" && flatItems.length === 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRecentItems(readRecentItems()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOpen(false);
      setQuery("");
      setRemoteItems([]);
      setRequestState("idle");
      setActiveIndex(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    function handleGlobalShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        return;
      }

      if (event.key === "/" && !isTypingTarget && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }

    function handleOutsidePointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleGlobalShortcut);
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => {
      window.removeEventListener("keydown", handleGlobalShortcut);
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, []);

  useEffect(() => {
    if (!hasRemoteQuery) {
      return;
    }

    const cacheKey = normalizeText(trimmedQuery);
    const cachedItems = cacheRef.current.get(cacheKey);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (cachedItems) {
        setRemoteItems(cachedItems);
        setRequestState("ready");
        setActiveIndex(0);
        return;
      }

      setRequestState("loading");

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload = (await response.json()) as GlobalSearchResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Axtarış tamamlana bilmədi.");
        }

        rememberCacheEntry(cacheRef.current, cacheKey, payload.items);
        setRemoteItems(payload.items);
        setRequestState("ready");
        setActiveIndex(0);
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setRemoteItems([]);
        setRequestState("error");
      }
    }, cachedItems ? 0 : 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasRemoteQuery, trimmedQuery]);

  useEffect(() => {
    const activeElement = listRef.current?.querySelector<HTMLElement>("[data-search-active='true']");
    const list = listRef.current;
    if (!activeElement || !list) return;
    const itemBounds = activeElement.getBoundingClientRect();
    const listBounds = list.getBoundingClientRect();
    if (itemBounds.top < listBounds.top) {
      list.scrollTop += itemBounds.top - listBounds.top;
    } else if (itemBounds.bottom > listBounds.bottom) {
      list.scrollTop += itemBounds.bottom - listBounds.bottom;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const updateAvailableHeight = () => {
      const box = root.getBoundingClientRect();
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const top = box.bottom + 9;
      root.style.setProperty("--search-available-height", `${Math.max(180, bottom - top - 16)}px`);
      root.style.setProperty("--search-panel-top", `${top}px`);
      root.style.setProperty("--search-panel-left", `${box.left}px`);
      root.style.setProperty("--search-panel-width", `${Math.max(box.width, 320)}px`);
    };
    updateAvailableHeight();
    window.addEventListener("resize", updateAvailableHeight);
    window.addEventListener("scroll", updateAvailableHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", updateAvailableHeight);
    window.visualViewport?.addEventListener("scroll", updateAvailableHeight);
    return () => {
      window.removeEventListener("resize", updateAvailableHeight);
      window.removeEventListener("scroll", updateAvailableHeight);
      window.visualViewport?.removeEventListener("resize", updateAvailableHeight);
      window.visualViewport?.removeEventListener("scroll", updateAvailableHeight);
    };
  }, [open]);

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (flatItems.length ? (current + 1) % flatItems.length : 0));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (flatItems.length ? (current - 1 + flatItems.length) % flatItems.length : 0));
      return;
    }

    if (event.key === "Enter" && open && flatItems[resolvedActiveIndex]) {
      event.preventDefault();
      const selectedItem = flatItems[resolvedActiveIndex];
      onNavigate(selectedItem.href);
      router.push(selectedItem.href as Route);
      selectItem(selectedItem);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleItemClick(item: DisplaySearchItem, event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    selectItem(item);
    onNavigate(item.href);
  }

  function selectItem(item: DisplaySearchItem) {
    inputRef.current?.blur();
    const nextRecentItems = [
      item,
      ...recentItems.filter((recent) => itemKey(recent) !== itemKey(item)),
    ].slice(0, 6);
    setRecentItems(nextRecentItems);
    writeRecentItems(nextRecentItems);
    setOpen(false);
    setQuery("");
    setRemoteItems([]);
    setRequestState("idle");
    setActiveIndex(0);
  }

  let optionIndex = -1;

  return (
    <div
      ref={rootRef}
      className={cx("global-search", open && "is-open")}
      data-state={requestState}
    >
      <div className="global-search-control">
        <span className="global-search-leading" aria-hidden="true">
          {requestState === "loading" ? <LoaderCircle className="global-search-spinner" /> : <Search />}
        </span>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          role="combobox"
          aria-label="ERP üzrə ağıllı axtarış"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-activedescendant={open && flatItems[resolvedActiveIndex] ? `global-search-option-${resolvedActiveIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Tələbə, CRM, task, əməkdaş və ya workshop axtar..."
          onChange={(event) => {
            const nextQuery = event.target.value;
            const nextTrimmedQuery = nextQuery.replace(/\s+/g, " ").trim();
            setQuery(nextQuery);
            setOpen(true);
            setActiveIndex(0);
            if (nextTrimmedQuery.length < 2) {
              setRemoteItems([]);
              setRequestState("idle");
            } else {
              setRequestState("loading");
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
        />
        {query ? (
          <button
            className="global-search-clear"
            type="button"
            aria-label="Axtarışı təmizlə"
            onClick={() => {
              setQuery("");
              setRemoteItems([]);
              setRequestState("idle");
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
          >
            <X />
          </button>
        ) : (
          <kbd className="global-search-shortcut"><Command />K</kbd>
        )}
      </div>

      <div
        className="global-search-panel"
        data-visible={open}
        aria-hidden={!open}
      >
        <div className="global-search-panel-accent" aria-hidden="true" />
        <header className="global-search-panel-head">
          <span><Sparkles />Ağıllı axtarış</span>
          <small>{hasRemoteQuery ? "Canlı nəticələr" : "Yazmağa başlayın"}</small>
        </header>

        <button
          type="button"
          className="global-search-dismiss"
          aria-label="Axtarışı bağla"
          onClick={() => {
            setOpen(false);
            inputRef.current?.blur();
          }}
        >
          <X aria-hidden="true" />
        </button>

        <div
          ref={listRef}
          id="global-search-results"
          className="global-search-results"
          role="listbox"
          aria-label="Axtarış nəticələri"
        >
          {trimmedQuery.length === 1 ? (
            <SearchMessage icon={<UserRoundSearch />} title="Bir az da yazın">
              Məlumat bazasında axtarış üçün ən azı 2 simvol lazımdır.
            </SearchMessage>
          ) : null}

          {requestState === "loading" && remoteItems.length === 0 ? <SearchLoading /> : null}

          {sections.map((section) => {
            const uniqueSectionItems = dedupeItems(section.items);
            if (uniqueSectionItems.length === 0) return null;

            return (
              <section className="global-search-section" key={section.label}>
                <h2>{section.label}<span>{uniqueSectionItems.length}</span></h2>
                <div>
                  {uniqueSectionItems.map((item) => {
                    optionIndex += 1;
                    const currentIndex = optionIndex;
                    const Icon = iconForItem(item);

                    return (
                      <Link
                        id={`global-search-option-${currentIndex}`}
                        key={itemKey(item)}
                        href={item.href as Route}
                        className="global-search-result"
                        role="option"
                        aria-selected={resolvedActiveIndex === currentIndex}
                        data-search-active={resolvedActiveIndex === currentIndex}
                        onMouseEnter={() => setActiveIndex(currentIndex)}
                        onFocus={() => setActiveIndex(currentIndex)}
                        onClick={(event) => handleItemClick(item, event)}
                        prefetch={false}
                      >
                        <span className="global-search-result-icon" data-kind={item.kind} aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="global-search-result-copy">
                          <strong>{item.title}</strong>
                          <small>{item.subtitle}</small>
                          {item.meta ? <em>{item.meta}</em> : null}
                        </span>
                        <ArrowRight className="global-search-result-arrow" aria-hidden="true" />
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {showNoResults ? (
            <SearchMessage icon={<Search />} title="Nəticə tapılmadı">
              Ad, kod, telefon və ya açar sözü fərqli yazaraq yenidən yoxlayın.
            </SearchMessage>
          ) : null}

          {requestState === "error" ? (
            <SearchMessage icon={<Search />} title="Axtarışa qoşulmaq mümkün olmadı">
              Bir neçə saniyə sonra yenidən cəhd edin.
            </SearchMessage>
          ) : null}
        </div>

        <footer className="global-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> seçim</span>
          <span><kbd>Enter</kbd> aç</span>
          <span><kbd>Esc</kbd> bağla</span>
        </footer>
      </div>
    </div>
  );
}

function SearchLoading() {
  return (
    <div className="global-search-loading" aria-label="Axtarılır">
      {[0, 1, 2].map((item) => (
        <span key={item}><i /><b /><em /></span>
      ))}
    </div>
  );
}

function SearchMessage({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="global-search-message">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function toNavigationSearchItem(item: GlobalSearchNavigationItem): NavigationSearchItem {
  return {
    id: item.href,
    kind: "navigation",
    title: item.label,
    subtitle: "Bölməyə sürətli keçid",
    meta: item.section,
    href: item.href,
  };
}

function iconForItem(item: DisplaySearchItem) {
  if (item.kind === "navigation") {
    if (item.href.startsWith("/students")) return GraduationCap;
    if (item.href.startsWith("/crm")) return UsersRound;
    if (item.href.startsWith("/tasks")) return ListTodo;
    if (item.href.startsWith("/groups")) return CalendarDays;
    if (item.href.startsWith("/hr")) return BriefcaseBusiness;
    return ArrowRight;
  }

  return {
    student: GraduationCap,
    lead: UsersRound,
    employee: BriefcaseBusiness,
    task: ListTodo,
    slot: CalendarDays,
    workshop: Clock3,
  }[item.kind];
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("az")
    .replaceAll("ə", "e")
    .replaceAll("ğ", "g")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ş", "s")
    .replaceAll("ü", "u")
    .replaceAll("ç", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function itemKey(item: DisplaySearchItem) {
  return `${item.kind}:${item.id}`;
}

function dedupeItems(items: DisplaySearchItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rememberCacheEntry(cache: Map<string, GlobalSearchItem[]>, key: string, items: GlobalSearchItem[]) {
  if (cache.size >= 20) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, items);
}

function readRecentItems(): DisplaySearchItem[] {
  try {
    window.localStorage.removeItem(legacyRecentStorageKey);
    const value = window.localStorage.getItem(recentStorageKey);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isStoredSearchItem)
      .filter((item) => item.kind === "navigation")
      .slice(0, 6);
  } catch {
    return [];
  }
}

function writeRecentItems(items: DisplaySearchItem[]) {
  try {
    const safeItems = items.filter((item) => item.kind === "navigation").slice(0, 6);
    window.localStorage.setItem(recentStorageKey, JSON.stringify(safeItems));
  } catch {
    // Search remains fully usable when storage is disabled.
  }
}

function isStoredSearchItem(value: unknown): value is DisplaySearchItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DisplaySearchItem>;
  return (
    typeof item.id === "string" &&
    typeof item.kind === "string" &&
    [...Object.keys(kindLabels), "navigation"].includes(item.kind) &&
    typeof item.title === "string" &&
    typeof item.subtitle === "string" &&
    typeof item.meta === "string" &&
    typeof item.href === "string" &&
    item.href.startsWith("/")
  );
}
