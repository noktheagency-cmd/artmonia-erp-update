"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Search,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getAuditActionLabel,
  getAuditDisplayChanges,
  getAuditEntityLabel,
  localizeAuditReason,
} from "@/modules/roles/audit-log-localization";
import type { AuditLogDto } from "@/modules/roles/types";
import styles from "./role-permissions.module.css";

export function AuditLogPanel({ logs }: { logs: AuditLogDto[] }) {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("ALL");
  const [period, setPeriod] = useState("30");
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const [referenceTime] = useState(() => Date.now());
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("az"));
  const actors = useMemo(() => [...new Set(logs.map((log) => log.actorName))].toSorted((a, b) => a.localeCompare(b, "az")), [logs]);
  const filtered = useMemo(() => {
    const threshold = period === "ALL" ? 0 : referenceTime - Number(period) * 86_400_000;
    return logs.filter((log) => (actor === "ALL" || log.actorName === actor) && new Date(log.createdAt).getTime() >= threshold && (!deferredQuery || `${log.actorName} ${log.actorEmail ?? ""} ${getAuditActionLabel(log.action)} ${getAuditEntityLabel(log.entityType)} ${localizeAuditReason(log.reason)}`.toLocaleLowerCase("az").includes(deferredQuery)));
  }, [actor, deferredQuery, logs, period, referenceTime]);
  const today = logs.filter((log) => isTodayBaku(log.createdAt)).length;
  const selectedChanges = useMemo(
    () => selected ? getAuditDisplayChanges(selected.before, selected.after) : [],
    [selected],
  );

  return <section className={styles.auditPanel}>
    <div className={styles.auditStats}>
      <div><Activity /><span><strong>{logs.length}</strong> son əməliyyat</span></div>
      <div><Clock3 /><span><strong>{today}</strong> bu gün</span></div>
      <div><UserRound /><span><strong>{actors.length}</strong> əməkdaş</span></div>
    </div>
    <div className={styles.auditToolbar}>
      <label className={styles.searchBox}><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Əməkdaş, əməliyyat və ya obyekt axtar..." /></label>
      <select aria-label="Əməkdaş filtri" value={actor} onChange={(event) => setActor(event.target.value)}><option value="ALL">Bütün əməkdaşlar</option>{actors.map((name) => <option key={name}>{name}</option>)}</select>
      <select aria-label="Tarix filtri" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="1">Bu gün</option><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="ALL">Bütün tarix</option></select>
      <Badge variant="secondary">{filtered.length} qeyd</Badge>
    </div>
    <div className={styles.auditTableWrap} data-erp-table-scroll="">
      <table className={`${styles.auditTable} erp-audit-table`} data-erp-table="" data-erp-sticky-first="">
        <thead><tr><th>Tarix və saat</th><th>Əməkdaş</th><th>Əməliyyat</th><th>Obyekt</th><th>Səbəb</th><th /></tr></thead>
        <tbody>{filtered.map((log) => <tr key={log.id}>
          <td><strong>{formatTime(log.createdAt)}</strong><small>{formatDate(log.createdAt)}</small></td>
          <td><strong>{log.actorName}</strong><small>{log.actorEmail ?? "Sistem əməliyyatı"}</small></td>
          <td><Badge variant="outline">{getAuditActionLabel(log.action)}</Badge></td>
          <td><strong>{getAuditEntityLabel(log.entityType)}</strong><small>{log.entityId?.slice(0, 8) ?? "—"}</small></td>
          <td><span>{log.reason ? localizeAuditReason(log.reason) : "—"}</span></td>
          <td><Button variant="ghost" size="icon-sm" aria-label="Jurnal qeydinin detallarına bax" onClick={() => setSelected(log)}><Eye /></Button></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length ? <div className={styles.empty}>Seçilmiş filtrlərə uyğun jurnal qeydi yoxdur.</div> : null}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <DialogContent className={styles.auditDialog}>
        <DialogHeader className={styles.auditDialogHeader}>
          <span className={styles.auditDialogEyebrow}><Activity /> Fəaliyyət qeydi</span>
          <DialogTitle>{selected ? getAuditActionLabel(selected.action) : "Jurnal qeydinin detalları"}</DialogTitle>
          <DialogDescription>
            {selected
              ? `${getAuditEntityLabel(selected.entityType)} üzrə edilən əməliyyatın aydın xülasəsi`
              : "Əməliyyat haqqında məlumat"}
          </DialogDescription>
        </DialogHeader>

        {selected ? <AuditLogDetail log={selected} changes={selectedChanges} /> : null}
      </DialogContent>
    </Dialog>
  </section>;
}

