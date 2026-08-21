import { getTeacherDirectoryData } from "@/modules/hr/teacher-directory-data";
import { getHrEmployeeData } from "@/modules/hr/employee-data";
import { deleteEmployeeAction, deleteTeacherAction, updateTeacherAction, updateTeacherSalaryRuleAction } from "@/modules/hr/actions";
import { createStaffAction, updateStaffAction } from "@/modules/hr/staff-actions";
import {
  addBonusProgressAdjustmentAction,
  approveBonusStageAwardsAction,
  cancelBonusCampaignAction,
  createBonusCampaignAction,
  deleteBonusCampaignAction,
  postBonusStageAwardsAction,
  refreshBonusCampaignsAction,
} from "@/modules/hr/bonus-actions";
import { getHrBonusData } from "@/modules/hr/bonus-data";
import { getCorporateCustomerData } from "@/modules/hr/corporate-customer-data";
import {
  createCorporateCustomerAction,
  deleteCorporateCustomerAction,
  updateCorporateCustomerAction,
} from "@/modules/hr/corporate-customer-actions";
import { HrWorkspace } from "@/modules/hr/hr-workspace";

export default async function HrPage() {
  const [teacherData, employeeData, bonusData, corporateData] = await Promise.all([
    getTeacherDirectoryData(),
    getHrEmployeeData(),
    getHrBonusData(),
    getCorporateCustomerData(),
  ]);

  return <HrWorkspace teacherData={teacherData} employeeData={employeeData} bonusData={bonusData} corporateData={corporateData} actions={{ create: createStaffAction, update: updateStaffAction, remove: deleteEmployeeAction, updateTeacherSalary: updateTeacherSalaryRuleAction, updateTeacher: updateTeacherAction, deleteTeacher: deleteTeacherAction, createBonus: createBonusCampaignAction, adjustBonus: addBonusProgressAdjustmentAction, approveBonus: approveBonusStageAwardsAction, postBonus: postBonusStageAwardsAction, cancelBonus: cancelBonusCampaignAction, deleteBonus: deleteBonusCampaignAction, refreshBonuses: refreshBonusCampaignsAction, createCorporate: createCorporateCustomerAction, updateCorporate: updateCorporateCustomerAction, deleteCorporate: deleteCorporateCustomerAction }} />;
}
