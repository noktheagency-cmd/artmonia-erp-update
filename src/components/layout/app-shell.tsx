"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
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
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  Settings2,
  ListTodo,
  UsersRound,
} from "lucide-react";
import { cx } from "@/components/ui/cx";

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
        isSidebarCompact && "is-sidebar-compact"
      )}
    >
      <div className="studio-wash" aria-hidden="true" />
      <div className="route-progress" aria-hidden={!isNavigating} data-visible={isNavigating} />
      <aside className="side-rail" aria-label="Əsas naviqasiya">
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
          <Image className="brand-logo" src="/logo.png" alt="" width={34} height={34} priority />
        </Link>
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
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="nav-divider" aria-hidden="true" />
          <p className="nav-section-label">Digər</p>
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
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rail-bottom-stack">
          <div
            className="nav-icon"
            aria-label={`${currentUser.fullName} (${currentUser.roles.join(", ")})`}
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
          </div>
          <form action={signOutAction}>
            <button className="nav-icon" type="submit" aria-label="Çıxış">
              <LogOut size={18} strokeWidth={1.9} />
            </button>
          </form>
        </div>
      </aside>

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
