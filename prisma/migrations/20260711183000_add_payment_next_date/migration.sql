ALTER TABLE "erp"."payments"
ADD COLUMN "next_payment_at" DATE;

CREATE INDEX "payments_next_payment_at_idx"
ON "erp"."payments" ("next_payment_at");
