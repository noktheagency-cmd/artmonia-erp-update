"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BellPlus, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

type ReminderAction = (formData: FormData) => unknown | Promise<unknown>;

const reminderKindOptions = [
  { value: "PAYMENT", label: "Ödəniş xatırlatması" },
  { value: "GENERAL", label: "Ümumi bildiriş" },
];

export function StudentReminderDialog({
  studentId,
  studentName,
  defaultDate,
  canManage,
  action,
}: {
  studentId: string;
  studentName: string;
  defaultDate: string;
  canManage: boolean;
  action: ReminderAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");

    startTransition(async () => {
      try {
        unwrapActionResult(await action(formData));
        notifySuccess(
          "Xatırlatma yaradıldı",
          "Seçilmiş tarixdə Balans İcmalında avtomatik görünəcək.",
        );
        form.reset();
        setOpen(false);
        router.refresh();
      } catch (caught) {
        setError(notifyCaughtError(caught, "Xatırlatma yaradılmadı."));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setError("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" type="button" disabled={!canManage}>
          <BellPlus data-icon="inline-start" />
          Bildiriş yarat
        </Button>
      </DialogTrigger>
      <DialogContent className="student-reminder-dialog">
        <DialogHeader>
          <DialogTitle>Tələbə üçün bildiriş yarat</DialogTitle>
          <DialogDescription>
            {studentName} üçün qeyd və xatırlatma tarixini seçin.
          </DialogDescription>
        </DialogHeader>

        <form className="student-reminder-form" onSubmit={submit}>
          <input name="studentId" type="hidden" value={studentId} />

          <div className="field-grid">
            <label className="form-field">
              <span>Bildiriş növü</span>
              <FormSelect
                name="kind"
                defaultValue="PAYMENT"
                options={reminderKindOptions}
              />
            </label>
            <label className="form-field">
              <span>Xatırlatma tarixi</span>
              <DatePicker
                name="reminderDate"
                defaultValue={defaultDate}
                allowClear={false}
                popoverPlacement="floating"
                required
              />
            </label>
          </div>

          <label className="form-field">
            <span>Qeyd</span>
            <textarea
              name="note"
              rows={4}
              minLength={2}
              maxLength={500}
              placeholder="Məsələn: Tələbə bildirdi ki, 3 gün sonra ödəniş edə biləcək."
              required
            />
          </label>

          <p className="student-reminder-hint">
            Bildiriş yalnız təyin edilən gün avtomatik olaraq “Bugünkü işlər” sətrində önə çıxacaq.
          </p>
          {error ? <p className="student-reminder-error" role="alert">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={isPending}>
              <BellPlus data-icon="inline-start" />
              {isPending ? "Yaradılır..." : "Bildirişi yarat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteStudentReminderButton({
  reminderId,
  studentId,
  action,
  compact = false,
}: {
  reminderId: string;
  studentId: string;
  action: ReminderAction;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function completeReminder() {
    const formData = new FormData();
    formData.set("reminderId", reminderId);
    formData.set("studentId", studentId);

    startTransition(async () => {
      try {
        unwrapActionResult(await action(formData));
        notifySuccess("Bildiriş tamamlandı", "Xatırlatma siyahıdan çıxarıldı.");
        router.refresh();
      } catch (error) {
        notifyCaughtError(error, "Bildiriş tamamlanmadı.");
      }
    });
  }

  return (
    <Button
      className={compact ? "student-reminder-complete is-compact" : "student-reminder-complete"}
      type="button"
      variant={compact ? "ghost" : "outline"}
      size="sm"
      disabled={isPending}
      onClick={completeReminder}
      aria-label={isPending ? "Bildiriş tamamlanır" : "Bildirişi tamamla"}
      title={compact ? "Bildirişi tamamla" : undefined}
    >
      <Check data-icon="inline-start" />
      {compact ? null : isPending ? "Gözləyin..." : "Tamamla"}
    </Button>
  );
}
