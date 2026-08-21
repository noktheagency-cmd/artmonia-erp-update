import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FinanceFinancialClass,
  FinanceTransactionType,
} from "../src/generated/prisma/client";
import { financeCategoryCatalog } from "./finance-category-catalog";

test("finance category catalogue has unique stable codes and valid class pairs", () => {
  const codes = financeCategoryCatalog.map((category) => category.code);
  assert.equal(new Set(codes).size, codes.length);

  for (const category of financeCategoryCatalog) {
    if (category.transactionType === FinanceTransactionType.INCOME) {
      assert.equal(category.financialClass, null, category.code);
    } else if (category.transactionType === FinanceTransactionType.EXPENSE) {
      assert.ok(
        category.financialClass === FinanceFinancialClass.DIRECT_COST ||
          category.financialClass === FinanceFinancialClass.OPEX,
        category.code,
      );
    } else if (category.transactionType === FinanceTransactionType.CAPEX_OUT) {
      assert.equal(category.financialClass, FinanceFinancialClass.CAPEX, category.code);
    } else {
      assert.ok(
        category.financialClass === FinanceFinancialClass.FINANCING ||
          category.financialClass === FinanceFinancialClass.LEGACY_LIABILITY,
        category.code,
      );
    }
  }
});

test("Prisma and Supabase migrations contain the complete catalogue and stay identical", () => {
  const prismaMigration = readFileSync(
    new URL("./migrations/20260821165623_finance_taxonomy_v1/migration.sql", import.meta.url),
    "utf8",
  );
  const supabaseMigration = readFileSync(
    new URL("../supabase/migrations/20260821165623_finance_taxonomy_v1.sql", import.meta.url),
    "utf8",
  );

  assert.equal(supabaseMigration, prismaMigration);
  for (const category of financeCategoryCatalog) {
    assert.match(prismaMigration, new RegExp(`'${category.code}'`), category.code);
  }
});
