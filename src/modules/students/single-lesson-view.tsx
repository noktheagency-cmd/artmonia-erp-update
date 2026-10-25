"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { currentBakuMonthStart } from "@/modules/shared/creation-date-policy";
import { currentBakuDateValue } from "@/lib/baku-date";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { bookSingleLessonAction, markSingleLessonAction, paySingleLessonAction } from "./single-lesson-actions";

export type SingleLessonViewData = {
  q: string; selectedStudent: string;
  students: Array<{value:string;label:string}>; teachers: Array<{value:string;label:string}>; programs: Array<{value:string;label:string}>;
  canCreate: boolean; canBook: boolean; canPay: boolean;
  rows: Array<{id:string;studentId:string;student:string;teacher:string;program:string;date:string;time:string;price:string;status:string;paid:boolean;canMark:boolean;canPay:boolean}>;
};
export function SingleLessonView({ data }: { data: SingleLessonViewData }) {
  const router = useRouter();
  const [newStudent, setNewStudent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState("");
  async function run(action: (form: FormData) => Promise<unknown>, form: FormData, message: string) {
    if (busy) return;
    setBusy(true);
    try { unwrapActionResult(await action(form)); notifySuccess(message); router.refresh(); return true; }
    catch (error) { notifyCaughtError(error, "Əməliyyat alınmadı."); return false; }
    finally { setBusy(false); }
  }
  return <section className="students-command-page">
    <header><h1>Birdəfəlik dərslər</h1><p>Hər gəliş ayrıca qeydə alınır. Aylıq paket, növbəti ay üçün borc və qəbul satışı yaranmır.</p><Link href="/students">Tələbələrə qayıt</Link></header>
    <form method="get" className="field-grid">
      <label className="form-field"><span>Tələbə axtar</span><Input name="q" defaultValue={data.q} placeholder="Ad və ya telefon" maxLength={80}/></label>
      <Button type="submit" variant="outline">Axtar</Button>
    </form>
    {data.canBook || data.canCreate ? <form className="student-create-section" action={async form => {
      const id = requestId || crypto.randomUUID(); setRequestId(id); form.set("requestId", id);
      if (await run(bookSingleLessonAction, form, "Birdəfəlik dərs yaradıldı")) setRequestId("");
    }}>
      <h2>Dərs təyin et</h2>
      {data.canCreate && data.canBook ? <label><input type="checkbox" checked={newStudent} onChange={event => { setNewStudent(event.target.checked); setRequestId(""); }}/> Yeni tələbə üçün profil yarat</label> : null}
      <div className="student-create-grid">
        {newStudent || !data.canBook ? <>
          <label className="form-field"><span>Ad və soyad</span><Input name="fullName" minLength={2} maxLength={120} required/></label>
          <label className="form-field"><span>Telefon</span><Input name="phone" type="tel" minLength={6} maxLength={40} required/></label>
        </> : <label className="form-field"><span>Tələbə</span><FormSelect name="studentId" defaultValue={data.selectedStudent} options={data.students} emptyLabel="Tələbə seçin" searchable required/></label>}
        <label className="form-field"><span>Proqram</span><FormSelect name="programId" options={data.programs} emptyLabel="Proqram seçin" searchable required/></label>
        <label className="form-field"><span>Müəllim</span><FormSelect name="teacherId" options={data.teachers} emptyLabel="Müəllim seçin" searchable required/></label>
        <label className="form-field"><span>Dərs tarixi</span><DatePicker name="date" minValue={currentBakuMonthStart()} defaultValue={currentBakuDateValue()} required allowClear={false}/></label>
        <label className="form-field"><span>Saat</span><Input name="time" type="time" defaultValue="15:00" required/></label>
        <label className="form-field"><span>Müddət (dəqiqə)</span><Input name="duration" type="number" min={15} max={480} defaultValue={120} required/></label>
        <label className="form-field"><span>Otaq / zona</span><Input name="room" maxLength={80}/></label>
        <label className="form-field"><span>Bu dərsin haqqı (AZN)</span><Input name="price" type="number" min="0.01" step="0.01" max="99999" required/></label>
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Saxlanılır…" : "Dərsi yarat"}</Button>
    </form> : null}
    <section className="student-create-section"><h2>Dərs və ödəniş tarixçəsi</h2>
      <p>Son 100 qeyd göstərilir. İştirak edilən, ödənilməyən dərsin haqqı yalnız həmin dərs üzrə borcdur.</p>
      <div className="single-lesson-table-scroll"><table className="single-lesson-table"><thead><tr><th>Tələbə</th><th>Dərs</th><th>Tarix</th><th>Haqq</th><th>Davamiyyət</th><th>Ödəniş</th></tr></thead>
        <tbody>{data.rows.map(row => <tr key={row.id}>
          <th scope="row"><Link href={`/students/${row.studentId}`}>{row.student}</Link></th><td>{row.program}<br/>{row.teacher}</td><td>{row.date}<br/>{row.time}</td><td>{row.price} AZN</td>
          <td>{({RESERVED:"Planlaşdırılıb",ATTENDED:"Gəldi",ABSENT:"Gəlmədi",CANCELLED:"Ləğv edilib"})[row.status] ?? row.status}
            {row.canMark && row.status === "RESERVED" ? <form action={async form => { await run(markSingleLessonAction,form,"Davamiyyət saxlanıldı"); }}>
              <input type="hidden" name="lessonId" value={row.id}/>
              <Button type="submit" name="status" value="ATTENDED" disabled={busy || row.date > currentBakuDateValue()}>Gəldi</Button>
              <Button type="submit" variant="outline" name="status" value="ABSENT" disabled={busy || row.date > currentBakuDateValue()}>Gəlmədi</Button>
              {!row.paid ? <Button type="submit" variant="ghost" name="status" value="CANCELLED" disabled={busy}>Ləğv et</Button> : null}
            </form> : null}
          </td><td>{row.paid ? "Ödənilib" : row.canPay && !["ABSENT","CANCELLED"].includes(row.status) ? <form action={async form => {form.set("requestId",crypto.randomUUID()); await run(paySingleLessonAction,form,"Ödəniş saxlanıldı");}}>
            <input type="hidden" name="lessonId" value={row.id}/>
            <DatePicker name="paidDate" minValue={currentBakuMonthStart()} maxValue={currentBakuDateValue()} defaultValue={currentBakuDateValue()} required allowClear={false}/>
            <FormSelect name="method" defaultValue="CASH" options={[{value:"CASH",label:"Nağd"},{value:"CARD",label:"Kart"},{value:"BANK_TRANSFER",label:"Köçürmə"}]}/>
            <Button type="submit" disabled={busy}>Ödənişi qəbul et</Button>
          </form> : "Ödənilməyib"}</td>
        </tr>)}</tbody>
      </table>{!data.rows.length ? <p>Dərs qeydi yoxdur.</p> : null}</div>
    </section>
  </section>;
}
