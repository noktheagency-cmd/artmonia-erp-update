CREATE TABLE "erp"."marketing_strategies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "month" DATE NOT NULL,
  "objective" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "responsible_user_id" UUID,
  "sales_goal" INTEGER NOT NULL DEFAULT 0,
  "lead_goal" INTEGER NOT NULL DEFAULT 0,
  "revenue_goal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_strategies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_strategies_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "marketing_strategies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "erp"."marketing_strategy_expenses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "strategy_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "spent_on" DATE NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_strategy_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "marketing_strategy_expenses_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "erp"."marketing_strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "marketing_strategy_expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "erp"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "marketing_strategies_month_name_key" ON "erp"."marketing_strategies"("month", "name");
CREATE INDEX "marketing_strategies_month_status_idx" ON "erp"."marketing_strategies"("month", "status");
CREATE INDEX "marketing_strategies_responsible_user_id_idx" ON "erp"."marketing_strategies"("responsible_user_id");
CREATE INDEX "marketing_strategies_created_by_id_idx" ON "erp"."marketing_strategies"("created_by_id");
CREATE INDEX "marketing_strategy_expenses_strategy_id_spent_on_idx" ON "erp"."marketing_strategy_expenses"("strategy_id", "spent_on");
CREATE INDEX "marketing_strategy_expenses_created_by_id_idx" ON "erp"."marketing_strategy_expenses"("created_by_id");

REVOKE ALL ON TABLE "erp"."marketing_strategies" FROM anon, authenticated;
REVOKE ALL ON TABLE "erp"."marketing_strategy_expenses" FROM anon, authenticated;
