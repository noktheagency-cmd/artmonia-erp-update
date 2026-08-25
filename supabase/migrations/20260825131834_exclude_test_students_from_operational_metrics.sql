ALTER TABLE erp.students
  ADD COLUMN is_test_data boolean NOT NULL DEFAULT false;

WITH changed AS (
  UPDATE erp.students s
  SET is_test_data = true
  FROM erp.contacts c
  WHERE c.id = s.contact_id
    AND (
      s.code ILIKE 'TEST%'
      OR c.full_name ILIKE 'TEST%'
    )
  RETURNING s.id, s.code
)
INSERT INTO erp.audit_logs (
  id,
  action,
  entity_type,
  entity_id,
  after_json,
  reason,
  created_at
)
SELECT
  gen_random_uuid(),
  'student.test_data.classify',
  'student',
  changed.id,
  jsonb_build_object('studentCode', changed.code, 'isTestData', true),
  'Test qeydi operativ tələbə və maliyyə göstəricilərindən çıxarıldı',
  now()
FROM changed;

CREATE INDEX students_operational_lifecycle_idx
  ON erp.students (lifecycle_status, id)
  WHERE is_test_data = false;
