import { Prisma, StudentLifecycleStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";

export type AttendanceStatus = "reserved" | "attended" | "absent" | "cancelled";

export type BookingStudentOption = {
  id: string;
  name: string;
  code: string;
  phone: string;
  program: string;
  teacher: string;
  lifecycleStatus: string;
};

export type BookingRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  program: string;
  teacher: string;
  room: string;
  date: string;
  dayId: string;
  time: string;
  duration: string;
  durationMinutes: number;
  note: string;
  status: AttendanceStatus;
  createdAt: string;
};

export type BookingHistoryEvent = {
  id: string;
  kind: "created" | "attended" | "absent" | "cancelled" | "updated";
  title: string;
  description: string;
  time: string;
};

export type BookingData = {
  defaultDate: string;
  permissions: {
    canCreateReservation: boolean;
    canMarkAttendance: boolean;
  };
  students: BookingStudentOption[];
  bookings: BookingRow[];
  history: BookingHistoryEvent[];
  rooms: string[];
  timeSlots: string[];
  durationOptions: Array<{ value: string; label: string; minutes: number }>;
};

type StudentOptionRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  program: string | null;
  teacher: string | null;
  lifecycleStatus: string;
};

type LessonRow = {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  program: string | null;
  teacher: string | null;
  room: string;
  lessonDate: Date | string;
  startTime: string;
  durationMinutes: number;
  note: string | null;
  status: string;
  createdAt: Date | string;
};

const defaultRooms = ["A Studio", "B Studio", "Digital otaq", "Portret zalı", "Workshop"];
const defaultTimeSlots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];
const defaultDurations = [
  { value: "60", label: "60 dəq", minutes: 60 },
  { value: "90", label: "90 dəq", minutes: 90 },
  { value: "120", label: "120 dəq", minutes: 120 },
];

export async function getBookingData(): Promise<BookingData> {
  const actor = await requireErpActor("student.read");
  const prisma = getPrisma();

  const [studentRows, lessonRows] = await Promise.all([
    prisma.$queryRaw<StudentOptionRow[]>(Prisma.sql`
      with latest_enrollment as (
        select distinct on (e.student_id)
          e.student_id,
          p.name as program,
          t.full_name as teacher
        from erp.enrollments e
        join erp.programs p on p.id = e.program_id
        left join erp.teachers t on t.id = e.teacher_id
        where e.status in ('ACTIVE'::"erp"."EnrollmentStatus", 'PAUSED'::"erp"."EnrollmentStatus")
        order by e.student_id, e.start_date desc, e.created_at desc
      )
      select
        s.id::text as "id",
        s.code,
        c.full_name as "name",
        c.phone_display as "phone",
        le.program,
        le.teacher,
        s.lifecycle_status::text as "lifecycleStatus"
      from erp.students s
      join erp.contacts c on c.id = s.contact_id
      left join latest_enrollment le on le.student_id = s.id
      where s.lifecycle_status in (
        'GROUP_WAITING'::"erp"."StudentLifecycleStatus",
        'ACTIVE'::"erp"."StudentLifecycleStatus",
        'DEBT'::"erp"."StudentLifecycleStatus",
        'FROZEN'::"erp"."StudentLifecycleStatus"
      )
      order by
        case s.lifecycle_status
          when 'GROUP_WAITING'::"erp"."StudentLifecycleStatus" then 0
          when 'ACTIVE'::"erp"."StudentLifecycleStatus" then 1
          else 2
        end asc,
        c.full_name asc
      limit 300
    `),
    prisma.$queryRaw<LessonRow[]>(Prisma.sql`
      select
        l.id::text as "id",
        l.student_id::text as "studentId",
        s.code as "studentCode",
        c.full_name as "studentName",
        p.name as "program",
        t.full_name as "teacher",
        l.room,
        l.lesson_date as "lessonDate",
        l.start_time as "startTime",
        l.duration_minutes as "durationMinutes",
        l.note,
        l.status::text as "status",
        l.created_at as "createdAt"
      from erp.lessons l
      join erp.students s on s.id = l.student_id
      join erp.contacts c on c.id = s.contact_id
      join erp.enrollments e on e.id = l.enrollment_id
      join erp.programs p on p.id = e.program_id
      left join erp.teachers t on t.id = l.teacher_id
      order by l.lesson_date desc, l.start_time asc, l.created_at desc
      limit 180
    `),
  ]);

  const bookings = lessonRows.map(mapLessonRow);
  const rooms = [...new Set([...defaultRooms, ...bookings.map((booking) => booking.room)])];

  return {
    defaultDate: toDateInput(new Date()),
    permissions: {
      canCreateReservation: actor.permissions.has("student.status.change"),
      canMarkAttendance: actor.permissions.has("student.status.change"),
    },
    students: studentRows.map((student) => ({
      id: student.id,
      name: student.name,
      code: student.code,
      phone: student.phone ?? "",
      program: student.program ?? "Proqram seçilməyib",
      teacher: student.teacher ?? "Müəllim seçilməyib",
      lifecycleStatus: formatLifecycleStatus(student.lifecycleStatus),
    })),
    bookings: bookings.sort((left, right) =>
      `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)
    ),
    history: lessonRows.slice(0, 30).map(mapHistoryRow),
    rooms,
    timeSlots: defaultTimeSlots,
    durationOptions: defaultDurations,
  };
}

function mapLessonRow(row: LessonRow): BookingRow {
  const date = toDateInput(row.lessonDate);
  const status = mapLessonStatus(row.status);

  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.studentName,
    studentCode: row.studentCode,
    program: row.program ?? "Proqram seçilməyib",
    teacher: row.teacher ?? "Müəllim seçilməyib",
    room: row.room,
    date,
    dayId: getDayIdFromDate(date),
    time: row.startTime,
    duration: `${row.durationMinutes} dəq`,
    durationMinutes: Number(row.durationMinutes),
    note: row.note ?? "",
    status,
    createdAt: formatDateTime(row.createdAt),
  };
}

function mapHistoryRow(row: LessonRow): BookingHistoryEvent {
  const status = mapLessonStatus(row.status);
  const statusLabel = {
    reserved: "Bron yaradıldı",
    attended: "Gəldi kimi qeyd edildi",
    absent: "Gəlmədi kimi qeyd edildi",
    cancelled: "Ləğv edildi",
  }[status];

  return {
    id: `${row.id}-${row.status}`,
    kind: status === "reserved" ? "created" : status,
    title: statusLabel,
    description: `${row.studentName} - ${toDisplayDate(row.lessonDate)} ${row.startTime}, ${row.room}`,
    time: formatDateTime(row.createdAt),
  };
}

function mapLessonStatus(value: string): AttendanceStatus {
  if (value === "ATTENDED") {
    return "attended";
  }

  if (value === "ABSENT") {
    return "absent";
  }

  if (value === "CANCELLED") {
    return "cancelled";
  }

  return "reserved";
}

function formatLifecycleStatus(value: string) {
  switch (value) {
    case StudentLifecycleStatus.GROUP_WAITING:
      return "Qrup gözləyir";
    case StudentLifecycleStatus.ACTIVE:
      return "Aktiv";
    case StudentLifecycleStatus.DEBT:
      return "Borc";
    case StudentLifecycleStatus.FROZEN:
      return "Dondurulub";
    default:
      return value;
  }
}

function getDayIdFromDate(value: string) {
  const day = new Date(`${value}T00:00:00`).getDay();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][day] ?? "mon";
}

function toDateInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function toDisplayDate(value: Date | string) {
  const [year, month, day] = toDateInput(value).split("-");
  return `${day}.${month}.${year}`;
}

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
