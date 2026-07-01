import { FinanceWorkspace } from "@/modules/finance/finance-workspace";
import {
  createFinanceExpenseAction,
  recordFinancePaymentAction,
} from "@/modules/finance/actions";
import { getFinanceData } from "@/modules/finance/queries";

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
  }>;
}) {
  const filters = await searchParams;
  const data = await getFinanceData(filters);

  return (
    <FinanceWorkspace
      data={data}
      recordPaymentAction={recordFinancePaymentAction}
      createExpenseAction={createFinanceExpenseAction}
    />
  );
}
