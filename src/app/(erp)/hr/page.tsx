import { HrPerformancePanel } from "@/modules/hr/hr-performance-panel";
import { getHrPerformanceData } from "@/modules/hr/performance-data";
import { getTeacherDirectoryData } from "@/modules/hr/teacher-directory-data";

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{
    manager?: string;
    month?: string;
  }>;
}) {
  const filters = await searchParams;
  const [data, teacherData] = await Promise.all([
    Promise.resolve(getHrPerformanceData(filters)),
    getTeacherDirectoryData(),
  ]);

  return <HrPerformancePanel data={data} teacherData={teacherData} />;
}
