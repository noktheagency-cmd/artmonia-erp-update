"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Power, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { changeRoleUserAccessAction } from "./account-lifecycle-actions";
import type { AccountLifecycleInput, AccountLifecycleOperation } from "./account-lifecycle-policy";
import type { AccountLifecycleResult } from "./account-lifecycle-service";
import type { RoleUserDto } from "./types";
import styles from "./role-permissions.module.css";

const titles = { DISABLE: "Girişi dayandır", ENABLE: "Girişi bərpa et", DELETE: "Giriş hesabını sil" };

export function RoleAccountControls({ user, canChangeStatus, canDelete, onChanged }: {
  user: RoleUserDto;
  canChangeStatus: boolean;
  canDelete: boolean;
  onChanged: (result: AccountLifecycleResult) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AccountLifecycleInput | null>(() => user.pendingAccessChange
    ? { ...user.pendingAccessChange, userId: user.id } : null);
  const [attempted, setAttempted] = useState(Boolean(user.pendingAccessChange));
  const [pending, startTransition] = useTransition();
  const restricted = user.isCurrent || user.isProtected;
  const savedPending = attempted ? draft : user.pendingAccessChange ? { ...user.pendingAccessChange, userId: user.id } : null;

  function begin(operation: AccountLifecycleOperation) {
    setDraft(savedPending ?? {
      userId: user.id, operation, expectedUpdatedAt: user.updatedAt,
      requestKey: crypto.randomUUID(), reason: "",
    });
    setOpen(true);
  }

  function submit() {
    if (!draft) return;
    const payload = { ...draft, reason: draft.reason.trim() };
    setDraft(payload);
    setAttempted(true);
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) form.set(key, value);
    startTransition(async () => {
      try {
        const result = unwrapActionResult(await changeRoleUserAccessAction(form));
        onChanged(result);
        setOpen(false);
        setAttempted(false);
        setDraft(null);
        notifySuccess(result.replayed ? "Hesabın cari vəziyyəti yeniləndi" : payload.operation === "DELETE" ? "Giriş hesabı silindi" : payload.operation === "ENABLE" ? "Giriş bərpa edildi" : "Giriş dayandırıldı");
      } catch (error) {
        notifyCaughtError(error, "Giriş hesabı əməliyyatı tamamlanmadı.");
      } finally {
        router.refresh();
      }
    });
  }

  if (!user.hasLogin || restricted || (!canChangeStatus && !canDelete)) return null;
  if (savedPending && (savedPending.operation === "DELETE" ? !canDelete : !canChangeStatus)) return null;
  return (
    <>
      {savedPending ? (
        <Button type="button" variant="outline" size="sm" onClick={() => begin(savedPending.operation)} disabled={pending}>
          <RotateCcw data-icon="inline-start" /> Yenidən cəhd et
        </Button>
      ) : <>
        {canChangeStatus ? <Button type="button" variant="ghost" size="icon-sm" title={titles[user.isActive ? "DISABLE" : "ENABLE"]} aria-label={`${user.fullName}: ${titles[user.isActive ? "DISABLE" : "ENABLE"]}`} onClick={() => begin(user.isActive ? "DISABLE" : "ENABLE")}><Power /></Button> : null}
        {canDelete ? <Button type="button" variant="destructive" size="icon-sm" title="Giriş hesabını sil" aria-label={`${user.fullName}: giriş hesabını sil`} onClick={() => begin("DELETE")}><Trash2 /></Button> : null}
      </>}
      <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
        <DialogContent className={styles.accountLifecycleDialog}>
          <DialogHeader>
            <DialogTitle>{draft ? titles[draft.operation] : "Giriş hesabı"}</DialogTitle>
            <DialogDescription visible>
              <strong>{user.fullName}</strong>
              {draft?.operation === "DELETE"
                ? " üçün giriş hesabı silinəcək və rollar bu girişdən çıxarılacaq. Əməkdaş profili, satış, ödəniş və audit tarixçəsi saxlanacaq. Yenidən giriş üçün hesab yaratmaq lazımdır."
                : draft?.operation === "ENABLE" ? " yenidən şəxsi kabinetinə daxil ola biləcək."
                  : " şəxsi kabinetə daxil ola bilməyəcək, aktiv sessiyaları bağlanacaq. Sonradan girişini bərpa etmək olar."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <Field>
              <FieldLabel htmlFor={`account-operation-${user.id}`}>Əməliyyatın səbəbi</FieldLabel>
              <textarea
                id={`account-operation-${user.id}`} rows={3} minLength={5} maxLength={500} required
                value={draft?.reason ?? ""} autoComplete="off" readOnly={attempted} disabled={pending}
                onChange={(event) => setDraft((value) => value ? { ...value, reason: event.target.value } : null)}
              />
              {attempted ? <FieldDescription>Əvvəlki sorğu eyni məlumatlarla yenidən yoxlanacaq.</FieldDescription> : null}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Ləğv et</Button>
              <Button type="submit" variant={draft?.operation === "ENABLE" ? "default" : "destructive"} disabled={pending || (draft?.reason.trim().length ?? 0) < 5}>
                {pending ? <LoaderCircle className={styles.accountSpinner} data-icon="inline-start" /> : null}
                {pending ? "İcra edilir…" : savedPending ? "Yenidən cəhd et" : "Təsdiqlə"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
