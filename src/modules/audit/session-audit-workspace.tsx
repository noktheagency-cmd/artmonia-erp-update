"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  Clock3,
  Copy,
  History,
  Laptop,
  ListFilter,
  LocateFixed,
  LogOut,
  Monitor,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Tablet,
  UserRound,
  UserRoundCog,
  UsersRound,
  Wifi,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/modules/audit/session-actions";
import type {
  AuthSessionDto,
  SessionAuditData,
  SessionDeviceTypeDto,
  SessionUserDto,
} from "@/modules/audit/session-types";
import styles from "./session-audit.module.css";

const AuditLogPanel = dynamic(
  () => import("@/modules/audit/audit-log-panel").then((module) => module.AuditLogPanel),
  { loading: () => <div className={styles.activityLoading}>Fəaliyyət jurnalı yüklənir...</div> },
);

const AccountSecurityPanel = dynamic(
  () => import("@/modules/audit/account-security-panel").then((module) => module.AccountSecurityPanel),
  { loading: () => <div className={styles.activityLoading}>Hesab təhlükəsizliyi yüklənir...</div> },
);

const PaymentDateAuditPanel = dynamic(
  () => import("@/modules/audit/payment-date-audit-panel").then((module) => module.PaymentDateAuditPanel),
  { loading: () => <div className={styles.activityLoading}>Ödəniş tarixi auditi yüklənir...</div> },
);

type AuditTab = "SESSIONS" | "ACCOUNTS" | "ACTIVITY" | "PAYMENT_DATES";

type RevokeIntent =
  | { kind: "SESSION"; session: AuthSessionDto }
  | { kind: "OTHERS"; user: SessionUserDto; count: number };

const deviceFilters: Array<{ value: "ALL" | SessionDeviceTypeDto; label: string }> = [
  { value: "ALL", label: "Bütün cihazlar" },
  { value: "DESKTOP", label: "Kompüter" },
  { value: "MOBILE", label: "Telefon" },
  { value: "TABLET", label: "Planşet" },
];

