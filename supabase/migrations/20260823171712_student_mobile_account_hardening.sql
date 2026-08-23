create index "student_mobile_accounts_updated_by_id_idx"
  on "erp"."student_mobile_accounts" ("updated_by_id");

create policy "No direct client access to student mobile accounts"
  on "erp"."student_mobile_accounts"
  for all
  to anon, authenticated
  using (false)
  with check (false);

do $$
begin
  if to_regclass('public.erp_student_links') is not null then
    execute $migration$
      insert into "erp"."student_mobile_accounts" (
        "student_id", "auth_user_id", "login_email", "status", "invited_at",
        "last_invite_sent_at", "activated_at", "created_at", "updated_at"
      )
      select
        legacy.erp_student_id,
        legacy.user_id,
        lower(btrim(auth_user.email)),
        case
          when legacy.is_active then 'ACTIVE'::"erp"."StudentMobileAccountStatus"
          else 'DISABLED'::"erp"."StudentMobileAccountStatus"
        end,
        legacy.created_at,
        legacy.updated_at,
        case when legacy.is_active then legacy.updated_at else null end,
        legacy.created_at,
        legacy.updated_at
      from "public"."erp_student_links" legacy
      join "auth"."users" auth_user on auth_user.id = legacy.user_id
      where auth_user.email is not null
      on conflict do nothing
    $migration$;
  end if;
end
$$;
