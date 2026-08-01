import { getTeacherDirectoryData } from "@/modules/hr/teacher-directory-data";
import { getHrEmployeeData } from "@/modules/hr/employee-data";
import { archiveTeacherAction, deleteEmployeeAction, updateTeacherAction, updateTeacherSalaryRuleAction } from "@/modules/hr/actions";
import { createStaffAction, updateStaffAction } from "@/modules/hr/staff-actions";
import {
  addBonusProgressAdjustmentAction,
  approveBonusStageAwardsAction,
  cancelBonusCampaignAction,
  createBonusCampaignAction,
  postBonusStageAwardsAction,
  refreshBonusCampaignsAction,
} from "@/modules/hr/bonus-actions";
import { getHrBonusData } from "@/modules/hr/bonus-data";
import { HrWorkspace } from "@/modules/hr/hr-workspace";

export default async function HrPage() {
  const [teacherData, employeeData, bonusData] = await Promise.all([
    getTeacherDirectoryData(),
    getHrEmployeeData(),
    getHrBonusData(),
  ]);

  return <HrWorkspace teacherData={teacherData} employeeData={employeeData} bonusData={bonusData} actions={{ create: createStaffAction, update: updateStaffAction, remove: deleteEmployeeAction, updateTeacherSalary: updateTeacherSalaryRuleAction, updateTeacher: updateTeacherAction, archiveTeacher: archiveTeacherAction, createBonus: createBonusCampaignAction, adjustBonus: addBonusProgressAdjustmentAction, approveBonus: approveBonusStageAwardsAction, postBonus: postBonusStageAwardsAction, cancelBonus: cancelBonusCampaignAction, refreshBonuses: refreshBonusCampaignsAction }} />;
}
