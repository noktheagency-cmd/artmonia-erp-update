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
  const [deleting, setDeleting] = useState<Program | null>(null);

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
      setDeleting(null);
    } catch (error) {
      notifyCaughtError(error, "Proqram silinmədi.");
    }
  }

  return <section className="program-manager">
    <div className="program-manager-head"><div><h2>Proqramlar</h2><p>Paket qiymətləri, dərs sayı və mövzular</p></div><Button onClick={() => setEditing({ id:"", name:"", code:"", monthlyFee:"", lessonsPerMonth:"", description:"", lessonTopics:[], isActive:true })} disabled={!canManage}><Plus data-icon="inline-start" />Proqram yarat</Button></div>
    <div className="program-manager-grid">{programs.map(program => <article className="program-card" key={program.id} data-active="true">
      <div><span>Tədris proqramı</span><strong>{program.name}</strong><small>{program.description || "Qeyd yoxdur"}</small></div>
      <div className="program-card-meta"><b>{program.monthlyFee} AZN</b><span>{program.lessonsPerMonth || "—"} dərs / ay</span></div>
      <div className="program-topic-summary"><span>{program.lessonTopics.length} mövzu</span><small>{program.lessonTopics[0] ? `1. ${program.lessonTopics[0]}` : "Mövzu əlavə edilməyib"}</small></div>
      {canManage && <div className="program-card-actions"><Button type="button" variant="ghost" size="icon" aria-label={`${program.name} proqramını redaktə et`} onClick={() => setEditing(program)}><Edit3 /></Button><Button type="button" variant="ghost" size="icon" aria-label={`${program.name} proqramını sil`} onClick={() => setDeleting(program)}><Trash2 /></Button></div>}
    </article>)}</div>
    <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}><DialogContent className="program-dialog"><DialogHeader><DialogTitle>{editing?.id ? "Proqramı redaktə et" : "Yeni proqram"}</DialogTitle><DialogDescription>Proqramın qiymətini, dərs sayını və dərs mövzularını daxil edin.</DialogDescription></DialogHeader>
      <form action={saveProgram} className="student-create-form"><input name="id" type="hidden" value={editing?.id || ""}/><div className="field-grid"><label className="form-field"><span>Proqram adı</span><Input name="name" defaultValue={editing?.name} required /></label><label className="form-field"><span>Kod</span><Input name="code" defaultValue={editing?.code} /></label></div><div className="field-grid"><label className="form-field"><span>Aylıq qiymət</span><Input name="monthlyFee" defaultValue={editing?.monthlyFee} inputMode="decimal" required /></label><label className="form-field"><span>Dərs sayı / ay</span><Input name="lessonsPerMonth" defaultValue={editing?.lessonsPerMonth} inputMode="numeric" /></label></div><label className="form-field"><span>Qeyd</span><Input name="description" defaultValue={editing?.description} maxLength={500}/></label><label className="form-field program-topics-field"><span>Dərs mövzuları</span><textarea name="lessonTopics" rows={8} maxLength={25000} defaultValue={editing?.lessonTopics.join("\n")} placeholder={"Hər sətrə bir mövzu yazın:\nRəng nəzəriyyəsinə giriş\nİşıq və kölgə\nKompozisiya"}/><small>Sıra avtomatik verilir. Tələbə “Gəldi” olduqda növbəti mövzuya keçir.</small></label><DialogFooter><Button type="submit">Yadda saxla</Button></DialogFooter></form>
    </DialogContent></Dialog>
    <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}><DialogContent className="program-dialog program-delete-dialog"><DialogHeader><DialogTitle>Proqramı silmək?</DialogTitle><DialogDescription>“{deleting?.name}” proqramı birdəfəlik silinəcək. Bu əməliyyat üçün səbəb yazmaq məcburidir.</DialogDescription></DialogHeader>
      <form action={deleteProgram} className="program-delete-form"><input name="id" type="hidden" value={deleting?.id || ""}/><label className="form-field"><span>Silmə səbəbi</span><textarea name="reason" rows={4} minLength={3} maxLength={500} required autoFocus placeholder="Proqramın niyə silindiyini yazın..." /></label><small>Minimum 3 simvol daxil edin. Səbəb audit jurnalında saxlanılacaq.</small><DialogFooter><Button type="button" variant="outline" onClick={() => setDeleting(null)}>Ləğv et</Button><Button type="submit" variant="destructive"><Trash2 data-icon="inline-start" />Proqramı sil</Button></DialogFooter></form>
    </DialogContent></Dialog>
  </section>;
}
