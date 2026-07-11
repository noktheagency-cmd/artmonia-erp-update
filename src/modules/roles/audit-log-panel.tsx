"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Activity, Clock3, Eye, Search, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AuditLogDto } from "@/modules/roles/types";
import styles from "./role-permissions.module.css";

const actionLabels: Record<string, string> = {
  "role.create": "Rol yaradıldı", "role.delete": "Rol silindi", "role.permissions.update": "Rol icazələri dəyişdi",
  "student.create": "Tələbə yaradıldı", "student.update": "Tələbə dəyişdirildi", "student.delete": "Tələbə silindi", "student.status.change": "Tələbə statusu dəyişdi", "student.payment.record": "Ödəniş qeydə alındı",
  "lead.create": "Lead yaradıldı", "lead.update": "Lead dəyişdirildi", "lead.delete": "Lead silindi", "lead.convert": "Lead tələbəyə çevrildi", "lead.stage.change": "Lead mərhələsi dəyişdi",
  "group.membership.add": "Qrupa tələbə əlavə edildi", "group.membership.remove": "Qrupdan tələbə çıxarıldı", "attendance.batch.update": "Davamiyyət qeyd edildi",
  "teacher.create": "Müəllim yaradıldı", "teacher.update": "Müəllim dəyişdirildi", "payment.void": "Ödəniş ləğv edildi",
};

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
    return logs.filter((log) => (actor === "ALL" || log.actorName === actor) && new Date(log.createdAt).getTime() >= threshold && (!deferredQuery || `${log.actorName} ${log.actorEmail ?? ""} ${log.action} ${actionLabels[log.action] ?? ""} ${log.entityType} ${log.reason ?? ""}`.toLocaleLowerCase("az").includes(deferredQuery)));
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
    <div className={styles.auditTableWrap}>
      <table className={styles.auditTable}>
        <thead><tr><th>Tarix və saat</th><th>Əməkdaş</th><th>Əməliyyat</th><th>Obyekt</th><th>Səbəb</th><th /></tr></thead>
        <tbody>{filtered.map((log) => <tr key={log.id}>
          <td><strong>{formatTime(log.createdAt)}</strong><small>{formatDate(log.createdAt)}</small></td>
          <td><strong>{log.actorName}</strong><small>{log.actorEmail ?? "Sistem əməliyyatı"}</small></td>
          <td><Badge variant="outline">{actionLabels[log.action] ?? humanize(log.action)}</Badge><small>{log.action}</small></td>
          <td><strong>{humanize(log.entityType)}</strong><small>{log.entityId?.slice(0, 8) ?? "—"}</small></td>
          <td><span>{log.reason ?? "—"}</span></td>
          <td><Button variant="ghost" size="icon-sm" aria-label="Audit detalına bax" onClick={() => setSelected(log)}><Eye /></Button></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length ? <div className={styles.empty}>Seçilmiş filtrlərə uyğun audit qeydi yoxdur.</div> : null}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className={styles.auditDialog}>
      <DialogHeader><DialogTitle>{selected ? actionLabels[selected.action] ?? humanize(selected.action) : "Audit detalı"}</DialogTitle><DialogDescription>{selected ? `${selected.actorName} · ${formatDateTime(selected.createdAt)} · ${selected.action}` : "Əməliyyatın tam məlumatı"}</DialogDescription></DialogHeader>
      {selected ? <div className={styles.auditDetail}>
        <dl><div><dt>Obyekt</dt><dd>{selected.entityType} · {selected.entityId ?? "—"}</dd></div><div><dt>Səbəb</dt><dd>{selected.reason ?? "Qeyd edilməyib"}</dd></div><div><dt>IP ünvan</dt><dd>{selected.ipAddress ?? "Qeyd edilməyib"}</dd></div></dl>
        <div className={styles.jsonGrid}><section><h4>Əvvəl</h4><pre>{pretty(selected.before)}</pre></section><section><h4>Sonra</h4><pre>{pretty(selected.after)}</pre></section></div>
      </div> : null}
    </DialogContent></Dialog>
  </section>;
}

const bakuOptions = { timeZone: "Asia/Baku" } as const;
function formatTime(value: string) { return new Intl.DateTimeFormat("az-AZ", { ...bakuOptions, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat("az-AZ", { ...bakuOptions, day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return `${formatDate(value)}, ${formatTime(value)}`; }
function isTodayBaku(value: string) { return formatDate(value) === formatDate(new Date().toISOString()); }
function humanize(value: string) { return value.replace(/[._-]+/g, " ").replace(/^./, (letter) => letter.toLocaleUpperCase("az")); }
function pretty(value: unknown) { return value == null ? "Məlumat yoxdur" : JSON.stringify(value, null, 2); }
