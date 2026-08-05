INSERT INTO "erp"."permissions" ("id", "code", "description")
VALUES (
  gen_random_uuid(),
  'playbook.guideline.read',
  'Read the Playbook Guideline section and its documents'
)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description";

INSERT INTO "erp"."role_permissions" ("role_id", "permission_id", "scope")
SELECT r.id, p.id, 'ALL'::"erp"."PermissionScope"
FROM "erp"."roles" r
JOIN "erp"."permissions" p ON p.code = 'playbook.guideline.read'
WHERE r.code = 'SUPER_ADMIN'::"erp"."AppRole"
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "scope" = EXCLUDED."scope";

CREATE OR REPLACE FUNCTION private.can_access_playbook_department(
  target_department_id text,
  required_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    required_permission IN ('playbook.read', 'playbook.manage')
    AND (SELECT private.has_erp_permission(required_permission))
    AND EXISTS (
      SELECT 1
      FROM public.playbook_departments department
      WHERE department.id::text = target_department_id
        AND (
          department.section <> 'GUIDELINE'
          OR (SELECT private.has_erp_permission('playbook.guideline.read'))
        )
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_playbook_department(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_playbook_department(text, text) TO authenticated;

DROP POLICY IF EXISTS "Permitted ERP users can read playbook departments" ON public.playbook_departments;
DROP POLICY IF EXISTS "Permitted ERP users can create playbook departments" ON public.playbook_departments;
DROP POLICY IF EXISTS "Permitted ERP users can update playbook departments" ON public.playbook_departments;
DROP POLICY IF EXISTS "Permitted ERP users can delete playbook departments" ON public.playbook_departments;
DROP POLICY IF EXISTS "Permitted ERP users can read playbook documents" ON public.playbook_documents;
DROP POLICY IF EXISTS "Permitted ERP users can create playbook documents" ON public.playbook_documents;
DROP POLICY IF EXISTS "Permitted ERP users can update playbook documents" ON public.playbook_documents;
DROP POLICY IF EXISTS "Permitted ERP users can delete playbook documents" ON public.playbook_documents;
DROP POLICY IF EXISTS "Permitted ERP users can read playbook files" ON storage.objects;
DROP POLICY IF EXISTS "Permitted ERP users can upload playbook files" ON storage.objects;
DROP POLICY IF EXISTS "Permitted ERP users can update playbook files" ON storage.objects;
DROP POLICY IF EXISTS "Permitted ERP users can delete playbook files" ON storage.objects;

CREATE POLICY "Permitted ERP users can read playbook departments"
ON public.playbook_departments
FOR SELECT
TO authenticated
USING (
  (SELECT private.has_erp_permission('playbook.read'))
  AND (
    section <> 'GUIDELINE'
    OR (SELECT private.has_erp_permission('playbook.guideline.read'))
  )
);

CREATE POLICY "Permitted ERP users can create playbook departments"
ON public.playbook_departments
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.has_erp_permission('playbook.manage'))
  AND (
    section <> 'GUIDELINE'
    OR (SELECT private.has_erp_permission('playbook.guideline.read'))
  )
);

CREATE POLICY "Permitted ERP users can update playbook departments"
ON public.playbook_departments
FOR UPDATE
TO authenticated
USING (
  (SELECT private.has_erp_permission('playbook.manage'))
  AND (
    section <> 'GUIDELINE'
    OR (SELECT private.has_erp_permission('playbook.guideline.read'))
  )
)
WITH CHECK (
  (SELECT private.has_erp_permission('playbook.manage'))
  AND (
    section <> 'GUIDELINE'
    OR (SELECT private.has_erp_permission('playbook.guideline.read'))
  )
);

CREATE POLICY "Permitted ERP users can delete playbook departments"
ON public.playbook_departments
FOR DELETE
TO authenticated
USING (
  (SELECT private.has_erp_permission('playbook.manage'))
  AND (
    section <> 'GUIDELINE'
    OR (SELECT private.has_erp_permission('playbook.guideline.read'))
  )
);

CREATE POLICY "Permitted ERP users can read playbook documents"
ON public.playbook_documents
FOR SELECT
TO authenticated
USING (
  (SELECT private.can_access_playbook_department(department_id::text, 'playbook.read'))
);

CREATE POLICY "Permitted ERP users can create playbook documents"
ON public.playbook_documents
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.can_access_playbook_department(department_id::text, 'playbook.manage'))
);

CREATE POLICY "Permitted ERP users can update playbook documents"
ON public.playbook_documents
FOR UPDATE
TO authenticated
USING (
  (SELECT private.can_access_playbook_department(department_id::text, 'playbook.manage'))
)
WITH CHECK (
  (SELECT private.can_access_playbook_department(department_id::text, 'playbook.manage'))
);

CREATE POLICY "Permitted ERP users can delete playbook documents"
ON public.playbook_documents
FOR DELETE
TO authenticated
USING (
  (SELECT private.can_access_playbook_department(department_id::text, 'playbook.manage'))
);

CREATE POLICY "Permitted ERP users can read playbook files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'playbook-documents'
  AND (
    SELECT private.can_access_playbook_department(
      (storage.foldername(storage.objects.name))[1],
      'playbook.read'
    )
  )
);

CREATE POLICY "Permitted ERP users can upload playbook files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'playbook-documents'
  AND (
    SELECT private.can_access_playbook_department(
      (storage.foldername(storage.objects.name))[1],
      'playbook.manage'
    )
  )
);

CREATE POLICY "Permitted ERP users can update playbook files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'playbook-documents'
  AND (
    SELECT private.can_access_playbook_department(
      (storage.foldername(storage.objects.name))[1],
      'playbook.manage'
    )
  )
)
WITH CHECK (
  bucket_id = 'playbook-documents'
  AND (
    SELECT private.can_access_playbook_department(
      (storage.foldername(storage.objects.name))[1],
      'playbook.manage'
    )
  )
);

CREATE POLICY "Permitted ERP users can delete playbook files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'playbook-documents'
  AND (
    SELECT private.can_access_playbook_department(
      (storage.foldername(storage.objects.name))[1],
      'playbook.manage'
    )
  )
);
