import "@/modules/finance/finance.css";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/modules/finance/finance-workspace";
import {
  createFinanceExpenseAction,
  deleteFinanceExpenseAction,
  deleteFinancePaymentAction,
  recordFinancePaymentAction,
  updateFinanceExpenseAction,
  updateFinancePaymentAction,
} from "@/modules/finance/actions";
import { getFinanceData } from "@/modules/finance/queries";
import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    type?: string;
    from?: string;
    to?: string;
    source?: string;
  }>;
}) {
  const actor = await requireErpActor();
  const canAccessFinance =
    actor.permissions.has("billing.invoice.read")
    || actor.permissions.has("billing.payment.read")
    || actor.permissions.has("billing.expense.read")
    || actor.permissions.has("billing.entry.create");

  if (!canAccessFinance) {
    redirect("/students" as Route);
  }

  const filters = await searchParams;
  const data = await getFinanceData(filters);

  return (
    <FinanceWorkspace
      data={data}
      recordPaymentAction={recordFinancePaymentAction}
      createExpenseAction={createFinanceExpenseAction}
      updatePaymentAction={updateFinancePaymentAction}
      deletePaymentAction={deleteFinancePaymentAction}
      updateExpenseAction={updateFinanceExpenseAction}
      deleteExpenseAction={deleteFinanceExpenseAction}
    />
  );
}
