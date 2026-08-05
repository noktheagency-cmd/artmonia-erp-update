"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Activity, Clock3, Eye, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  formatAuditSnapshot,
  getAuditActionLabel,
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
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className={styles.auditDialog}>
      <DialogHeader><DialogTitle>{selected ? getAuditActionLabel(selected.action) : "Jurnal qeydinin detalları"}</DialogTitle><DialogDescription>{selected ? `${selected.actorName} · ${formatDateTime(selected.createdAt)} · ${getAuditEntityLabel(selected.entityType)}` : "Əməliyyatın tam məlumatı"}</DialogDescription></DialogHeader>
      {selected ? <div className={styles.auditDetail}>
        <dl><div><dt>Obyekt</dt><dd>{getAuditEntityLabel(selected.entityType)} · {selected.entityId ?? "—"}</dd></div><div><dt>Səbəb</dt><dd>{localizeAuditReason(selected.reason)}</dd></div><div><dt>IP ünvanı</dt><dd>{selected.ipAddress ?? "Qeyd edilməyib"}</dd></div></dl>
        <div className={styles.jsonGrid}><section><h4>Əvvəlki məlumat</h4><pre>{formatAuditSnapshot(selected.before)}</pre></section><section><h4>Yeni məlumat</h4><pre>{formatAuditSnapshot(selected.after)}</pre></section></div>
      </div> : null}
    </DialogContent></Dialog>
  </section>;
}

const bakuOptions = { timeZone: "Asia/Baku" } as const;
function formatTime(value: string) { return new Intl.DateTimeFormat("az-AZ", { ...bakuOptions, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat("az-AZ", { ...bakuOptions, day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return `${formatDate(value)}, ${formatTime(value)}`; }
function isTodayBaku(value: string) { return formatDate(value) === formatDate(new Date().toISOString()); }
