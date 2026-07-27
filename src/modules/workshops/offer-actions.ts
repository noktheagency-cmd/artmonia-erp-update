"use server";

import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { Prisma } from "@/generated/prisma/client";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { safeServerAction } from "@/server/actions/safe-action";
import { z } from "zod";

export type WorkshopOfferAudience = {
  totalParticipants: number;
  emailReady: number;
  whatsappReady: number;
  workshops: Array<{ id: string; title: string; participantCount: number }>;
  participants: Array<{
    key: string;
    fullName: string;
    email: string;
    phone: string;
    workshopIds: string[];
    workshopTitles: string[];
  }>;
};

export type WorkshopOfferInput = {
  purpose: string;
  audienceMode: "all" | "workshops" | "participants";
  workshopIds: string[];
  participantKeys: string[];
};

export type WorkshopOfferResult = {
  campaignTitle: string;
  strategySummary: string;
  totalAudience: number;
  segments: Array<{
    segmentKey: string;
    segmentName: string;
    workshopAffinity: string;
    audienceCount: number;
    audienceInsight: string;
    subject: string;
    emailBody: string;
    whatsappMessage: string;
    callToAction: string;
  }>;
};

type AudienceRow = {
  participantId: string;
  studentId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  eventId: string;
  eventTitle: string;
  eventDate: Date | string;
};

type AudiencePerson = WorkshopOfferAudience["participants"][number] & {
  eventDates: Map<string, number>;
};

const offerInputSchema = z.object({
  purpose: z.string().trim().min(8, "Təklifin məqsədini bir qədər daha ətraflı yazın").max(700),
  audienceMode: z.enum(["all", "workshops", "participants"]),
  workshopIds: z.array(z.string().uuid()).max(100),
  participantKeys: z.array(z.string().min(1).max(220)).max(3000),
});

const offerOutputSchema = z.object({
  campaignTitle: z.string().min(3).max(160),
  strategySummary: z.string().min(20).max(1200),
  segments: z.array(z.object({
    segmentKey: z.string().min(1).max(180),
    segmentName: z.string().min(2).max(160),
    workshopAffinity: z.string().min(2).max(180),
    audienceInsight: z.string().min(10).max(700),
    subject: z.string().min(3).max(180),
    emailBody: z.string().min(20).max(2600),
    whatsappMessage: z.string().min(20).max(1000),
    callToAction: z.string().min(2).max(160),
  })).min(1).max(12),
});

async function getWorkshopOfferAudienceActionImpl(): Promise<WorkshopOfferAudience> {
  await requireMutationActor("workshop.manage");
  const rows = await loadAudienceRows();
  return toPublicAudience(buildPeople(rows));
}

async function generateWorkshopOfferActionImpl(rawInput: WorkshopOfferInput): Promise<WorkshopOfferResult> {
  await requireMutationActor("workshop.manage");
  const input = offerInputSchema.parse(rawInput);
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("AI xidməti hələ konfiqurasiya edilməyib. Sistem administratoru ilə əlaqə saxlayın.");
  }

  const people = buildPeople(await loadAudienceRows());
  const selected = selectAudience(people, input);
  if (selected.length === 0) throw new Error("Təklif üçün ən azı bir iştirakçı seçin");

  const segments = buildSegments(selected, input);
  const segmentContext = segments.map((segment) => ({
    segmentKey: segment.key,
    workshop: segment.workshopTitle,
    audienceCount: segment.people.length,
    sampleNames: segment.people.slice(0, 5).map((person) => person.fullName),
    relatedWorkshops: unique(segment.people.flatMap((person) => person.workshopTitles)).slice(0, 8),
    contacts: {
      email: segment.people.filter((person) => Boolean(person.email)).length,
      whatsapp: segment.people.filter((person) => Boolean(person.phone)).length,
    },
  }));

  const { output } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    output: Output.object({ schema: offerOutputSchema }),
    temperature: 0.72,
    maxOutputTokens: 8000,
    system: [
      "Sən Artmonia üçün Azərbaycan dilində çalışan senior CRM və incəsənət marketinq strateqisən.",
      "Mətnlər səmimi, premium, konkret və satış yönümlü olsun; süni və şablon ifadələrdən uzaq dur.",
      "Hər segmentin keçmiş workshop marağını yeni təkliflə təbii bağla.",
      "Endirim, tarix və qiymət verilməyibsə onları uydurma. Mətnlərdə alıcının adını {ad} placeholder-i ilə fərdiləşdir.",
      "Email mətni və WhatsApp mətni ayrı kanal üslubunda yazılsın.",
    ].join("\n"),
    prompt: [
      `Kampaniyanın məqsədi: ${input.purpose}`,
      "Aşağıdakı auditoriya segmentlərinin hər biri üçün ayrıca cəlbedici təklif hazırla.",
      "segmentKey dəyərini olduğu kimi saxla və hər giriş üçün yalnız bir nəticə qaytar.",
      JSON.stringify(segmentContext, null, 2),
    ].join("\n\n"),
  });

  const segmentMap = new Map(segments.map((segment) => [segment.key, segment]));
  const generated = output.segments
    .filter((segment) => segmentMap.has(segment.segmentKey))
    .map((segment) => ({
      ...segment,
      audienceCount: segmentMap.get(segment.segmentKey)?.people.length ?? 0,
    }));
  if (generated.length === 0) throw new Error("AI segmentlər üzrə nəticə yarada bilmədi. Yenidən cəhd edin.");

  return {
    campaignTitle: output.campaignTitle,
    strategySummary: output.strategySummary,
    totalAudience: selected.length,
    segments: generated,
  };
}

