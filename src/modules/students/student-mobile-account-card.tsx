"use client";

import { useState } from "react";
import { MailCheck, RefreshCcw, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";

type MobileAccount = null | {
  loginEmail: string;
  status: "INVITED" | "ACTIVE" | "DISABLED";
  invitedAt: string;
  lastInviteSentAt: string;
  activatedAt: string;
};

type AccountAction = (formData: FormData) => unknown | Promise<unknown>;

export function StudentMobileAccountCard({
  studentId,
  contactEmail,
  account,
  canManage,
  inviteAction,
  resendAction,
  disableAction,
  enableAction,
}: {
  studentId: string;
  contactEmail: string;
  account: MobileAccount;
  canManage: boolean;
  inviteAction: AccountAction;
  resendAction: AccountAction;
  disableAction: AccountAction;
  enableAction: AccountAction;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const labels = {
    INVITED: "Dəvət göndərilib",
    ACTIVE: "Aktiv",
    DISABLED: "Deaktiv",
  } as const;

  async function run(action: AccountAction, successTitle: string, successMessage: string) {
    setPending(true);
    const formData = new FormData();
    formData.set("studentId", studentId);
    try {
      unwrapActionResult(await action(formData));
      notifySuccess(successTitle, successMessage);
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Mobil hesab əməliyyatı tamamlanmadı.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="student-mobile-account-card" aria-labelledby="student-mobile-account-title">
      <div className="student-mobile-account-copy">
        <span className="student-mobile-account-icon"><Smartphone /></span>
        <div>
          <h2 id="student-mobile-account-title">Mobil tətbiq hesabı</h2>
          {account ? (
            <p>
              <strong>{account.loginEmail}</strong>
              <span className={`student-mobile-account-status is-${account.status.toLowerCase()}`}>
                {labels[account.status]}
              </span>
            </p>
          ) : (
            <p>{contactEmail ? `${contactEmail} ünvanına dəvət göndərilə bilər.` : "Əvvəlcə tələbənin e-poçtunu profilə əlavə edin."}</p>
          )}
          {account ? (
            <small>
              Son link: {account.lastInviteSentAt}
              {account.activatedAt ? ` · Aktivləşib: ${account.activatedAt}` : ""}
            </small>
          ) : null}
        </div>
      </div>
      <div className="student-mobile-account-actions">
        {!account ? (
          <Button type="button" disabled={!canManage || !contactEmail || pending} onClick={() => run(inviteAction, "Mobil dəvət göndərildi", "Tələbə linkdən öz parolunu yaradacaq.")}>
            <MailCheck data-icon="inline-start" /> Hesab yarat
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={!canManage || pending || account.status === "DISABLED"} onClick={() => run(resendAction, "Yeni link göndərildi", "Tələbə parolunu yeniləyə bilər.")}>
              <RefreshCcw data-icon="inline-start" /> Linki yenilə
            </Button>
            {account.status === "DISABLED" ? (
              <Button type="button" disabled={!canManage || pending} onClick={() => run(enableAction, "Mobil hesab aktiv edildi", "Tələbə yenidən daxil ola bilər.")}>
                <ShieldCheck data-icon="inline-start" /> Aktiv et
              </Button>
            ) : (
              <Button type="button" variant="destructive" disabled={!canManage || pending} onClick={() => run(disableAction, "Mobil hesab deaktiv edildi", "Yeni mobil sorğular dərhal bloklandı.")}>
                <ShieldOff data-icon="inline-start" /> Deaktiv et
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
