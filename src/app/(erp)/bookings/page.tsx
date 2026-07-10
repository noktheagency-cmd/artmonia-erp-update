import { redirect } from "next/navigation";
import type { Route } from "next";

export default function LegacyBookingsPage() {
  redirect("/groups" as Route);
}
