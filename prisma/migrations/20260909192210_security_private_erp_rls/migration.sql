-- ERP is a server-only schema. Its owner/server roles retain access; browser roles do not.
SET lock_timeout = '5s';
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='erp' AND c.relkind='r' AND c.relname <> '_prisma_migrations' AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE erp.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA erp FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA erp FROM anon, authenticated;
REVOKE USAGE ON SCHEMA erp FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA erp REVOKE ALL ON TABLES FROM anon, authenticated;
RESET lock_timeout;
