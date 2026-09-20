import { z } from "zod";

export const FIRCA_DEFAULTS = {
  attendance: 20,
  homework: 20,
  comment: 5,
  weeklyCommentLimit: 4,
  minCommentLength: 20,
};
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    minCommentLength: z.number().int().min(1).max(1000),
  })
  .strict()
  .refine(
    (v) => !v.enabled || v.startsAt !== null,
    "Başlanğıc tarixini seçin.",
  );
export const reviewSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(["accepted", "rejected"]),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export const commentEventSchema = z
  .object({
    commentId: z.string().uuid(),
    postId: z.string().uuid(),
    authorAuthUserId: z.string().uuid(),
    postAuthorAuthUserId: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    body: z.string().max(10000),
    revision: z.number().int().positive(),
    deleted: z.boolean(),
    approved: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type CommentEvent = z.infer<typeof commentEventSchema>;

export function normalizeComment(text: string) {
  return text.normalize("NFKC").toLocaleLowerCase("az-AZ").replace(/\s/gu, "");
}
export function qualifiesComment(
  input: {
    body: string;
    parentId: string | null;
    isOwn: boolean;
    deleted: boolean;
    approved: boolean;
  },
  minimum: number,
) {
  const normalized = normalizeComment(input.body);
  return (
    !input.isOwn &&
    !input.parentId &&
    !input.deleted &&
    input.approved &&
    [...normalized].length >= minimum &&
    /[\p{L}\p{N}]/u.test(normalized)
  );
}
export function bakuMonth(date = new Date()) {
  return new Date(date.getTime() + 4 * 3600000).toISOString().slice(0, 7);
}
export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Yanlış ay");
  const start = new Date(month + "-01T00:00:00+04:00");
  const next = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1, -4),
  );
  return { start, end: next };
}
