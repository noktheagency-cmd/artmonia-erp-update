import { z } from "zod";
import { requireErpActor } from "@/server/auth/actor";
import { getFircaAdminData } from "@/modules/firca/admin-queries";
import { FircaPanel } from "@/modules/firca/panel";
import "@/modules/firca/firca.css";
export const dynamic="force-dynamic";
export default async function FircaPage({searchParams}:{searchParams:Promise<{status?:string;student?:string}>}) {
  const actor=await requireErpActor("attendance.manage");const params=await searchParams;
  const status=z.enum(["submitted","accepted","rejected"]).catch("submitted").parse(params.status);
  const studentId=z.string().uuid().optional().catch(undefined).parse(params.student);
  return <FircaPanel data={await getFircaAdminData(actor,status,studentId)} status={status} studentId={studentId??""}/>;
}
