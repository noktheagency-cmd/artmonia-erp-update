"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormSelect } from "@/components/ui/select";
import {
  crmPeriodOptions,
  type CrmPeriodValue,
} from "@/modules/crm/period";

export function CrmPeriodSelect({ value }: { value: CrmPeriodValue }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function changePeriod(nextPeriod: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextPeriod === "this_month") {
      params.delete("period");
    } else {
      params.set("period", nextPeriod);
    }

    const query = params.toString();
    router.push(query ? `/crm?${query}` : "/crm");
  }

  return (
    <FormSelect
      name="period"
      value={value}
      onValueChange={changePeriod}
      className="crm-period-select"
      options={crmPeriodOptions}
      aria-label="CRM period"
    />
  );
}
