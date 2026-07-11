"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { RoleDashboardData } from "@/modules/dashboard/role-dashboard-query";

const chartConfig = {
  value: { label: "Nəticə", color: "var(--role-accent)" },
} satisfies ChartConfig;
const chartMargin = { top: 8, right: 6, left: -18, bottom: 0 } as const;
const barRadius: [number, number, number, number] = [6, 6, 2, 2];

export function RolePerformanceChart({ items }: { items: RoleDashboardData["breakdown"] }) {
  if (!items.length) return <p className="role-dashboard-empty">Göstərici formalaşması üçün məlumat gözlənilir.</p>;

  return (
    <ChartContainer config={chartConfig} className="role-dashboard-chart">
      <BarChart accessibilityLayer data={items} margin={chartMargin}>
        <CartesianGrid vertical={false} strokeDasharray="4 5" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={9} interval={0} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" fill="var(--role-accent)" radius={barRadius} />
      </BarChart>
    </ChartContainer>
  );
}
