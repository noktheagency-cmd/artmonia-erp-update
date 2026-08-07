-- The next payment date is derived from active group participation.
-- Remove legacy dates for students whose billing is paused or who have no
-- membership in an active group. The date is recreated when participation
-- starts again.
UPDATE "erp"."payments" AS p
SET "next_payment_at" = NULL
FROM "erp"."students" AS s
WHERE s."id" = p."student_id"
  AND p."next_payment_at" IS NOT NULL
  AND (
    s."billing_paused" = TRUE
    OR NOT EXISTS (
      SELECT 1
      FROM "erp"."group_memberships" AS gm
      JOIN "erp"."enrollments" AS e ON e."id" = gm."enrollment_id"
      JOIN "erp"."groups" AS g ON g."id" = gm."group_id"
      WHERE e."student_id" = s."id"
        AND gm."ended_at" IS NULL
        AND g."is_active" = TRUE
    )
  );
