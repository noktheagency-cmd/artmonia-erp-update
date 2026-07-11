ALTER TABLE "erp"."hr_bonus_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_bonus_stages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_bonus_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_bonus_progress_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "erp"."hr_bonus_awards" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "erp"."hr_bonus_campaigns" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."hr_bonus_stages" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."hr_bonus_participants" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."hr_bonus_progress_adjustments" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."hr_bonus_awards" FROM anon, authenticated;
