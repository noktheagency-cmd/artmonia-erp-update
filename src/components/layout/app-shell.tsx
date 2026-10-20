"use client";

import { HeaderActionsContext } from "@/components/layout/header-actions-context";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Route } from "next";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BriefcaseBusiness,
  BookOpenText,
  Building2,
  CalendarDays,
  CreditCard,
  Gauge,
  GraduationCap,
  LogOut,
  Menu,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  Settings2,
  ShieldCheck,
  ListTodo,
  UsersRound,
  X,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import { TabGlide } from "@/components/ui/tab-glide";
import { FormInputGuards } from "@/components/ui/form-input-guards";
import { SessionHeartbeat } from "@/components/auth/session-heartbeat";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  GlobalSearch,
  type GlobalSearchNavigationItem,
} from "@/components/layout/global-search";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";

const ErpCalendar = dynamic(() =>
  import("@/components/layout/erp-calendar").then((module) => module.ErpCalendar),
);

type ShellUser = {
  id: string;
  fullName: string;
  email: string;
  profilePhotoUrl: string | null;
  roles: string[];
  permissions: string[];
};

type NavItem = {
  href: Route;
  label: string;
  icon: typeof Gauge;
  requiredPermissions: string[];
  requiredRoles?: string[];
};

type NotificationCounts = { all: number; tasks: number };

const primaryNavItems: NavItem[] = [
  { href: "/students", label: "Tələbələr", icon: GraduationCap, requiredPermissions: ["student.read"] },
  { href: "/crm", label: "Follow-up", icon: UsersRound, requiredPermissions: ["crm.lead.read"] },
  { href: "/finance", label: "Maliyyə", icon: CreditCard, requiredPermissions: ["billing.invoice.read", "billing.payment.read", "billing.expense.read", "billing.entry.create"] },
  { href: "/hr" as Route, label: "HR", icon: BriefcaseBusiness, requiredPermissions: ["hr.employee.read", "teacher.read", "hr.corporate.read", "hr.bonus.read"] },
  { href: "/groups" as Route, label: "Slotlar", icon: CalendarDays, requiredPermissions: ["group.read", "attendance.read"] },
  { href: "/tasks" as Route, label: "Tasklar", icon: ListTodo, requiredPermissions: ["task.read"] },
];

const secondaryNavItems: NavItem[] = [
  { href: "/about" as Route, label: "Qaydalar", icon: Building2, requiredPermissions: [] },
  { href: "/audit" as Route, label: "Audit və təhlükəsizlik", icon: ShieldCheck, requiredPermissions: [], requiredRoles: ["SUPER_ADMIN"] },
  { href: "/marketing" as Route, label: "Marketing", icon: Megaphone, requiredPermissions: ["marketing.read"] },
  { href: "/playbook" as Route, label: "Playbook", icon: BookOpenText, requiredPermissions: ["playbook.read"] },
  { href: "/workshops" as Route, label: "Workshop & Masterclass", icon: Presentation, requiredPermissions: ["workshop.read"] },
  { href: "/settings/roles" as Route, label: "Rol və icazələr", icon: Settings2, requiredPermissions: ["auth.role.read"] },
];

const dashboardNavItem: NavItem = {
  href: "/dashboard",
  label: "Panel",
  icon: Gauge,
  requiredPermissions: [],
};

function matchesNavPath(href: string, path: string) {
  if (href === "/dashboard") {
    return path === href;
  }

  return path === href || path.startsWith(`${href}/`);
}

