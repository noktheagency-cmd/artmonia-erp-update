"use client";

import { useState } from "react";
import { FileCheck2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/ui/select";
import { receiptPurposeLabels, receiptPurposes } from "./receipt-purpose";
import { listAdmissionLeads } from "./course-sale-actions";

export function ReceiptFields({
  studentId,
  onPurposeChange,
}: {
  studentId?: string;
  onPurposeChange?: (purpose: string) => void;
}) {
  const [purpose, setPurpose] = useState("RENEWAL");
  const [leads, setLeads] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("");

  async function changePurpose(value: string) {
    setPurpose(value);
    onPurposeChange?.(value);
    setMessage("");
    if (value === "ADMISSION" && studentId) {
      try {
        const result = await listAdmissionLeads(studentId);
        if (result.ok) setLeads(result.data);
        else setMessage(result.message);
      } catch {
        setMessage("Cari qəbul müraciətləri yüklənmədi.");
      }
    }
  }

  return (
    <>
      <label className="form-field">
        <span>Ödənişin təyinatı</span>
        <FormSelect
          name="receiptPurpose"
          value={purpose}
          onValueChange={(value) => void changePurpose(value)}
          options={receiptPurposes
            .filter((value) => value !== "UNCLASSIFIED")
            .map((value) => ({ value, label: receiptPurposeLabels[value] }))}
          required
        />
      </label>

      {purpose === "ADMISSION" && leads.length > 0 ? (
        <label className="form-field">
          <span>Cari qəbul müraciəti</span>
          <FormSelect
            name="admissionLeadId"
            defaultValue=""
            emptyLabel="Birbaşa / ilkin qəbul müraciəti"
            options={leads.map((lead) => ({ value: lead.id, label: lead.name }))}
          />
        </label>
      ) : null}

      {purpose === "ADMISSION" || purpose === "INITIAL_BALANCE" ? (
        <label className="contract-confirm-field">
          <Checkbox name="contractConfirmed" required />
          <span className="contract-confirm-icon" aria-hidden="true">
            <FileCheck2 />
          </span>
          <span className="contract-confirm-copy">
            <strong>Müqavilə imzalanıb</strong>
            {purpose === "ADMISSION" ? (
              <small>Satış üçün bu ödəniş ən azı 20 AZN olmalıdır.</small>
            ) : null}
          </span>
        </label>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
    </>
  );
}
