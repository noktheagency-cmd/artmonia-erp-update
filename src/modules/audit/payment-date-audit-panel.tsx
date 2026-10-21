"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TablePagination, useClientTablePagination } from "@/components/ui/table-pagination";
import type { PaymentDateRiskDto } from "@/modules/audit/session-types";
import styles from "./audit-log.module.css";

export function PaymentDateAuditPanel({ payments }: { payments: PaymentDateRiskDto[] }) {
  const futureCount = payments.filter((payment) => payment.isFutureToday).length;
  const pagination = useClientTablePagination(payments);

  return (
    <section className={styles.auditPanel}>
      <div className={styles.auditStats}>
        <div>
          {payments.length ? <AlertTriangle /> : <CheckCircle2 />}
          <span><strong>{payments.length}</strong> yaradılma tarixindən sonrakı ödəniş</span>
        </div>
        <div>
          <AlertTriangle />
          <span><strong>{futureCount}</strong> bu günə görə gələcək tarix</span>
        </div>
      </div>
      <div className={styles.auditTableWrap} data-erp-table-scroll="">
        <table className={`${styles.auditTable} erp-audit-table`} data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Tələbə</th><th>Məbləğ</th><th>Ödəniş tarixi</th><th>Xidmət ayı</th><th>Yaradılıb</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map((payment) => (
              <tr key={payment.id}>
                <td><strong>{payment.studentName}</strong><small>{payment.studentCode}</small></td>
                <td><strong>{payment.amount} ₼</strong></td>
                <td><strong>{formatDate(payment.paidAt)}</strong></td>
                <td><strong>{formatMonth(payment.paymentMonth)}</strong></td>
                <td><strong>{formatDateTime(payment.createdAt)}</strong></td>
                <td><Badge variant={payment.isFutureToday ? "destructive" : "outline"}>{payment.isFutureToday ? "Gələcək tarix" : "Yoxlanmalıdır"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!payments.length ? <div className={styles.empty}>Riskli ödəniş tarixi tapılmadı.</div> : null}
      </div>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        label="Ödəniş tarixi yoxlaması səhifələri"
      />
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("az-AZ", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}-01T00:00:00.000Z`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baku",
  }).format(new Date(value));
}
