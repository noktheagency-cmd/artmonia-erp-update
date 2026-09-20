import { z } from "zod";
import { studentRequest } from "@/modules/firca/api";
import { getSubmission, submitHomework, assertHomeworkAccess } from "@/modules/firca/homework";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-service";
import { getPrisma } from "@/server/db/prisma";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{homeworkId:string}>};
export async function GET(request:Request,ctx:Context) {
  return studentRequest(request,async identity=>{
    const id=z.string().uuid().parse((await ctx.params).homeworkId);
    await assertHomeworkAccess(getPrisma(),identity.studentId,id);
    return getSubmission(identity.studentId,id);
  });
}
export async function POST(request:Request,ctx:Context) {
  return studentRequest(request,async identity=>{
    if(Number(request.headers.get("content-length")??0)>9*1024*1024)throw new MobilePortalError("FILE_TOO_LARGE",413,"Fayl maksimum 8 MB ola bilər.");
    const id=z.string().uuid().parse((await ctx.params).homeworkId);
    const data=await request.formData(); const file=data.get("file");
    if(!(file instanceof File))throw new MobilePortalError("INVALID_FILE",400,"Fayl seçin.");
    return submitHomework(identity.studentId,id,z.string().uuid().parse(data.get("requestKey")),file);
  });
}
