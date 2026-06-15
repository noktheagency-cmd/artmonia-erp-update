"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type MouseEvent,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import {
  Bell,
  BriefcaseBusiness,
  CreditCard,
  Gauge,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Paintbrush,
  Settings,
  UsersRound,
} from "lucide-react";
import { cx } from "@/components/ui/cx";

type ShellUser = {
  fullName: string;
  email: string;
  roles: string[];
};

type NavItem = {
  href: Route;
  label: string;
  icon: typeof Gauge;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "İdarə paneli", icon: Gauge },
  { href: "/students", label: "Tələbələr", icon: GraduationCap },
  { href: "/crm", label: "CRM", icon: UsersRound },
  { href: "/hr" as Route, label: "HR panel", icon: BriefcaseBusiness },
  { href: "/finance", label: "Maliyyə", icon: CreditCard },
  { href: "/reports", label: "Hesabatlar", icon: LayoutGrid },
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
  const prefetchedHrefs = useRef<Set<string>>(new Set());
  const currentParams = searchParams.toString();
  const currentHref = currentParams ? `${pathname}?${currentParams}` : pathname;
  const initials = currentUser.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const activePendingHref = pendingHref && pendingHref !== currentHref ? pendingHref : null;
  const isNavigating = Boolean(activePendingHref);

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

    router.prefetch(href as Route);
    prefetchedHrefs.current.add(href);
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
    <div className={cx("app-stage", isNavigating && "is-navigating")}>
      <div className="studio-wash" aria-hidden="true" />
      <div className="route-progress" aria-hidden={!isNavigating} data-visible={isNavigating} />
      <aside className="side-rail" aria-label="Əsas naviqasiya">
        <Link
          href="/dashboard"
          className="brand-mark"
          aria-label="Artmonia ERP"
          onClick={(event) => handleNavClick("/dashboard", event)}
          onMouseEnter={() => handleNavHover("/dashboard")}
          onFocus={() => handleNavHover("/dashboard")}
          prefetch={false}
        >
          <Image className="brand-logo" src="/logo.png" alt="" width={34} height={34} priority />
        </Link>

        <nav className="nav-stack">
          {navItems.map((item) => {
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
                onMouseEnter={() => handleNavHover(item.href)}
                onFocus={() => handleNavHover(item.href)}
                prefetch={false}
              >
                <Icon size={18} strokeWidth={1.9} />
              </Link>
            );
          })}
        </nav>

        <form action={signOutAction} className="rail-bottom">
          <button className="nav-icon" type="submit" aria-label="Çıxış">
            <LogOut size={18} strokeWidth={1.9} />
          </button>
        </form>
      </aside>

      <main className="erp-frame" aria-busy={isNavigating}>
        <header className="topbar">
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="Studiya rejimi">
              <Paintbrush size={16} />
            </button>
            <button className="icon-button" type="button" aria-label="Tənzimləmələr">
              <Settings size={16} />
            </button>
            <button className="icon-button" type="button" aria-label="Bildirişlər">
              <Bell size={16} />
            </button>
            <div className="user-pill" aria-label="Cari istifadəçi">
              <div className="avatar">{initials || "A"}</div>
              <div>
                <strong>{currentUser.fullName}</strong>
                <span>{currentUser.roles.join(", ")}</span>
              </div>
            </div>
          </div>
        </header>

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
