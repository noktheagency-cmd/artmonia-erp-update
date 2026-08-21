BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  inactive_teacher_count integer;
  inactive_program_count integer;
  protected_payout_count integer;
  italy_enrollment_count integer;
  italy_dependency_count integer;
  deleted_teacher_count integer;
  deleted_program_count integer;
BEGIN
  SELECT count(*)
  INTO inactive_teacher_count
  FROM erp.teachers
  WHERE is_active = false
    AND full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif', 'Yegane');

  SELECT count(*)
  INTO inactive_program_count
  FROM erp.programs
  WHERE is_active = false
    AND name = 'İtaliya proqramı';

  IF inactive_teacher_count = 0 AND inactive_program_count = 0 THEN
    RETURN;
  END IF;

  IF inactive_teacher_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 reviewed inactive teacher records, found %', inactive_teacher_count;
  END IF;

  IF inactive_program_count <> 1 THEN
    RAISE EXCEPTION 'Expected the reviewed inactive Italy program, found %', inactive_program_count;
  END IF;

  SELECT count(*)
  INTO protected_payout_count
  FROM erp.teacher_payouts payout
  JOIN erp.teachers teacher ON teacher.id = payout.teacher_id
  WHERE teacher.is_active = false
    AND teacher.full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif', 'Yegane')
    AND (
      payout.status <> 'DRAFT'::erp."ApprovalStatus"
      OR payout.eligible_revenue <> 0
      OR payout.adjustment_amount <> 0
      OR payout.payout_amount <> 0
      OR EXISTS (
        SELECT 1
        FROM erp.teacher_payout_lines line
        WHERE line.payout_id = payout.id
      )
    );

  IF protected_payout_count > 0 THEN
    RAISE EXCEPTION 'Inactive teacher cleanup stopped: % protected payout records exist', protected_payout_count;
  END IF;

  SELECT count(*)
  INTO italy_enrollment_count
  FROM erp.enrollments enrollment
  JOIN erp.programs program ON program.id = enrollment.program_id
  WHERE program.is_active = false
    AND program.name = 'İtaliya proqramı';

  IF italy_enrollment_count <> 1 THEN
    RAISE EXCEPTION 'Expected 1 reviewed Italy enrollment, found %', italy_enrollment_count;
  END IF;

  SELECT count(*)
  INTO italy_dependency_count
  FROM erp.enrollments enrollment
  JOIN erp.programs program ON program.id = enrollment.program_id
  WHERE program.is_active = false
    AND program.name = 'İtaliya proqramı'
    AND (
      EXISTS (SELECT 1 FROM erp.student_schedule_assignments item WHERE item.enrollment_id = enrollment.id)
      OR EXISTS (SELECT 1 FROM erp.lessons item WHERE item.enrollment_id = enrollment.id)
      OR EXISTS (SELECT 1 FROM erp.attendance_records item WHERE item.enrollment_id = enrollment.id)
      OR EXISTS (SELECT 1 FROM erp.invoices item WHERE item.enrollment_id = enrollment.id)
      OR EXISTS (SELECT 1 FROM erp.teacher_payout_lines item WHERE item.enrollment_id = enrollment.id)
      OR EXISTS (SELECT 1 FROM erp.hr_bonus_teacher_cohorts item WHERE item.enrollment_id = enrollment.id)
    );

  IF italy_dependency_count > 0 THEN
    RAISE EXCEPTION 'Italy enrollment has protected operational or financial history';
  END IF;

  INSERT INTO erp.audit_logs (
    id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    reason,
    created_at
  )
  SELECT
    gen_random_uuid(),
    'teacher.hard_delete_inactive',
    'teacher',
    teacher.id,
    jsonb_build_object(
      'fullName', teacher.full_name,
      'isActive', teacher.is_active,
      'enrollmentCount', (SELECT count(*) FROM erp.enrollments enrollment WHERE enrollment.teacher_id = teacher.id),
      'payoutCount', (SELECT count(*) FROM erp.teacher_payouts payout WHERE payout.teacher_id = teacher.id)
    ),
    jsonb_build_object('studentsPreserved', true, 'teacherAssignmentRemoved', true),
    'İstifadəçi təsdiqi ilə passiv müəllim profili silindi; tələbələr qorundu',
    now()
  FROM erp.teachers teacher
  WHERE teacher.is_active = false
    AND teacher.full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif', 'Yegane');

  INSERT INTO erp.audit_logs (
    id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    reason,
    created_at
  )
  SELECT
    gen_random_uuid(),
    'program.hard_delete_inactive',
    'program',
    program.id,
    jsonb_build_object(
      'name', program.name,
      'isActive', program.is_active,
      'enrollmentCount', (SELECT count(*) FROM erp.enrollments enrollment WHERE enrollment.program_id = program.id)
    ),
    jsonb_build_object('studentPreserved', true, 'programAssignmentRemoved', true),
    'İstifadəçi təsdiqi ilə passiv proqram silindi; tələbə qorundu',
    now()
  FROM erp.programs program
  WHERE program.is_active = false
    AND program.name = 'İtaliya proqramı';

  DELETE FROM erp.teacher_payouts payout
  USING erp.teachers teacher
  WHERE payout.teacher_id = teacher.id
    AND teacher.is_active = false
    AND teacher.full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif', 'Yegane')
    AND payout.status = 'DRAFT'::erp."ApprovalStatus"
    AND payout.eligible_revenue = 0
    AND payout.adjustment_amount = 0
    AND payout.payout_amount = 0
    AND NOT EXISTS (
      SELECT 1
      FROM erp.teacher_payout_lines line
      WHERE line.payout_id = payout.id
    );

  UPDATE erp.enrollments enrollment
  SET teacher_id = NULL,
      updated_at = now()
  FROM erp.teachers teacher
  WHERE enrollment.teacher_id = teacher.id
    AND teacher.is_active = false
    AND teacher.full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif');

  DELETE FROM erp.enrollments enrollment
  USING erp.programs program
  WHERE enrollment.program_id = program.id
    AND program.is_active = false
    AND program.name = 'İtaliya proqramı';

  DELETE FROM erp.teachers
  WHERE is_active = false
    AND full_name IN ('Camaləddinova Əminə', 'Məmmədzadə Vaqif', 'Yegane');
  GET DIAGNOSTICS deleted_teacher_count = ROW_COUNT;

  IF deleted_teacher_count <> 3 THEN
    RAISE EXCEPTION 'Expected to delete 3 inactive teachers, deleted %', deleted_teacher_count;
  END IF;

  DELETE FROM erp.programs
  WHERE is_active = false
    AND name = 'İtaliya proqramı';
  GET DIAGNOSTICS deleted_program_count = ROW_COUNT;

  IF deleted_program_count <> 1 THEN
    RAISE EXCEPTION 'Expected to delete the inactive Italy program, deleted %', deleted_program_count;
  END IF;
END
$$;

COMMIT;
