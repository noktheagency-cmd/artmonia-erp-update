import { z } from "zod";
import { studentRequest } from "@/modules/firca/api";
import { getFircaLeaderboard } from "@/modules/firca/service";
import { bakuMonth } from "@/modules/firca/contract";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export async function GET(request:Request) { return studentRequest(request,identity=>getFircaLeaderboard(identity.studentId,z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(new URL(request.url).searchParams.get("month")??bakuMonth()))); }
