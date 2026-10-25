import "@/modules/students/students.css";
import { StudentList } from "@/modules/students/student-list";
import { getStudentListData } from "@/modules/students/queries";
import { requireErpPageActor } from "@/server/auth/page-actor";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    churn?: string;
    program?: string;
    teacher?: string;
    payment?: string;
    sale?: string;
    attention?: string;
    ids?: string;
    from?: string;
    to?: string;
    dates?: string;
    page?: string;
    pageSize?: string;
    tab?: string;
  }>;
}) {
  await requireErpPageActor("/students");
  const filters = await searchParams;
  const data = await getStudentListData(filters);

  return <StudentList data={data} />;
}
