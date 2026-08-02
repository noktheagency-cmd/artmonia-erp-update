-- This Investor login predates the standalone profile flow and was created
-- through the HR staff form. Keep the ERP user and role, but remove only its
-- dependency-free HR directory row.
WITH candidate AS (
  SELECT he.*
  FROM "erp"."hr_employees" he
  JOIN "erp"."users" u ON u.id = he.user_id
  WHERE he.id = '2ac3219a-795e-4d73-ae9c-9767d9cb9c8b'::uuid
    AND u.id = '1d4bed60-2c78-4f01-992c-8507461fc968'::uuid
    AND lower(u.email) = 'anar@artmonia.com'
    AND EXISTS (
      SELECT 1
      FROM "erp"."user_roles" ur
      JOIN "erp"."roles" r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND lower(r.name) = 'investor'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "erp"."hr_bonus_participants" bp
      WHERE bp.employee_id = he.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "erp"."finance_expenses" fe
      WHERE fe.hr_employee_id = he.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM "erp"."hr_staff_notifications" n
      WHERE n.employee_id = he.id
    )
)
INSERT INTO "erp"."audit_logs" (
  "id", "action", "entity_type", "entity_id", "before_json", "after_json", "reason"
)
SELECT
  gen_random_uuid(),
  'hr.employee.detach_standalone_profile',
  'hr_employee',
  candidate.id,
  to_jsonb(candidate),
  jsonb_build_object('userId', candidate.user_id, 'hrEmployeeRemoved', true),
  'Investor giriş profili HR siyahısından ayrıldı'
FROM candidate;

DELETE FROM "erp"."hr_employees" he
WHERE he.id = '2ac3219a-795e-4d73-ae9c-9767d9cb9c8b'::uuid
  AND he.user_id = '1d4bed60-2c78-4f01-992c-8507461fc968'::uuid
  AND EXISTS (
    SELECT 1
    FROM "erp"."users" u
    JOIN "erp"."user_roles" ur ON ur.user_id = u.id
    JOIN "erp"."roles" r ON r.id = ur.role_id
    WHERE u.id = he.user_id
      AND lower(u.email) = 'anar@artmonia.com'
      AND lower(r.name) = 'investor'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "erp"."hr_bonus_participants" bp
    WHERE bp.employee_id = he.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "erp"."finance_expenses" fe
    WHERE fe.hr_employee_id = he.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "erp"."hr_staff_notifications" n
    WHERE n.employee_id = he.id
  );
