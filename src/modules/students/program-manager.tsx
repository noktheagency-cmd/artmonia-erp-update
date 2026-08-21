"use client";

import { useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudentListData } from "@/modules/students/queries";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";

type Program = StudentListData["createOptions"]["programs"][number];

export function ProgramManager({ programs, canManage, saveAction, deleteAction }: {
  programs: Program[]; canManage: boolean;
  saveAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Program | null>(null);

  async function saveProgram(formData: FormData) {
    try {
      unwrapActionResult(await saveAction(formData));
      setEditing(null);
    } catch (error) {
      notifyCaughtError(error, "Proqram saxlanmadı.");
    }
  }

  async function deleteProgram(formData: FormData) {
    try {
      unwrapActionResult(await deleteAction(formData));
    } catch (error) {
      notifyCaughtError(error, "Proqram silinmədi.");
    }
  }

  return <section className="program-manager">
    <div className="program-manager-head"><div><h2>Proqramlar</h2><p>Paket qiymətləri, dərs sayı və qeydləri</p></div><Button onClick={() => setEditing({ id:"", name:"", monthlyFee:"", lessonsPerMonth:"", description:"", isActive:true })} disabled={!canManage}><Plus data-icon="inline-start" />Proqram yarat</Button></div>
    <div className="program-manager-grid">{programs.map(program => <article className="program-card" key={program.id} data-active="true">
      <div><span>Tədris proqramı</span><strong>{program.name}</strong><small>{program.description || "Qeyd yoxdur"}</small></div>
      <div className="program-card-meta"><b>{program.monthlyFee} AZN</b><span>{program.lessonsPerMonth || "—"} dərs / ay</span></div>
      {canManage && <div className="program-card-actions"><Button type="button" variant="ghost" size="icon" onClick={() => setEditing(program)}><Edit3 /></Button><form action={deleteProgram}><input name="id" type="hidden" value={program.id}/><Button type="submit" variant="ghost" size="icon"><Trash2 /></Button></form></div>}
    </article>)}</div>
    <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="program-dialog"><DialogHeader><DialogTitle>{editing?.id ? "Proqramı redaktə et" : "Yeni proqram"}</DialogTitle><DialogDescription>Proqramın qiymət, dərs sayı və əsas məlumatlarını daxil edin.</DialogDescription></DialogHeader>
      <form action={saveProgram} className="student-create-form"><input name="id" type="hidden" value={editing?.id || ""}/><div className="field-grid"><label className="form-field"><span>Proqram adı</span><Input name="name" defaultValue={editing?.name} required /></label><label className="form-field"><span>Kod</span><Input name="code" defaultValue={(editing as Program & {code?:string})?.code} /></label></div><div className="field-grid"><label className="form-field"><span>Aylıq qiymət</span><Input name="monthlyFee" defaultValue={editing?.monthlyFee} inputMode="decimal" required /></label><label className="form-field"><span>Dərs sayı / ay</span><Input name="lessonsPerMonth" defaultValue={editing?.lessonsPerMonth} inputMode="numeric" /></label></div><label className="form-field"><span>Qeyd</span><Input name="description" defaultValue={editing?.description} maxLength={500}/></label><DialogFooter><Button type="submit">Yadda saxla</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </section>;
}