export function SessionAuditWorkspace({
  initialData,
  initialTab = "SESSIONS",
  initialAccountKey = null,
}: {
  initialData: SessionAuditData;
  initialTab?: AuditTab;
  initialAccountKey?: string | null;
}) {
  const router = useRouter();
  const [revokedSessionIds, setRevokedSessionIds] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<AuditTab>(initialTab);
  const [selectedUserId, setSelectedUserId] = useState(
    initialData.users.some((user) => user.id === initialData.currentUserId)
      ? initialData.currentUserId
      : initialData.users[0]?.id ?? initialData.currentUserId,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [revokeIntent, setRevokeIntent] = useState<RevokeIntent | null>(null);
  const [query, setQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"ALL" | SessionDeviceTypeDto>("ALL");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const normalizedQuery = query.trim().toLocaleLowerCase("az");
  const sessions = useMemo(
    () => initialData.sessions.filter((session) => !revokedSessionIds.has(session.id)),
    [initialData.sessions, revokedSessionIds],
  );
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;

  const users = useMemo(
    () => {
      const sessionsByUser = new Map<string, AuthSessionDto[]>();
      for (const session of sessions) {
        const items = sessionsByUser.get(session.userId);
        if (items) items.push(session);
        else sessionsByUser.set(session.userId, [session]);
      }
      return initialData.users.map((user) => {
        const userSessions = sessionsByUser.get(user.id) ?? [];
        return {
          ...user,
          activeSessionCount: userSessions.length,
          lastSeenAt: userSessions[0]?.lastSeenAt ?? user.lastSeenAt,
        };
      });
    },
    [initialData.users, sessions],
  );
  const visibleUsers = users.filter((user) =>
    !normalizedQuery || `${user.fullName} ${user.email} ${user.role}`.toLocaleLowerCase("az").includes(normalizedQuery),
  );
  const selectedUser = visibleUsers.find((user) => user.id === selectedUserId) ?? visibleUsers[0] ?? null;
  const selectedUserSessions = sessions.filter((session) => session.userId === selectedUser?.id);
  const visibleSessions = selectedUserSessions.filter((session) => {
    if (deviceFilter !== "ALL" && session.deviceType !== deviceFilter) return false;
    if (!normalizedQuery || initialData.canViewAll) return true;
    return `${session.deviceName} ${session.browserName} ${session.osName} ${session.ipAddress ?? ""}`
      .toLocaleLowerCase("az")
      .includes(normalizedQuery);
  });
  const currentSummary = useMemo(() => {
    const recentThreshold = new Date(initialData.generatedAt).getTime() - 15 * 60_000;
    return {
      activeSessions: sessions.length,
      activeUsers: new Set(sessions.map((session) => session.userId)).size,
      mobileDevices: sessions.filter(
        (session) => session.deviceType === "MOBILE" || session.deviceType === "TABLET",
      ).length,
      recentlyActive: sessions.filter(
        (session) => new Date(session.lastSeenAt).getTime() >= recentThreshold,
      ).length,
    };
  }, [initialData.generatedAt, sessions]);
  const bulkCount = selectedUserSessions.filter(
    (session) => !session.isCurrent || selectedUser?.id !== initialData.currentUserId,
  ).length;

  function submitRevoke() {
    if (!revokeIntent) return;
    startTransition(async () => {
      const result = revokeIntent.kind === "SESSION"
        ? await revokeSessionAction({ sessionId: revokeIntent.session.id })
        : await revokeOtherSessionsAction({ userId: revokeIntent.user.id });

      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        setRevokeIntent(null);
        return;
      }

      setRevokedSessionIds((current) => {
        const next = new Set(current);
        for (const sessionId of result.revokedSessionIds) next.add(sessionId);
        return next;
      });
      setSelectedSessionId(null);
      setRevokeIntent(null);
      setFeedback({
        tone: "success",
        text: result.revokedSessionIds.length === 1
          ? "Sessiya uğurla bağlandı."
          : `${result.revokedSessionIds.length} sessiya uğurla bağlandı.`,
      });

      if (result.signedOut) {
        window.location.assign("/login?reason=session-ended");
        return;
      }
      router.refresh();
    });
  }

  function resetFilters() {
    setQuery("");
    setDeviceFilter("ALL");
  }

  function refreshSessions() {
    startTransition(() => router.refresh());
  }

  async function copySessionId() {
    if (!selectedSession) return;
    await navigator.clipboard.writeText(selectedSession.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <main className={styles.workspace}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Audit və təhlükəsizlik</h1>
          <p>Giriş hesablarını, parolları, rolları və aktiv sessiyaları vahid təhlükəsizlik mərkəzindən idarə edin.</p>
        </div>
        <span className={styles.scopeLabel}>
          <ShieldCheck /> {tab === "PAYMENT_DATES"
            ? "Ödəniş tarixi riskləri"
            : tab === "ACTIVITY"
            ? initialData.canViewAudit ? "Bütün əməliyyatlar" : "Mənim təhlükəsizlik qeydlərim"
            : tab === "ACCOUNTS" ? "Super Admin hesab idarəetməsi"
              : initialData.canViewAll ? "Bütün əməkdaşlar" : "Yalnız mənim sessiyalarım"}
        </span>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Audit bölmələri">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "SESSIONS"}
          className={tab === "SESSIONS" ? styles.activeTab : undefined}
          onClick={() => setTab("SESSIONS")}
        >
          <ShieldCheck /> Aktiv sessiyalar <span>{sessions.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ACCOUNTS"}
          className={tab === "ACCOUNTS" ? styles.activeTab : undefined}
          onClick={() => setTab("ACCOUNTS")}
        >
          <UserRoundCog /> Hesablar <span>{initialData.accounts.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ACTIVITY"}
          className={tab === "ACTIVITY" ? styles.activeTab : undefined}
          onClick={() => setTab("ACTIVITY")}
        >
          <History /> Fəaliyyət jurnalı <span>{initialData.activity.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "PAYMENT_DATES"}
          className={tab === "PAYMENT_DATES" ? styles.activeTab : undefined}
          onClick={() => setTab("PAYMENT_DATES")}
        >
          <AlertTriangle /> Ödəniş tarixləri <span>{initialData.paymentDateRisks.length}</span>
        </button>
      </div>

      {feedback ? (
        <div className={feedback.tone === "success" ? styles.successNotice : styles.errorNotice} role="status">
          {feedback.tone === "success" ? <Check /> : <AlertTriangle />}
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Bildirişi bağla">×</button>
        </div>
      ) : null}

      {tab === "SESSIONS" ? (
        <>
          <section className={styles.metrics} aria-label="Sessiya xülasəsi">
            <Metric icon={<UsersRound />} label="Aktiv sessiyalar" value={currentSummary.activeSessions} note="Bütün cihazlarda" tone="blue" />
            <Metric icon={<UserRound />} label="Aktiv istifadəçilər" value={currentSummary.activeUsers} note="Sessiyası olan profil" tone="green" />
            <Metric icon={<Smartphone />} label="Mobil cihazlar" value={currentSummary.mobileDevices} note="Telefon və planşet" tone="violet" />
            <Metric icon={<Activity />} label="İndi aktiv" value={currentSummary.recentlyActive} note="Son 15 dəqiqə" tone="cyan" />
          </section>

          {!initialData.canViewAll ? (
            <div className={styles.securityNote}>
              <ShieldCheck />
              <span><strong>Cihazlarınızı mütəmadi yoxlayın.</strong> Tanımadığınız giriş görsəniz sessiyanı dərhal bağlayın.</span>
            </div>
          ) : null}

          {initialData.truncated ? (
            <div className={styles.limitNotice} role="status">
              <AlertTriangle /> İlk 1 000 aktiv sessiya göstərilir. Daha dəqiq nəticə üçün server filtrləməsi əlavə edilməlidir.
            </div>
          ) : null}

          <section className={styles.sessionSurface}>
            <div className={styles.toolbar}>
              <label className={styles.searchBox}>
                <Search />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={initialData.canViewAll ? "Ad, e-poçt və ya rol axtar..." : "Cihaz, brauzer və ya IP axtar..."}
                  aria-label="Sessiyalarda axtarış"
                />
              </label>
              <label className={styles.selectBox}>
                <ListFilter />
                <select
                  value={deviceFilter}
                  onChange={(event) => setDeviceFilter(event.target.value as "ALL" | SessionDeviceTypeDto)}
                  aria-label="Cihaz növü"
                >
                  {deviceFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
                </select>
              </label>
              <Button type="button" variant="outline" className={styles.resetButton} onClick={resetFilters}>
                <RefreshCw /> Sıfırla
              </Button>
              {selectedUser && bulkCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className={styles.bulkButton}
                  onClick={() => setRevokeIntent({ kind: "OTHERS", user: selectedUser, count: bulkCount })}
                >
                  <LogOut /> Digər sessiyaları bağla
                </Button>
              ) : null}
            </div>

            <div className={`${styles.sessionLayout} ${!initialData.canViewAll ? styles.personalLayout : ""}`}>
              {initialData.canViewAll ? (
                <aside className={styles.userRail} aria-label="İstifadəçi hesabları">
                  <div className={styles.userRailHeader}>
                    <strong>Hesablar</strong>
                    <span>{visibleUsers.length}</span>
                  </div>
                  <div className={styles.userList}>
                    {visibleUsers.map((user) => (
                      <button
                        type="button"
                        key={user.id}
                        className={user.id === selectedUser?.id ? styles.activeUser : styles.userButton}
                        onClick={() => {
                          setSelectedUserId(user.id);
                          setSelectedSessionId(null);
                          setDeviceFilter("ALL");
                        }}
                      >
                        <span className={styles.avatar}>{initials(user.fullName)}</span>
                        <span className={styles.userCopy}>
                          <strong>{user.fullName}</strong>
                          <small>{user.position || user.role}</small>
                        </span>
                        <span className={styles.sessionCount}>{user.activeSessionCount > 0 ? <i /> : null} {user.activeSessionCount}</span>
                      </button>
                    ))}
                    {!visibleUsers.length ? <p className={styles.railEmpty}>Axtarışa uyğun istifadəçi yoxdur.</p> : null}
                  </div>
                </aside>
              ) : null}

              <div className={styles.sessionListPanel}>
                <header className={styles.listHeader}>
                  <div>
                    <strong>{selectedUser?.fullName ?? "Mənim sessiyalarım"}</strong>
                    <span>{selectedUserSessions.length} aktiv sessiya</span>
                  </div>
                  {selectedUser ? <small>{selectedUser.email || "E-poçt qeyd edilməyib"}</small> : null}
                </header>

                <div className={styles.tableHead} aria-hidden="true">
                  <span>Cihaz</span><span>Status</span><span>Son aktivlik</span><span>IP ünvanı</span><span>İlk giriş</span><span>Əməliyyat</span>
                </div>
                <div className={styles.sessionRows}>
                  {visibleSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      referenceTime={initialData.generatedAt}
                      onSelect={() => setSelectedSessionId(session.id)}
                      onRevoke={() => setRevokeIntent({ kind: "SESSION", session })}
                    />
                  ))}
                  {!visibleSessions.length ? (
                    <div className={styles.emptyState}>
                      <ShieldCheck />
                      <strong>Aktiv sessiya tapılmadı</strong>
                      <p>Seçilmiş istifadəçi və ya filtr üçün göstəriləcək giriş yoxdur.</p>
                    </div>
                  ) : null}
                </div>
                <footer className={styles.listFooter}>
                  <span>Cəmi {visibleSessions.length} sessiya</span>
                  <button type="button" disabled={isPending} onClick={refreshSessions}><RefreshCw className={isPending ? styles.spin : undefined} /> {isPending ? "Yenilənir..." : "Yenilə"}</button>
                </footer>
              </div>
            </div>
          </section>
        </>
      ) : tab === "ACCOUNTS" ? (
        <AccountSecurityPanel
          accounts={initialData.accounts}
          roleOptions={initialData.accountRoleOptions}
          generatedAt={initialData.generatedAt}
          initialProfileKey={initialAccountKey}
        />
      ) : tab === "ACTIVITY" ? (
        <AuditLogPanel logs={initialData.activity} />
      ) : (
        <PaymentDateAuditPanel payments={initialData.paymentDateRisks} />
      )}

      <Dialog open={Boolean(selectedSession)} onOpenChange={(open) => !open && setSelectedSessionId(null)}>
        <DialogContent
          className={styles.sessionDialog}
          closeOnInteractOutside
          closeOnEscape
        >
          {selectedSession ? (
            <>
              <DialogHeader className={styles.detailHeader}>
                <span className={styles.detailDeviceIcon}><DeviceIcon type={selectedSession.deviceType} /></span>
                <div>
                  <DialogTitle>{selectedSession.browserName} · {selectedSession.osName}</DialogTitle>
                  <DialogDescription>{selectedSession.deviceName}</DialogDescription>
                </div>
              </DialogHeader>
              {selectedSession.isCurrent ? <span className={styles.currentDetailLabel}><Wifi /> Hazırkı cihaz</span> : null}
              <dl className={styles.detailGrid}>
                <Detail icon={<Laptop />} label="Brauzer" value={joinVersion(selectedSession.browserName, selectedSession.browserVersion)} />
                <Detail icon={<Monitor />} label="Əməliyyat sistemi" value={joinVersion(selectedSession.osName, selectedSession.osVersion)} />
                <Detail icon={<Wifi />} label="IP ünvanı" value={selectedSession.ipAddress ?? "Qeydə alınmayıb"} mono />
                <Detail icon={<LocateFixed />} label="Yerləşmə" value={formatLocation(selectedSession)} />
                <Detail icon={<Clock3 />} label="İlk giriş" value={formatDateTime(selectedSession.startedAt)} />
                <Detail icon={<Activity />} label="Son aktivlik" value={formatDateTime(selectedSession.lastSeenAt)} />
              </dl>
              <div className={styles.sessionIdBox}>
                <span>Sessiya ID</span>
                <code>{selectedSession.id}</code>
                <button type="button" onClick={copySessionId} aria-label="Sessiya ID-ni kopyala">
                  {copied ? <Check /> : <Copy />}
                </button>
              </div>
              <div className={styles.detailOwner}>
                <span className={styles.avatar}>{initials(selectedSession.userName)}</span>
                <div><strong>{selectedSession.userName}</strong><small>{selectedSession.userEmail}</small></div>
              </div>
              <Button
                type="button"
                variant="destructive"
                className={styles.revokeDetailButton}
                onClick={() => setRevokeIntent({ kind: "SESSION", session: selectedSession })}
              >
                <LogOut /> {selectedSession.isCurrent ? "Bu cihazdan çıxış et" : "Sessiyanı bağla"}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revokeIntent)} onOpenChange={(open) => !open && !isPending && setRevokeIntent(null)}>
        <DialogContent className={styles.confirmDialog}>
          <DialogHeader>
            <span className={styles.warningIcon}><AlertTriangle /></span>
            <DialogTitle>{revokeIntent?.kind === "OTHERS" ? "Digər sessiyaları bağla" : "Sessiyanı bağla"}</DialogTitle>
            <DialogDescription>
              {revokeIntent?.kind === "OTHERS"
                ? `${revokeIntent.user.fullName} üçün ${revokeIntent.count} əlavə cihazın girişi dərhal dayandırılacaq.`
                : revokeIntent?.session.isCurrent
                  ? "Hazırkı cihazdan çıxış ediləcək və giriş səhifəsinə yönləndiriləcəksiniz."
                  : `${revokeIntent?.session.deviceName ?? "Bu cihaz"} üçün giriş dərhal dayandırılacaq.`}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.confirmNote}>
            Bu əməliyyat audit jurnalına yazılacaq. Cihaz yenidən daxil olmaq üçün şifrə tələb edəcək.
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setRevokeIntent(null)}>Ləğv et</Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={submitRevoke}>
              {isPending ? <RefreshCw className={styles.spin} /> : <LogOut />}
              {isPending ? "Bağlanır..." : "Sessiyanı bağla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string }) {
  return <article className={styles.metric} data-tone={tone}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function SessionRow({ session, referenceTime, onSelect, onRevoke }: { session: AuthSessionDto; referenceTime: string; onSelect: () => void; onRevoke: () => void }) {
  return (
    <article className={`${styles.sessionRow} ${session.isCurrent ? styles.currentSession : ""}`}>
      <button type="button" className={styles.sessionMain} onClick={onSelect} aria-label={`${session.deviceName} sessiya detallarına bax`}>
        <span className={styles.deviceIcon}><DeviceIcon type={session.deviceType} /></span>
        <span className={styles.deviceCopy}>
          <strong>{session.browserName} · {session.osName}</strong>
          <small>{session.deviceName}</small>
          {session.isCurrent ? <em>Hazırkı cihaz</em> : null}
        </span>
        <span className={styles.activeStatus}><i /> Aktiv</span>
        <span className={styles.cell}><strong>{formatRelative(session.lastSeenAt, referenceTime)}</strong><small>{formatLocation(session)}</small></span>
        <span className={`${styles.cell} ${styles.mono}`}><strong>{session.ipAddress ?? "—"}</strong><small>IP ünvanı</small></span>
        <span className={styles.cell}><strong>{formatCompactDate(session.startedAt)}</strong><small>{formatTime(session.startedAt)}</small></span>
      </button>
      <div className={styles.rowAction}>
        {session.isCurrent ? (
          <button type="button" onClick={onSelect}>Detallar</button>
        ) : (
          <button type="button" onClick={onRevoke}>Sessiyanı bağla</button>
        )}
      </div>
    </article>
  );
}

function DeviceIcon({ type }: { type: SessionDeviceTypeDto }) {
  if (type === "MOBILE") return <Smartphone />;
  if (type === "TABLET") return <Tablet />;
  if (type === "DESKTOP") return <Laptop />;
  return <Monitor />;
}

function Detail({ icon, label, value, mono = false }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return <div><span>{icon}</span><dt>{label}</dt><dd className={mono ? styles.mono : undefined}>{value}</dd></div>;
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("az");
}

function joinVersion(name: string, version: string | null) {
  return version && !name.includes(version) ? `${name} ${version}` : name;
}

function formatLocation(session: Pick<AuthSessionDto, "city" | "country">) {
  return [session.city, session.country].filter(Boolean).join(", ") || "Məkan qeydə alınmayıb";
}

const datePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Baku",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dateParts(value: string) {
  return Object.fromEntries(
    datePartsFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function formatDateTime(value: string) {
  const parts = dateParts(value);
  return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`;
}
function formatCompactDate(value: string) {
  const parts = dateParts(value);
  return `${parts.day}.${parts.month}.${parts.year.slice(-2)}`;
}
function formatTime(value: string) {
  const parts = dateParts(value);
  return `${parts.hour}:${parts.minute}`;
}
function formatRelative(value: string, referenceTime: string) {
  const difference = new Date(referenceTime).getTime() - new Date(value).getTime();
  if (difference < 90_000) return "İndi";
  if (difference < 3_600_000) return `${Math.max(1, Math.floor(difference / 60_000))} dəq əvvəl`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} saat əvvəl`;
  return formatCompactDate(value);
}
