ALTER TABLE "erp"."marketing_content_items"
ALTER COLUMN "scheduled_at" DROP NOT NULL;

UPDATE "erp"."permissions"
SET "description" = 'Founder təsdiqi gözləyən slide-ı calendar üçün aktiv etmək və ya düzəlişə qaytarmaq'
WHERE "code" = 'marketing.content.approve';
