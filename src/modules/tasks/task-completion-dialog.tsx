"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TASK_COMPLETION_NOTE_MAX_LENGTH } from "@/modules/tasks/task-status-constants";
import "./task-completion-dialog.css";

export function TaskCompletionDialog({
  taskTitle,
  open,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  taskTitle: string;
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (completionNote: string) => void;
}) {
  const [note, setNote] = useState("");
  const normalizedNote = note.trim();

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    if (!nextOpen) setNote("");
    onOpenChange(nextOpen);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedNote || pending) return;
    onConfirm(normalizedNote);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="task-completion-dialog">
        <DialogHeader>
          <span className="task-completion-dialog-icon" aria-hidden="true">
            <ClipboardCheck size={22} />
          </span>
          <DialogTitle>Taskı tamamla</DialogTitle>
          <DialogDescription>
            “{taskTitle}” üçün görülən işi qısa və aydın qeyd edin. Bu qeyd taskın tamamlanma məlumatında saxlanılacaq.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <label className="task-completion-note-field">
            <span>Tamamlanma qeydi <strong>*</strong></span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={5}
              required
              autoFocus
              maxLength={TASK_COMPLETION_NOTE_MAX_LENGTH}
              placeholder="Məsələn: Hesabat hazırlandı, rəhbərə göndərildi və təsdiq alındı."
              aria-describedby="task-completion-note-help"
            />
            <small id="task-completion-note-help">
              {note.length}/{TASK_COMPLETION_NOTE_MAX_LENGTH} simvol
            </small>
          </label>

          {error ? <p className="task-completion-dialog-error" role="alert">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => changeOpen(false)}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={pending || !normalizedNote}>
              <CheckCircle2 data-icon="inline-start" />
              {pending ? "Tamamlanır..." : "Qeyd et və tamamla"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
