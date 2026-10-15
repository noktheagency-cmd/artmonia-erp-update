"use client";
import { useState } from "react";
import { FormSelect } from "@/components/ui/select";
import { receiptPurposeLabels, receiptPurposes } from "./receipt-purpose";
import { listAdmissionLeads } from "./course-sale-actions";

export function ReceiptFields({ studentId }: { studentId?: string }) {
  const [purpose, setPurpose] = useState("RENEWAL");
  const [leads,setLeads]=useState<{id:string;name:string}[]>([]);
  const [message,setMessage]=useState("");
  async function changePurpose(value:string) {
    setPurpose(value);setMessage("");
    if(value==="ADMISSION"&&studentId) {
      try { const r=await listAdmissionLeads(studentId);if(r.ok)setLeads(r.data);else setMessage(r.message); }
      catch { setMessage("Cari qəbul müraciətləri yüklənmədi."); }
    }
  }
  return <>
    <label className="form-field"><span>Ödənişin təyinatı</span><FormSelect name="receiptPurpose" value={purpose} onValueChange={(value)=>void changePurpose(value)} options={receiptPurposes.filter((value) => value !== "UNCLASSIFIED").map((value) => ({ value, label: receiptPurposeLabels[value] }))} required /></label>
    {purpose==="ADMISSION"&&leads.length>0?<label className="form-field"><span>Cari qəbul müraciəti</span><FormSelect name="admissionLeadId" defaultValue="" emptyLabel="Birbaşa / ilkin qəbul müraciəti" options={leads.map(l=>({value:l.id,label:l.name}))}/></label>:null}
    {purpose === "ADMISSION" ? <label className="form-field"><span><input type="checkbox" name="contractConfirmed" required /> Müqavilə imzalanıb</span><small>Satış üçün bu ödəniş ən azı 20 AZN olmalıdır.</small></label> : null}
    {message?<p role="status">{message}</p>:null}
  </>;
}
