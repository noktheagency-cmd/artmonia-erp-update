alter table erp.slot_sessions
  add column if not exists location_override text;

revoke all on table erp.slot_sessions from anon, authenticated;
