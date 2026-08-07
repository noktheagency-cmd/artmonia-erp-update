"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Gauge,
  GraduationCap,
  Phone,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { cx } from "@/components/ui/cx";
import {
  HrCompactChip,
  HrEmptyState,
  HrMetricTile,
  HrPanel,
  HrPanelHeader,
  HrToolbar,
} from "@/modules/hr/hr-ui";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import type {
  TeacherDirectoryData,
  TeacherDirectoryTeacher,
} from "@/modules/hr/teacher-directory-data";

export function TeacherDirectoryPanel({
  data,
  teacherAccountAction,
}: {
  data: TeacherDirectoryData;
  teacherAccountAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState(data.teachers[0]?.id ?? "");
  const filteredTeachers = useMemo(
    () => data.teachers.filter((teacher) => matchesTeacherQuery(teacher, query)),
    [data.teachers, query]
  );
  const selectedTeacher =
    data.teachers.find((teacher) => teacher.id === selectedTeacherId) ??
    filteredTeachers[0] ??
    data.teachers[0];

  if (!data.permissions.canReadTeachers) {
    return (
      <HrPanel className="teacher-directory-panel">
        <HrEmptyState>Müəllim məlumatları üçün teacher.read icazəsi tələb olunur.</HrEmptyState>
      </HrPanel>
    );
  }

  return (
    <div className="hr-tab-content teacher-directory-tab">
      <HrToolbar className="teacher-directory-toolbar">
        <label className="teacher-directory-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Müəllim, telefon, tələbə və proqram üzrə axtar"
          />
        </label>
        <HrCompactChip tone="info">{filteredTeachers.length} müəllim</HrCompactChip>
      </HrToolbar>

      <div className="teacher-directory-layout">
        <HrPanel className="teacher-directory-list-panel">
          <HrPanelHeader
            icon={GraduationCap}
            eyebrow="Müəllimlər"
            title="Müəllim siyahısı"
            description="Tutum, aktiv tələbə və növbəti dərs real datadan gəlir."
          />
          <div className="teacher-directory-list">
            {filteredTeachers.length > 0 ? (
              filteredTeachers.map((teacher) => (
                <button
                  type="button"
                  key={teacher.id}
                  className={cx(
                    "teacher-directory-card",
                    selectedTeacher?.id === teacher.id && "is-active"
                  )}
                  onClick={() => setSelectedTeacherId(teacher.id)}
                >
                  <div className="teacher-card-main">
                    <span className="teacher-avatar">{getInitials(teacher.fullName)}</span>
                    <div>
                      <strong>{teacher.fullName}</strong>
                      <span>{teacher.phone || "Telefon yoxdur"}</span>
                    </div>
                  </div>
                  <div className="teacher-card-meta">
                    <HrCompactChip tone={teacher.isActive ? "success" : "neutral"}>
                      {teacher.isActive ? "Aktiv" : "Passiv"}
                    </HrCompactChip>
                    <span>{teacher.activeStudentCount}/{teacher.capacity || "∞"} tələbə</span>
                  </div>
                </button>
              ))
            ) : (
              <HrEmptyState>Axtarışa uyğun müəllim tapılmadı.</HrEmptyState>
            )}
          </div>
        </HrPanel>

        {selectedTeacher ? <TeacherDetail teacher={selectedTeacher} data={data} teacherAccountAction={teacherAccountAction} /> : null}
      </div>
    </div>
  );
}

function TeacherDetail({
  teacher,
  data,
  teacherAccountAction,
}: {
  teacher: TeacherDirectoryTeacher;
  data: TeacherDirectoryData;
  teacherAccountAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  async function linkTeacherAccount(formData: FormData) {
    try {
      unwrapActionResult(await teacherAccountAction(formData));
    } catch (error) {
      notifyCaughtError(error, "Müəllim hesabı bağlanmadı.");
    }
  }

  return (
    <div className="teacher-detail-stack">
      <div className="teacher-detail-metrics">
        <HrMetricTile
          icon={UsersRound}
          label="Aktiv tələbə"
          value={teacher.activeStudentCount.toString()}
          helper={`Tutum: ${teacher.capacity || "limit yoxdur"}`}
          tone="success"
        />
        <HrMetricTile
          icon={Gauge}
          label="Doluluq"
          value={`${teacher.utilization}%`}
          helper="aktiv enrollment əsasında"
          tone={teacher.utilization >= 90 ? "danger" : teacher.utilization >= 70 ? "warning" : "info"}
        />
        <HrMetricTile
          icon={CalendarDays}
          label="Növbəti dərs"
          value={teacher.nextLesson}
          helper={teacher.nextLessonStudent}
          tone="info"
        />
      </div>

      <HrPanel className="teacher-detail-panel">
        <HrPanelHeader
          icon={UserRound}
          eyebrow="Müəllim profili"
          title={teacher.fullName}
          description={teacher.phone ? `Əlaqə: ${teacher.phone}` : "Telefon qeyd edilməyib"}
          meta={<StatusChip tone={teacher.isActive ? "success" : "neutral"}>{teacher.isActive ? "Aktiv" : "Passiv"}</StatusChip>}
        />

        {data.permissions.canManageTeacherAccounts ? (
          <form action={linkTeacherAccount} className="teacher-account-link-form">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <label>
              <span>ERP hesabı</span>
              <select name="userId" defaultValue={teacher.userId}>
                <option value="">Bağlanmayıb</option>
                {data.accountOptions.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} · {account.email}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Hesabı bağla</button>
          </form>
        ) : null}

        <div className="teacher-detail-grid">
          <section>
            <div className="teacher-section-title">
              <UsersRound size={16} />
              <span>Müəllim tələbələri</span>
            </div>
            <div className="teacher-student-list">
              {teacher.students.length > 0 ? (
                teacher.students.map((student) => (
                  <div className="teacher-student-row" key={student.id}>
                    <div>
                      <strong>{student.name}</strong>
                      <span>{student.code} · {student.program}</span>
                    </div>
                    <div>
                      <StatusChip tone={student.status === "Borc" ? "warning" : "success"}>
                        {student.status}
                      </StatusChip>
                      <small>{student.balance}</small>
                    </div>
                  </div>
                ))
              ) : (
                <HrEmptyState>Bu müəllimə bağlı aktiv enrollment tapılmadı.</HrEmptyState>
              )}
            </div>
          </section>

          <section>
            <div className="teacher-section-title">
              <BookOpenCheck size={16} />
              <span>Dərs tarixçəsi</span>
            </div>
            <div className="teacher-lesson-list">
              {teacher.lessons.length > 0 ? (
                teacher.lessons.map((lesson) => (
                  <div className="teacher-lesson-row" key={lesson.id}>
                    <span className="teacher-lesson-icon">
                      <Clock3 size={14} />
                    </span>
                    <div>
                      <strong>{lesson.student}</strong>
                      <span>{lesson.program} · Slot {lesson.slot}</span>
                      <small>{lesson.date} / {lesson.time}{lesson.note ? ` · ${lesson.note}` : ""}</small>
                    </div>
                    <StatusChip tone={lesson.status === "Gəldi" ? "success" : lesson.status === "Gəlmədi" ? "danger" : "info"}>
                      {lesson.status}
                    </StatusChip>
                  </div>
                ))
              ) : (
                <HrEmptyState>Lesson cədvəlində bu müəllim üçün qeyd tapılmadı.</HrEmptyState>
              )}
            </div>
          </section>
        </div>
      </HrPanel>

      {teacher.lessons.length === 0 && teacher.assignmentHistory.length > 0 ? (
        <HrPanel className="teacher-assignment-panel">
          <HrPanelHeader
            icon={Phone}
            eyebrow="Fallback"
            title="Müəllim təyinat tarixçəsi"
            description="Dərs tarixçəsi boş olduqda son müəllim dəyişiklikləri göstərilir."
          />
          <div className="teacher-assignment-list">
            {teacher.assignmentHistory.map((assignment) => (
              <div className="teacher-assignment-row" key={assignment.id}>
                <div>
                  <strong>{assignment.student}</strong>
                  <span>{assignment.program}</span>
                </div>
                <div>
                  <HrCompactChip tone={assignment.direction === "Təyin edildi" ? "success" : "neutral"}>
                    {assignment.direction}
                  </HrCompactChip>
                  <small>{assignment.date} · {assignment.reason}</small>
                </div>
              </div>
            ))}
          </div>
        </HrPanel>
      ) : null}
    </div>
  );
}

function matchesTeacherQuery(teacher: TeacherDirectoryTeacher, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("az");

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    teacher.fullName,
    teacher.phone,
    teacher.nextLessonStudent,
    ...teacher.students.flatMap((student) => [student.name, student.code, student.program]),
    ...teacher.lessons.flatMap((lesson) => [lesson.student, lesson.program, lesson.slot]),
  ]
    .join(" ")
    .toLocaleLowerCase("az");

  return haystack.includes(normalizedQuery);
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
