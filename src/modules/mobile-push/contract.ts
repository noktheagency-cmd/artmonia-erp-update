import { z } from "zod";

export const destinations = ["notifications", "home", "lessons", "journey", "package", "profile", "external"] as const;
const httpsUrl = z.string().url().max(1000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Yalnız HTTPS linki istifadə edin.");
export const campaignSchema = z.object({
  requestKey: z.string().uuid(),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(1000),
  category: z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_.-]*$/),
  destination: z.enum(destinations),
  linkUrl: httpsUrl.nullable(),
  imageUrl: httpsUrl.nullable(),
  priority: z.enum(["normal", "high"]),
  audience: z.enum(["all", "program", "students"]),
  programId: z.string().uuid().nullable(),
  studentIds: z.array(z.string().uuid()).max(500).transform((ids) => [...new Set(ids)].sort()),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((input, ctx) => {
  if (input.audience === "program" && !input.programId)
    ctx.addIssue({ code: "custom", path: ["programId"], message: "Proqram seçin." });
  if (input.audience === "students" && !input.studentIds.length)
    ctx.addIssue({ code: "custom", path: ["studentIds"], message: "Ən azı bir tələbə seçin." });
  if (input.destination === "external" && !input.linkUrl)
    ctx.addIssue({ code: "custom", path: ["linkUrl"], message: "Açılacaq linki daxil edin." });
});
export type CampaignInput = z.infer<typeof campaignSchema>;
export const claimSchema = z.object({ limit: z.number().int().min(1).max(50).default(25) }).strict();
export const acknowledgeSchema = z.object({
  deliveryId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  status: z.enum(["accepted", "delivered", "retry", "failed", "skipped"]),
  providerReference: z.string().trim().min(1).max(300).optional(),
  code: z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/).optional(),
}).strict();
export type DeliveryResult = z.infer<typeof acknowledgeSchema>;
