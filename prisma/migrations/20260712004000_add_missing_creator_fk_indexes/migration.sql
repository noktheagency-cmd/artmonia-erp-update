-- Add only the foreign-key indexes identified by the Supabase performance advisor.
-- Partial predicates keep null creator rows out of the index.
CREATE INDEX IF NOT EXISTS lessons_created_by_id_idx
  ON erp.lessons (created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_campaign_reports_created_by_id_idx
  ON erp.marketing_campaign_reports (created_by_id)
  WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_campaigns_created_by_id_idx
  ON erp.marketing_campaigns (created_by_id)
  WHERE created_by_id IS NOT NULL;
