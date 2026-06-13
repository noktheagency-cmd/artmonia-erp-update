"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CreditCard,
  Gauge,
  GraduationCap,
  LayoutGrid,
  LogOut,
  Paintbrush,
  Search,
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
  { href: "/finance", label: "Maliyyə", icon: CreditCard },
  { href: "/reports", label: "Hesabatlar", icon: LayoutGrid },
];

export function AppShell({
  children,
  currentUser,
  todayLabel,
  signOutAction,
}: {
  children: React.ReactNode;
  currentUser: ShellUser;
  todayLabel: string;
  signOutAction: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get("q") ?? "";
  const searchTargetPath = pathname.startsWith("/students") ? "/students" : "/crm";
  const preservedSearchParams =
    pathname === searchTargetPath
      ? Array.from(searchParams.entries()).filter(([key, value]) => key !== "q" && value)
      : [];
  const initials = currentUser.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  function openTodayFollowUps() {
    const params = pathname.startsWith("/crm")
      ? new URLSearchParams(searchParams.toString())
      : new URLSearchParams();

    params.set("followUp", "today");
    router.push(`/crm?${params.toString()}` as Route);
  }

  return (
    <div className="app-stage">
      <div className="studio-wash" aria-hidden="true" />
      <aside className="side-rail" aria-label="Əsas naviqasiya">
        <Link href="/dashboard" className="brand-mark" aria-label="Artmonia ERP">
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
                className={cx("nav-icon", active && "is-active")}
                aria-label={item.label}
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

      <main className="erp-frame">
        <header className="topbar">
          <form className="search-box topbar-search" action={searchTargetPath} method="get">
            {preservedSearchParams.map(([key, value]) => (
              <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
            ))}
            <button className="search-submit" type="submit" aria-label="Axtar">
              <Search size={16} />
            </button>
            <span className="sr-only">Axtar</span>
            <input
              key={`${pathname}-${currentQuery}`}
              name="q"
              defaultValue={currentQuery}
              placeholder="Tələbə, müraciət və ödəniş axtar"
            />
          </form>

          <button
            className="today-chip"
            type="button"
            onClick={openTodayFollowUps}
            aria-label="Bugünkü CRM izləmələrini göstər"
          >
            <CalendarDays size={15} />
            {todayLabel}
          </button>

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

        {children}
      </main>
    </div>
  );
}