async function loadAudienceRows() {
  const prisma = getPrisma();
  return prisma.$queryRaw<AudienceRow[]>(Prisma.sql`
    select wp.id::text as "participantId", wp.student_id::text as "studentId",
      wp.full_name as "fullName", wp.email, wp.phone,
      we.id::text as "eventId", we.title as "eventTitle", we.event_date as "eventDate"
    from erp.workshop_participants wp
    join erp.workshop_events we on we.id = wp.event_id
    where wp.cancelled_at is null and we.status <> 'CANCELLED'::"erp"."WorkshopEventStatus"
    order by we.event_date desc, wp.assigned_at desc
  `);
}

function buildPeople(rows: AudienceRow[]) {
  const people = new Map<string, AudiencePerson>();
  for (const row of rows) {
    const key = identityKey(row);
    const current = people.get(key) ?? {
      key,
      fullName: row.fullName,
      email: row.email ?? "",
      phone: row.phone ?? "",
      workshopIds: [],
      workshopTitles: [],
      eventDates: new Map<string, number>(),
    };
    if (!current.email && row.email) current.email = row.email;
    if (!current.phone && row.phone) current.phone = row.phone;
    if (!current.workshopIds.includes(row.eventId)) current.workshopIds.push(row.eventId);
    if (!current.workshopTitles.includes(row.eventTitle)) current.workshopTitles.push(row.eventTitle);
    current.eventDates.set(row.eventId, new Date(row.eventDate).getTime());
    people.set(key, current);
  }
  return [...people.values()];
}

function toPublicAudience(people: AudiencePerson[]): WorkshopOfferAudience {
  const workshops = new Map<string, { id: string; title: string; participantCount: number }>();
  for (const person of people) {
    person.workshopIds.forEach((id, index) => {
      const title = person.workshopTitles[index] ?? "Workshop";
      const current = workshops.get(id) ?? { id, title, participantCount: 0 };
      current.participantCount += 1;
      workshops.set(id, current);
    });
  }
  return {
    totalParticipants: people.length,
    emailReady: people.filter((person) => Boolean(person.email)).length,
    whatsappReady: people.filter((person) => Boolean(person.phone)).length,
    workshops: [...workshops.values()].sort((a, b) => b.participantCount - a.participantCount),
    participants: people.map((person) => ({
      key: person.key,
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      workshopIds: person.workshopIds,
      workshopTitles: person.workshopTitles,
    })),
  };
}

function selectAudience(people: AudiencePerson[], input: WorkshopOfferInput) {
  if (input.audienceMode === "all") return people;
  if (input.audienceMode === "workshops") {
    const ids = new Set(input.workshopIds);
    return people.filter((person) => person.workshopIds.some((id) => ids.has(id)));
  }
  const keys = new Set(input.participantKeys);
  return people.filter((person) => keys.has(person.key));
}

function buildSegments(people: AudiencePerson[], input: WorkshopOfferInput) {
  const preferredWorkshopIds = new Set(input.workshopIds);
  const groups = new Map<string, { key: string; workshopTitle: string; people: AudiencePerson[] }>();
  for (const person of people) {
    const candidates = person.workshopIds
      .map((id, index) => ({ id, title: person.workshopTitles[index] ?? "Workshop", date: person.eventDates.get(id) ?? 0 }))
      .filter((event) => input.audienceMode !== "workshops" || preferredWorkshopIds.has(event.id))
      .sort((a, b) => b.date - a.date);
    const primary = candidates[0] ?? { id: "general", title: "Workshop iştirakçıları", date: 0 };
    const current = groups.get(primary.id) ?? { key: primary.id, workshopTitle: primary.title, people: [] };
    current.people.push(person);
    groups.set(primary.id, current);
  }
  const sorted = [...groups.values()].sort((a, b) => b.people.length - a.people.length);
  if (sorted.length <= 12) return sorted;
  const kept = sorted.slice(0, 11);
  kept.push({ key: "other-workshops", workshopTitle: "Digər workshop maraqları", people: sorted.slice(11).flatMap((group) => group.people) });
  return kept;
}

function identityKey(row: AudienceRow) {
  if (row.studentId) return `student:${row.studentId}`;
  const email = row.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = row.phone?.replace(/\D/g, "");
  return phone ? `phone:${phone}` : `participant:${row.participantId}`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export const getWorkshopOfferAudienceAction = safeServerAction(
  getWorkshopOfferAudienceActionImpl,
  "Auditoriya yüklənmədi.",
);
export const generateWorkshopOfferAction = safeServerAction(
  generateWorkshopOfferActionImpl,
  "Təklif hazırlana bilmədi.",
);
