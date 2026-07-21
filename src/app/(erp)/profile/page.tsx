import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const actor = await requireErpActor();
  const employee = await getPrisma().hrEmployee.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!employee) notFound();
  redirect(`/hr/${employee.id}` as Route);
}
