"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BriefcaseBusiness,
  BookOpenText,
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
  ListTodo,
  UsersRound,
  X,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type ShellUser = {
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
};

const primaryNavItems: NavItem[] = [
  { href: "/students", label: "Tələbələr", icon: GraduationCap, requiredPermissions: ["student.read"] },
  { href: "/crm", label: "Follow-up", icon: UsersRound, requiredPermissions: ["crm.lead.read"] },
  { href: "/finance", label: "Maliyyə", icon: CreditCard, requiredPermissions: ["billing.invoice.read", "billing.payment.read", "billing.expense.read"] },
  { href: "/hr" as Route, label: "HR", icon: BriefcaseBusiness, requiredPermissions: ["hr.employee.read", "teacher.read", "hr.bonus.read"] },
  { href: "/groups" as Route, label: "Qruplar", icon: CalendarDays, requiredPermissions: ["group.read", "attendance.read"] },
  { href: "/tasks" as Route, label: "Tasklar", icon: ListTodo, requiredPermissions: ["task.read"] },
];

const secondaryNavItems: NavItem[] = [
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

export function AppShell({
  children,
  currentUser,
  signOutAction,
}: {
  children: React.ReactNode;
  currentUser: ShellUser;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [mobileSidebarPathname, setMobileSidebarPathname] = useState<string | null>(null);
  const prefetchedHrefs = useRef<Set<string>>(new Set());
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
  const permissionSet = new Set(currentUser.permissions);
  const isVisible = (item: NavItem) => item.requiredPermissions.some((permission) => permissionSet.has(permission));
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
  const isMobileMoreActive = !mobileQuickNavItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const isMobileSidebarOpen = mobileSidebarPathname === pathname;

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

        <nav className="nav-stack">
          <p className="nav-section-label">İş axını</p>
          {(() => {
            const Icon = dashboardNavItem.icon;
            const active = pathname === dashboardNavItem.href;

            return (
              <Link
                href={dashboardNavItem.href}
                className={cx(
                  "nav-icon",
                  active && "is-active",
                  activePendingHref === dashboardNavItem.href && "is-pending"
                )}
                aria-label={dashboardNavItem.label}
                aria-current={active ? "page" : undefined}
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
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
                aria-current={active ? "page" : undefined}
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

          <div className="nav-divider" aria-hidden="true" />
          <p className="nav-section-label">Resurslar</p>
          {visibleSecondaryNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

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
                aria-current={active ? "page" : undefined}
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

        <div
          className="route-content-shell"
          onClickCapture={handleContentLinkClick}
          onMouseOverCapture={handleContentLinkIntent}
          onFocusCapture={handleContentLinkIntent}
        >
          {children}
        </div>
        <div className="route-pending-overlay" data-visible={isNavigating} aria-hidden={!isNavigating}>
          <span />
        </div>
      </main>
    </div>
  );
}
