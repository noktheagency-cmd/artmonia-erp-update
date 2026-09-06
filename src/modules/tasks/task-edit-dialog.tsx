"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { updateTaskAction } from "@/modules/tasks/actions";
import type { TaskRow, TaskData } from "@/modules/tasks/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

export function TaskEditDialog({ task, employees, onSaved }: { task: TaskRow; employees: TaskData["employees"]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const options = task.ownerUserId && !employees.some((item) => item.value === task.ownerUserId)
    ? [{ value: task.ownerUserId, label: task.ownerName }, ...employees] : employees;
  async function save(formData: FormData) {
    if (pending) return;
    setPending(true);
    try {
      unwrapActionResult(await updateTaskAction(formData));
      setOpen(false);
      onSaved();
      router.refresh();
      notifySuccess("Task yeniləndi");
    } catch (error) { notifyCaughtError(error, "Task yenilənmədi."); }
    finally { setPending(false); }
  }
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}>Redaktə et</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Taskı redaktə et</DialogTitle><DialogDescription>Ad, açıqlama, icraçı və son tarixi dəyişin.</DialogDescription></DialogHeader>
        <form action={save} className="grid gap-4">
          <input type="hidden" name="taskId" value={task.id} />
          <label className="grid gap-2">Task adı<Input name="title" defaultValue={task.title} required minLength={2} maxLength={160} /></label>
          <label className="grid gap-2">Açıqlama<textarea name="description" defaultValue={task.description} maxLength={2000} rows={4} className="rounded-md border p-2" /></label>
          <div className="grid gap-2"><span>İcraçı</span><FormSelect name="ownerUserId" aria-label="İcraçı" defaultValue={task.ownerUserId ?? ""} options={options} /></div>
          <label className="grid gap-2">Son tarix<Input name="dueDate" type="date" defaultValue={task.dueDate} required /></label>
          <div className="grid gap-2"><span>Prioritet</span><FormSelect name="priority" aria-label="Prioritet" defaultValue={task.priority} options={[{ value: "URGENT", label: "Təcili" }, { value: "NORMAL", label: "Normal" }, { value: "LOW", label: "Aşağı" }]} /></div>
          <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Saxlanılır..." : "Yadda saxla"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
