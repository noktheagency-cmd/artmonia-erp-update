import "@/modules/students/students.css";
import "@/modules/students/student-profile.css";
import { StudentProfileView } from "@/modules/students/student-profile-view";
import { getStudentDetailData } from "@/modules/students/queries";
import {
  recordStudentPaymentAction,
  deleteStudentAction,
  createStudentEnrollmentAction,
  updateStudentProfileAction,
  updateStudentStatusAction,
} from "@/modules/students/actions";
import { StudentDetailActions } from "@/modules/students/student-detail-actions";
import { StudentMobileAccountCard } from "@/modules/students/student-mobile-account-card";
import {
  disableStudentMobileAccountAction,
  enableStudentMobileAccountAction,
  resendStudentMobileInviteAction,
  resetStudentMobileDeviceAction,
} from "@/modules/students/mobile-account-actions";
import {
  completeStudentReminderAction,
  createStudentReminderAction,
} from "@/modules/students/reminder-actions";
import { StudentFreezePeriods } from "@/modules/students/student-freeze-periods";
import { StudentBillingDeadline } from "@/modules/students/student-billing-deadline";
import { requireErpActor } from "@/server/auth/actor";
import { canEditBillingDeadline } from "@/modules/students/billing-deadline-policy";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStudentDetailData(id);

  if (!data) {
    return (
      <div className="empty-state">Tələbə tapılmadı</div>
    );
  }

  const { student, permissions, createOptions } = data;
  const actor = await requireErpActor("student.read");

  return (
    <StudentProfileView
      student={student}
      canReadAttendance={permissions.canReadAttendance}
      actions={
        <StudentDetailActions
          student={student}
          editOptions={{
            programs: createOptions.programs,
            teachers: createOptions.teachers,
            managers: createOptions.managers,
            campaigns: createOptions.campaigns,
            educationLevels: createOptions.educationLevels,
            discountTypes: createOptions.discountTypes,
            sourceOptions: createOptions.sourceOptions,
          }}
          permissions={permissions}
          recordPaymentAction={recordStudentPaymentAction}
          updateStudentProfileAction={updateStudentProfileAction}
          createStudentEnrollmentAction={createStudentEnrollmentAction}
          updateStudentStatusAction={updateStudentStatusAction}
          deleteStudentAction={deleteStudentAction}
          createStudentReminderAction={createStudentReminderAction}
        />
      }
      mobileAccount={
        <StudentMobileAccountCard
          studentId={student.id}
          contactEmail={student.detail.email}
          account={student.detail.mobileAccount}
          canManage={permissions.canUpdateStudent}
          resendAction={resendStudentMobileInviteAction}
          disableAction={disableStudentMobileAccountAction}
          enableAction={enableStudentMobileAccountAction}
          resetDeviceAction={resetStudentMobileDeviceAction}
        />
      }
      freezePeriods={<StudentFreezePeriods studentId={student.id} />}
      billingDeadline={canEditBillingDeadline(actor.id) ? <StudentBillingDeadline studentId={student.id} /> : null}
      completeReminderAction={completeStudentReminderAction}
    />
  );
}
