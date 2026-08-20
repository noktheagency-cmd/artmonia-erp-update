import "@/modules/students/students.css";
import { StudentList } from "@/modules/students/student-list";
import { getStudentListData } from "@/modules/students/queries";

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
    from?: string;
    to?: string;
    page?: string;
    tab?: string;
  }>;
}) {
  const filters = await searchParams;
  const data = await getStudentListData(filters);

  return <StudentList data={data} />;
}