function AuditLogDetail({
  log,
  changes,
}: {
  log: AuditLogDto;
  changes: ReturnType<typeof getAuditDisplayChanges>;
}) {
  const changeCopy = getChangeCopy(log, changes.length);

  return <div className={styles.auditDetail} data-dialog-scroll-body="">
    <section className={styles.auditOverview} aria-label="Əməliyyat xülasəsi">
      <div className={styles.auditActorCard}>
        <span className={styles.auditActorAvatar} aria-hidden="true">{getInitials(log.actorName)}</span>
        <div>
          <span>İcra edən</span>
          <strong>{log.actorName}</strong>
          <small>{log.actorEmail ?? "Sistem əməliyyatı"}</small>
        </div>
      </div>

      <div className={styles.auditFacts}>
        <div>
          <CalendarClock aria-hidden="true" />
          <span>Tarix və saat</span>
          <strong>{formatDateTime(log.createdAt)}</strong>
        </div>
        <div>
          <FileText aria-hidden="true" />
          <span>Əlaqəli bölmə</span>
          <strong>{getAuditEntityLabel(log.entityType)}</strong>
        </div>
      </div>
    </section>

    {log.reason ? <section className={styles.auditReason} aria-label="Əməliyyat qeydi">
      <span><FileText aria-hidden="true" /> Əməliyyat qeydi</span>
      <p>{localizeAuditReason(log.reason)}</p>
    </section> : null}

    <section className={styles.auditChanges} aria-labelledby="audit-change-heading">
      <header>
        <div>
          <span className={styles.auditSectionEyebrow}>Məlumatlar</span>
          <h3 id="audit-change-heading">{changeCopy.title}</h3>
        </div>
        {changes.length ? <span className={styles.auditChangeCount}>{changes.length} qeyd</span> : null}
      </header>
      <p className={styles.auditSectionDescription}>{changeCopy.description}</p>

      {changes.length ? <div className={styles.auditChangeList}>
        {changes.map((change) => <article
          key={change.id}
          className={`${styles.auditChangeRow} ${getChangeClassName(change.type)}`}
        >
          <span className={styles.auditChangeIcon} aria-hidden="true"><CheckCircle2 /></span>
          <div className={styles.auditChangeContent}>
            <div className={styles.auditChangeHeading}>
              <strong>{change.label}</strong>
              <span>{getChangeTypeLabel(change.type)}</span>
            </div>
            {change.type === "changed" ? <div className={styles.auditValueFlow}>
              <span>{change.previous}</span>
              <ArrowRight aria-hidden="true" />
              <strong>{change.current}</strong>
            </div> : <div className={styles.auditSingleValue}>
              <span>{change.type === "added" ? "Qeydə alınan" : "Əvvəlki məlumat"}</span>
              <strong>{change.current ?? change.previous}</strong>
            </div>}
          </div>
        </article>)}
      </div> : <div className={styles.auditNoChanges}>
        <CheckCircle2 aria-hidden="true" />
        <div><strong>Əlavə dəyişiklik yoxdur</strong><p>Bu əməliyyat üçün ayrıca məlumat saxlanılmayıb.</p></div>
      </div>}
    </section>
  </div>;
}

function getChangeCopy(log: AuditLogDto, count: number) {
  if (log.before == null && log.after != null) {
    return {
      title: "Qeydə alınan məlumatlar",
      description: count ? "Əməliyyat zamanı əlavə edilən əsas məlumatlar." : "Əməliyyat uğurla qeydə alınıb.",
    };
  }
  if (log.before != null && log.after == null) {
    return {
      title: "Silmədən əvvəlki məlumatlar",
      description: count ? "Silinən qeyddə olan əsas məlumatlar." : "Qeyd sistemdən silinib.",
    };
  }
  return {
    title: "Nə dəyişdi?",
    description: count ? "Yalnız dəyişən məlumatlar aşağıda göstərilir." : "Əməliyyat qeydə alınıb, məlumatlarda görünən fərq yoxdur.",
  };
}

function getChangeClassName(type: "added" | "removed" | "changed") {
  if (type === "added") return styles.auditChangeAdded;
  if (type === "removed") return styles.auditChangeRemoved;
  return styles.auditChangeUpdated;
}

function getChangeTypeLabel(type: "added" | "removed" | "changed") {
  if (type === "added") return "Əlavə edildi";
  if (type === "removed") return "Silindi";
  return "Dəyişdirildi";
}

function getInitials(name: string) {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("az")).join("") || "S";
}

const bakuOptions = { timeZone: "Asia/Baku" } as const;
const monthLabels = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
function formatTime(value: string) { return new Intl.DateTimeFormat("az-AZ", { ...bakuOptions, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function formatDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { ...bakuOptions, day: "2-digit", month: "2-digit", year: "numeric" })
    .formatToParts(new Date(value));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${monthLabels[month - 1] ?? ""} ${year}`.trim();
}
function formatDateTime(value: string) { return `${formatDate(value)}, ${formatTime(value)}`; }
function isTodayBaku(value: string) { return formatDate(value) === formatDate(new Date().toISOString()); }
