import { studentRequest } from "@/modules/firca/api";
import { getFircaSummary } from "@/modules/firca/service";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return studentRequest(request, (identity) =>
    getFircaSummary(identity.studentId),
  );
}
