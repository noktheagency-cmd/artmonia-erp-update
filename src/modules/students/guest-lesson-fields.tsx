"use client";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { currentBakuDateValue } from "@/lib/baku-date";
import { currentBakuMonthStart } from "@/modules/shared/creation-date-policy";
import "./guest-lessons.css";

type Option = { value: string; label: string };
export function GuestLessonFields({ programs, teachers, defaults, booking = false }: {
  programs: Option[]; teachers: Option[]; booking?: boolean;
  defaults?: { programId?: string; teacherId?: string; price?: string; time?: string; duration?: number; room?: string };
}) {
  const name = (registration: string, single: string) => booking ? single : registration;
  return <div className="guest-lesson-fields">
    <label className="form-field"><span>Proqram</span><FormSelect name="programId" aria-label="Proqram" defaultValue={defaults?.programId} options={programs} emptyLabel="Proqram seçin" searchable required /></label>
    <label className="form-field"><span>Müəllim</span><FormSelect name="teacherId" aria-label="Müəllim" defaultValue={defaults?.teacherId} options={teachers} emptyLabel="Müəllim seçin" searchable required /></label>
    <label className="form-field"><span>Gəliş tarixi</span><DatePicker name={name("guestDate", "date")} minValue={currentBakuMonthStart()} defaultValue={currentBakuDateValue()} required allowClear={false} popoverPlacement="floating" /></label>
    <label className="form-field"><span>Saat</span><Input name={name("guestTime", "time")} type="time" defaultValue={defaults?.time ?? "15:00"} required /></label>
    <label className="form-field"><span>Müddət (dəqiqə)</span><Input name={name("guestDuration", "duration")} type="number" defaultValue={defaults?.duration ?? 120} min={15} max={480} required /></label>
    <label className="form-field"><span>Otaq / zona</span><Input name={name("guestRoom", "room")} defaultValue={defaults?.room ?? ""} maxLength={80} /></label>
    <label className="form-field"><span>Bu dərsin haqqı (AZN)</span><Input name={name("guestPrice", "price")} type="number" defaultValue={defaults?.price} min="0.01" max="99999" step="0.01" required /></label>
    <p className="guest-lesson-hint">Yalnız seçilən gün və saat üçün. Növbəti gəliş ayrıca təyin olunur; aylıq borc yaranmır. Ödəniş dərsin qeydindən qəbul edilir.</p>
  </div>;
}