export function AppShell({
  children,
  currentUser,
  initialNotificationCounts,
  signOutAction,
  sessionGuardEnabled,
}: {
  children: React.ReactNode;
  currentUser: ShellUser;
  initialNotificationCounts: NotificationCounts;
  signOutAction: () => void | Promise<void>;
  sessionGuardEnabled: boolean;
}) {
  const pathname = usePathname();
  const [headerActionsTarget, setHeaderActionsTarget] = useState<HTMLDivElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [mobileSidebarPathname, setMobileSidebarPathname] = useState<string | null>(null);
  const [notificationCounts, setNotificationCounts] = useState(initialNotificationCounts);
  const [navIndicator, setNavIndicator] = useState({ top: 0, height: 0, ready: false });
  const prefetchedHrefs = useRef<Set<string>>(new Set());
  const navStackRef = useRef<HTMLElement | null>(null);
  const currentParams = searchParams.toString();
  const currentHref = currentParams ? `${pathname}?${currentParams}` : pathname;
  const sectionId = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const initials = currentUser.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const activePendingHref = pendingHref && pendingHref !== currentHref ? pendingHref : null;
  const isNavigating = Boolean(activePendingHref);
  const highlightPath = (activePendingHref ?? currentHref).split("?")[0] || pathname;
  const permissionSet = new Set(currentUser.permissions);
  const roleSet = new Set(currentUser.roles);
  const isVisible = (item: NavItem) =>
    (!item.requiredRoles || item.requiredRoles.some((role) => roleSet.has(role))) &&
    (item.requiredPermissions.length === 0 ||
      item.requiredPermissions.some((permission) => permissionSet.has(permission)));
  const visiblePrimaryNavItems = primaryNavItems.filter(isVisible);
  const visibleSecondaryNavItems = secondaryNavItems.filter(isVisible);
  const mobileNavCandidates = [
    dashboardNavItem,
    ...visiblePrimaryNavItems,
    ...visibleSecondaryNavItems,
  ];
  const defaultMobileQuickNavItems = mobileNavCandidates.slice(0, 4);
  const activeMobileNavItem = mobileNavCandidates.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const mobileQuickNavItems =
    activeMobileNavItem &&
    !defaultMobileQuickNavItems.some((item) => item.href === activeMobileNavItem.href)
      ? [...defaultMobileQuickNavItems.slice(0, 3), activeMobileNavItem]
      : defaultMobileQuickNavItems;
  const searchNavigationItems: GlobalSearchNavigationItem[] = [
    dashboardNavItem,
    ...visiblePrimaryNavItems,
    ...visibleSecondaryNavItems,
  ].map((item) => ({
    href: item.href,
    label: item.label,
    section:
      item === dashboardNavItem || visiblePrimaryNavItems.includes(item)
        ? "İş axını"
        : "Resurslar",
  }));
  const isMobileMoreActive = !mobileQuickNavItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const isMobileSidebarOpen = mobileSidebarPathname === pathname;

  const refreshNotificationCounts = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/refresh", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const counts = await response.json() as Partial<NotificationCounts>;
      if (typeof counts.all === "number" && typeof counts.tasks === "number") {
        setNotificationCounts({ all: counts.all, tasks: counts.tasks });
      }
    } catch {
      // The next interval, focus event, or realtime message retries the refresh.
    }
  }, []);

  useEffect(() => {
    let client: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    let channel: RealtimeChannel | null = null;
    try {
      client = createSupabaseBrowserClient();
      channel = client
        .channel(`app-notifications:${currentUser.id}`)
        .on("broadcast", { event: "changed" }, () => void refreshNotificationCounts())
        .subscribe();
    } catch {
      client = null;
      channel = null;
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshNotificationCounts();
    };
    // Deadline generation is throttled server-side; poll less often to cut auth+DB load.
    const interval = window.setInterval(() => void refreshNotificationCounts(), 120_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("app-notifications:changed", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("app-notifications:changed", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [currentUser.id, refreshNotificationCounts]);

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const desktopQuery = window.matchMedia("(min-width: 961px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileSidebarPathname(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarPathname(null);
      }
    };

    document.body.style.overflow = "hidden";
    desktopQuery.addEventListener("change", closeOnDesktop);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      desktopQuery.removeEventListener("change", closeOnDesktop);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileSidebarOpen]);

  const updateNavIndicator = useCallback(() => {
    const stack = navStackRef.current;
    if (!stack) {
      return;
    }

    const activeEl = stack.querySelector<HTMLElement>(".nav-icon.is-active");
    if (!activeEl) {
      setNavIndicator((current) => (current.ready ? { ...current, ready: false } : current));
      return;
    }

    const next = {
      top: activeEl.offsetTop,
      height: activeEl.offsetHeight,
      ready: true,
    };

    setNavIndicator((current) =>
      current.top === next.top && current.height === next.height && current.ready === next.ready
        ? current
        : next
    );
  }, []);

  useLayoutEffect(() => {
    updateNavIndicator();
  }, [
    highlightPath,
    isSidebarCompact,
    isMobileSidebarOpen,
    updateNavIndicator,
    visiblePrimaryNavItems.length,
    visibleSecondaryNavItems.length,
  ]);

  useEffect(() => {
    const stack = navStackRef.current;
    if (!stack) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => updateNavIndicator());
    resizeObserver.observe(stack);
    window.addEventListener("resize", updateNavIndicator);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateNavIndicator);
    };
  }, [updateNavIndicator]);

  function markNavigation(href: string | null) {
    if (href && href !== currentHref) {
      setPendingHref(href);
      return;
    }

    setPendingHref(null);
  }

  function handleNavClick(href: Route, event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    markNavigation(href);
    setMobileSidebarPathname(null);
  }

  function handleNavPointerDown(href: Route, event: PointerEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      markNavigation(href);
    }
  }

  function handleNavHover(href: Route) {
    prefetchInternalHref(href);
  }

  function getEventAnchor(target: EventTarget | null) {
    return target instanceof Element
      ? (target.closest("a[href]") as HTMLAnchorElement | null)
      : null;
  }

  function getInternalAnchorHref(anchor: HTMLAnchorElement) {
    const rawHref = anchor.getAttribute("href");

    if (
      !rawHref ||
      rawHref.startsWith("#") ||
      rawHref.startsWith("mailto:") ||
      rawHref.startsWith("tel:") ||
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")
    ) {
      return null;
    }

    const nextUrl = new URL(anchor.href, window.location.href);

    if (nextUrl.origin !== window.location.origin) {
      return null;
    }

    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  function prefetchInternalHref(href: string | null) {
    if (!href || prefetchedHrefs.current.has(href)) {
      return;
    }

    prefetchedHrefs.current.add(href);
    router.prefetch(href as Route);
  }

  function handleContentLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    const anchor = getEventAnchor(event.target);
    markNavigation(anchor ? getInternalAnchorHref(anchor) : null);
  }

  function handleContentLinkIntent(event: SyntheticEvent<HTMLDivElement>) {
    const anchor = getEventAnchor(event.target);
    prefetchInternalHref(anchor ? getInternalAnchorHref(anchor) : null);
  }

  return (
    <div
      className={cx(
        "app-stage",
        isNavigating && "is-navigating",
        isSidebarCompact && "is-sidebar-compact",
        isMobileSidebarOpen && "is-mobile-sidebar-open"
      )}
    >
      {sessionGuardEnabled ? <SessionHeartbeat /> : null}
      <TabGlide />
      <FormInputGuards />
      <div className="studio-wash" aria-hidden="true" />
      <div className="route-progress" aria-hidden={!isNavigating} data-visible={isNavigating} />
      <header className="mobile-shell-bar">
        <button
          className="mobile-menu-button"
          type="button"
          aria-label="Menyunu aç"
          aria-controls="primary-sidebar"
          aria-expanded={isMobileSidebarOpen}
          onClick={() => setMobileSidebarPathname(pathname)}
        >
          <Menu size={21} strokeWidth={2} />
        </button>
        <Link
          href="/dashboard"
          className="mobile-shell-brand"
          aria-label="Artmonia ERP ana səhifə"
          onClick={(event) => handleNavClick("/dashboard", event)}
          prefetch={false}
        >
          <Image src="/logo.png" alt="" width={30} height={30} priority />
          <span>Artmonia ERP</span>
        </Link>
        <ThemeToggle className="theme-toggle-mobile" />
        <button
          type="button"
          className="mobile-shell-account"
          aria-label={`${currentUser.fullName} hesab menyusunu aç`}
          aria-controls="primary-sidebar"
          aria-expanded={isMobileSidebarOpen}
          onClick={() => setMobileSidebarPathname(pathname)}
        >
          {currentUser.profilePhotoUrl ? (
            <Image
              src={currentUser.profilePhotoUrl}
              alt=""
              width={34}
              height={34}
              unoptimized
            />
          ) : (
            <span>{initials || "A"}</span>
          )}
        </button>
      </header>

      <button
        className="mobile-sidebar-backdrop"
        type="button"
        aria-label="Menyunu bağla"
        tabIndex={isMobileSidebarOpen ? 0 : -1}
        onClick={() => setMobileSidebarPathname(null)}
      />

      <aside id="primary-sidebar" className="side-rail" aria-label="Əsas naviqasiya">
        <div className="sidebar-brand-row">
          <Link
            href="/dashboard"
            className="brand-mark"
            aria-label="Artmonia ERP"
            onClick={(event) => handleNavClick("/dashboard", event)}
            onPointerDown={(event) => handleNavPointerDown("/dashboard", event)}
            onMouseEnter={() => handleNavHover("/dashboard")}
            onFocus={() => handleNavHover("/dashboard")}
            prefetch={false}
          >
            <span className="brand-symbol" aria-hidden="true">
              <Image
                className="brand-logo brand-logo-light"
                src="/logo-sidebar-safe.png"
                alt=""
                width={1254}
                height={820}
                priority
              />
              <Image
                className="brand-logo brand-logo-dark"
                src="/logo-sidebar-dark.png"
                alt=""
                width={768}
                height={529}
                priority
              />
            </span>
            <span className="brand-copy">
              <strong>Artmonia ERP</strong>
              <small>Studio operations</small>
            </span>
          </Link>
        </div>
        <button
          className="mobile-sidebar-close"
          type="button"
          aria-label="Menyunu bağla"
          onClick={() => setMobileSidebarPathname(null)}
        >
          <X size={19} strokeWidth={2} />
        </button>
        <button
          className="sidebar-toggle"
          type="button"
          aria-label={isSidebarCompact ? "Sidebarı genişləndir" : "Sidebarı kiçilt"}
          aria-expanded={!isSidebarCompact}
          onClick={() => setIsSidebarCompact((current) => !current)}
        >
          {isSidebarCompact ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>

        <nav className="nav-stack" ref={navStackRef}>
          <span
            className={cx("nav-active-indicator", navIndicator.ready && "is-ready")}
            aria-hidden="true"
            style={
              {
                "--nav-indicator-y": `${navIndicator.top}px`,
                "--nav-indicator-h": `${navIndicator.height}px`,
              } as CSSProperties
            }
          />
          <p className="nav-section-label">İş axını</p>
          {(() => {
            const Icon = dashboardNavItem.icon;
            const current = matchesNavPath(dashboardNavItem.href, pathname);
            const active = matchesNavPath(dashboardNavItem.href, highlightPath);

            return (
              <Link
                href={dashboardNavItem.href}
                className={cx(
                  "nav-icon",
                  active && "is-active",
                  activePendingHref === dashboardNavItem.href && "is-pending"
                )}
                aria-label={dashboardNavItem.label}
                aria-current={current ? "page" : undefined}
                onClick={(event) => handleNavClick(dashboardNavItem.href, event)}
                onPointerDown={(event) => handleNavPointerDown(dashboardNavItem.href, event)}
                onMouseEnter={() => handleNavHover(dashboardNavItem.href)}
                onFocus={() => handleNavHover(dashboardNavItem.href)}
                prefetch={false}
              >
                <span className="nav-icon-box" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="nav-item-label">{dashboardNavItem.label}</span>
              </Link>
            );
          })()}
          {visiblePrimaryNavItems.map((item) => {
            const Icon = item.icon;
            const current = matchesNavPath(item.href, pathname);
            const active = matchesNavPath(item.href, highlightPath);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "nav-icon",
                  active && "is-active",
                  activePendingHref === item.href && "is-pending"
                )}
                aria-label={item.label}
                aria-current={current ? "page" : undefined}
                onClick={(event) => handleNavClick(item.href, event)}
                onPointerDown={(event) => handleNavPointerDown(item.href, event)}
                onMouseEnter={() => handleNavHover(item.href)}
                onFocus={() => handleNavHover(item.href)}
                prefetch={false}
              >
                <span className="nav-icon-box" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="nav-item-label">{item.label}</span>
                {item.href === "/tasks" && notificationCounts.tasks > 0 ? (
                  <NotificationBadge count={notificationCounts.tasks} />
                ) : null}
              </Link>
            );
          })}

          <div className="nav-divider" aria-hidden="true" />
          <p className="nav-section-label">Resurslar</p>
          {visibleSecondaryNavItems.map((item) => {
            const Icon = item.icon;
            const current = matchesNavPath(item.href, pathname);
            const active = matchesNavPath(item.href, highlightPath);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "nav-icon",
                  active && "is-active",
                  activePendingHref === item.href && "is-pending"
                )}
                aria-label={item.label}
                aria-current={current ? "page" : undefined}
                onClick={(event) => handleNavClick(item.href, event)}
                onPointerDown={(event) => handleNavPointerDown(item.href, event)}
                onMouseEnter={() => handleNavHover(item.href)}
                onFocus={() => handleNavHover(item.href)}
                prefetch={false}
              >
                <span className="nav-icon-box" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.9} />
                </span>
                <span className="nav-item-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rail-bottom-stack">
          <Link
            href={"/profile" as Route}
            className={cx(
              "rail-user-card",
              (pathname === "/profile" || pathname.startsWith("/profile/")) && "is-active"
            )}
            aria-label={`${currentUser.fullName} (${currentUser.roles.join(", ")})`}
            onClick={(event) => handleNavClick("/profile" as Route, event)}
            onPointerDown={(event) => handleNavPointerDown("/profile" as Route, event)}
            onMouseEnter={() => handleNavHover("/profile" as Route)}
            onFocus={() => handleNavHover("/profile" as Route)}
            prefetch={false}
          >
            {currentUser.profilePhotoUrl ? (
              <Image
                className="sidebar-avatar sidebar-avatar-image"
                src={currentUser.profilePhotoUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
              />
            ) : (
              <div className="sidebar-avatar">{initials || "A"}</div>
            )}
            <span className="rail-user-copy">
              <strong>{currentUser.fullName}</strong>
              <small>{currentUser.roles[0] || "İstifadəçi"}</small>
            </span>
            {notificationCounts.all > 0 ? <NotificationBadge count={notificationCounts.all} profile /> : null}
          </Link>
          <div className="rail-utility-actions">
            <ThemeToggle className="rail-utility-button theme-toggle-rail" />
            <form action={signOutAction}>
              <button className="rail-utility-button" type="submit" aria-label="Çıxış" title="Çıxış">
                <LogOut size={18} strokeWidth={1.9} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Sürətli naviqasiya">
        {mobileQuickNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx("mobile-bottom-nav-item", active && "is-active")}
              aria-current={active ? "page" : undefined}
              onClick={(event) => handleNavClick(item.href, event)}
              onPointerDown={(event) => handleNavPointerDown(item.href, event)}
              prefetch={false}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span>{item.label}</span>
              {item.href === "/tasks" && notificationCounts.tasks > 0 ? (
                <NotificationBadge count={notificationCounts.tasks} mobile />
              ) : null}
            </Link>
          );
        })}
        <button
          className={cx("mobile-bottom-nav-item", isMobileMoreActive && "is-active")}
          type="button"
          aria-label="Bütün bölmələri aç"
          aria-expanded={isMobileSidebarOpen}
          onClick={() => setMobileSidebarPathname(pathname)}
        >
          <Menu size={20} strokeWidth={isMobileMoreActive ? 2.2 : 1.8} />
          <span>Daha çox</span>
        </button>
      </nav>

      <main
        className="erp-frame"
        data-section={sectionId}
        data-dashboard-section={sectionId === "dashboard" ? "true" : "false"}
        aria-busy={isNavigating}
      >

        <div className="erp-command-header">
          <GlobalSearch
            navigationItems={searchNavigationItems}
            onNavigate={markNavigation}
          />
          <ErpCalendar onNavigate={markNavigation} />
          {pathname === "/students" || pathname === "/crm" || pathname === "/finance" ? <div className={pathname === "/finance" ? "finance-header-slot" : pathname === "/crm" ? "crm-header-slot" : "students-header-slot"} ref={setHeaderActionsTarget} /> : null}
        </div>

        <div
          className="route-content-shell"
          onClickCapture={handleContentLinkClick}
          onMouseOverCapture={handleContentLinkIntent}
          onFocusCapture={handleContentLinkIntent}
        >
          <HeaderActionsContext.Provider value={headerActionsTarget}>{children}</HeaderActionsContext.Provider>
        </div>
        <div className="route-pending-overlay" data-visible={isNavigating} aria-hidden={!isNavigating}>
          <span />
        </div>
      </main>
    </div>
  );
}

function NotificationBadge({
  count,
  profile = false,
  mobile = false,
}: {
  count: number;
  profile?: boolean;
  mobile?: boolean;
}) {
  return (
    <span
      className={cx(
        "sidebar-notification-badge",
        profile && "is-profile",
        mobile && "is-mobile",
      )}
      aria-label={`${count} oxunmamış bildiriş`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
