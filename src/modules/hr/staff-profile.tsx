"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  Mail,
  MapPin,
  MessageSquareText,
  Pencil,
  Phone,
  Send,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import type {
  HrStaffProfileData,
  HrStaffNotificationRow,
} from "@/modules/hr/staff-profile-data";
import "./staff-profile.css";

const StaffKnowledgeWorkspace = dynamic(
  () => import("@/modules/hr/staff-knowledge-workspace").then((module) => module.StaffKnowledgeWorkspace),
  { loading: () => <div className="staff-profile-panel">Qeydlər və sənədlər yüklənir...</div> },
);

type Action = (formData: FormData) => Promise<unknown>;
type Category = HrStaffNotificationRow["category"];

const categoryMeta: Record<
  Category,
  {
    label: string;
    icon: typeof BellRing;
    title: string;
    message: (name: string) => string;
  }
> = {
  RULE_VIOLATION: {
    label: "Qayda pozuntusu",
    icon: ShieldAlert,
    title: "Daxili iş qaydalarına riayət barədə rəsmi bildiriş",
    message: (name) =>
      `Hörmətli ${name}, daxili iş qaydalarına uyğunluqla bağlı qeydə alınmış hal barədə sizi rəsmi şəkildə məlumatlandırırıq. Xahiş edirik, bildirişlə tanış olduğunuzu təsdiqləyəsiniz və qeyd olunan tələblərə bundan sonrakı fəaliyyətinizdə tam riayət edəsiniz. Zəruri hesab etdiyiniz halda HR komandası ilə izahat görüşü təyin edə bilərsiniz.`,
  },
  PERFORMANCE_WARNING: {
    label: "Performans xəbərdarlığı",
    icon: Clock3,
    title: "Performans gözləntilərinin yaxşılaşdırılması barədə bildiriş",
    message: (name) =>
      `Hörmətli ${name}, cari iş nəticələri üzrə razılaşdırılmış gözləntilərlə faktiki göstəricilər arasında fərq müşahidə edilmişdir. Bu bildiriş inkişaf üçün aydın istiqamət yaratmaq məqsədi daşıyır. Xahiş edirik, rəhbərinizlə növbəti addımları razılaşdırın və müəyyən ediləcək müddət ərzində irəliləyişi görünən şəkildə sənədləşdirin.`,
  },
  INFORMATION: {
    label: "Məlumatlandırma",
    icon: MessageSquareText,
    title: "İş prosesi ilə bağlı məlumatlandırma",
    message: (name) =>
      `Hörmətli ${name}, iş prosesi ilə bağlı aşağıdakı məlumatı diqqətinizə çatdırırıq. Xahiş edirik, məzmunla tanış olun və fəaliyyətinizi qeyd olunan tarix və tələblərə uyğun planlaşdırın. Əlavə sual yarandıqda birbaşa HR komandası ilə əlaqə saxlaya bilərsiniz.`,
  },
  APPRECIATION: {
    label: "Təşəkkür",
    icon: Award,
    title: "Peşəkar töhfənizə görə təşəkkür",
    message: (name) =>
      `Hörmətli ${name}, göstərdiyiniz məsuliyyət, komanda əməkdaşlığı və nəticəyönümlü yanaşma üçün sizə təşəkkür edirik. Töhfəniz həm iş prosesinin keyfiyyətinə, həm də komandanın ümumi nəticələrinə müsbət təsir göstərir. Uğurlarınızın davamını arzulayırıq.`,
  },
  MANUAL: {
    label: "Manual bildiriş",
    icon: Sparkles,
    title: "Fərdi HR bildirişi",
    message: (name) =>
      `Hörmətli ${name}, sizinlə bağlı fərdi HR məlumatını diqqətinizə çatdırırıq. Xahiş edirik, aşağıdakı məzmunla tanış olduqdan sonra bildirişi qəbul etdiyinizi sistem üzərindən təsdiqləyin.`,
  },
};

const statusMeta = {
  SENT: { label: "Göndərildi", className: "sent" },
  READ: { label: "Oxundu", className: "read" },
  ACKNOWLEDGED: { label: "Təsdiqləndi", className: "acknowledged" },
  RESOLVED: { label: "Bağlandı", className: "resolved" },
} as const;

export function StaffProfile({
  data,
  createNotificationAction,
  updateNotificationStatusAction,
  updateStaffAction,
  createNoteAction,
  updateNoteAction,
  finalizeDocumentAction,
}: {
  data: HrStaffProfileData;
  createNotificationAction: Action;
  updateNotificationStatusAction: Action;
  updateStaffAction: Action;
  createNoteAction: Action;
  updateNoteAction: Action;
  finalizeDocumentAction: Action;
}) {
  const router = useRouter();
  const { employee, teacher, permissions } = data;
  const [composerOpen, setComposerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let client: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try {
      client = createSupabaseBrowserClient();
      const channel = client
        .channel("hr-notifications")
        .on("broadcast", { event: "changed" }, ({ payload }) => {
          if (payload?.employeeId === employee.id) router.refresh();
        })
        .subscribe();
      return () => {
        if (client) void client.removeChannel(channel);
      };
    } catch {
      return undefined;
    }
  }, [employee.id, router]);

  useEffect(() => {
    if (!permissions.isOwnProfile) return;
    const unread = data.notifications.filter((item) => item.status === "SENT");
    if (!unread.length) return;
    startTransition(() => {
      void Promise.all(
        unread.map((item) => {
          const form = new FormData();
          form.set("notificationId", item.id);
          form.set("status", "READ");
          return updateNotificationStatusAction(form);
        }),
      )
        .then((results) => {
          results.forEach((result) => unwrapActionResult(result));
          router.refresh();
        })
        .catch((error) =>
          setNotice(notifyCaughtError(error, "Bildiriş statusu yenilənmədi")),
        );
    });
  }, [
    data.notifications,
    permissions.isOwnProfile,
    router,
    updateNotificationStatusAction,
  ]);

  function updateStatus(
    notificationId: string,
    status: "ACKNOWLEDGED" | "RESOLVED",
  ) {
    const form = new FormData();
    form.set("notificationId", notificationId);
    form.set("status", status);
    startTransition(
      () =>
        void updateNotificationStatusAction(form)
          .then((result) => {
            unwrapActionResult(result);
            setNotice(
              status === "RESOLVED"
                ? "Bildiriş bağlandı."
                : "Bildiriş təsdiqləndi.",
            );
            router.refresh();
          })
          .catch((error) =>
            setNotice(notifyCaughtError(error, "Status yenilənmədi")),
          ),
    );
  }

  const activeNotifications = data.notifications.filter(
    (item) => item.status !== "RESOLVED",
  ).length;

  return (
    <section className="staff-profile" aria-busy={pending}>
      <header className="staff-profile-topbar">
        <Link href="/hr" className="staff-profile-back">
          <ArrowLeft /> HR-a qayıt
        </Link>
        <div className="staff-profile-actions">
          {permissions.canManage ? (
            <Button variant="outline" onClick={() => setEditorOpen(true)}>
              <Pencil data-icon="inline-start" /> Redaktə et
            </Button>
          ) : null}
          {permissions.canSendNotification ? (
            <Button onClick={() => setComposerOpen(true)}>
              <BellRing data-icon="inline-start" /> Bildiriş göndər
            </Button>
          ) : null}
        </div>
      </header>

      <section className="staff-profile-hero">
        <div className="staff-profile-identity">
          <div className="staff-profile-avatar">
            {employee.profilePhotoUrl ? (
              <Image
                src={employee.profilePhotoUrl}
                alt=""
                fill
                sizes="112px"
                unoptimized
              />
            ) : (
              <span>{initials(employee.fullName)}</span>
            )}
          </div>
          <div>
            <div className="staff-profile-name-line">
              <h1>{employee.fullName}</h1>
              <Badge
                variant="outline"
                className={`staff-employment-status is-${employee.status.toLowerCase()}`}
              >
                {employmentStatus(employee.status)}
              </Badge>
            </div>
            <p>
              {employee.position} · {employee.department}
            </p>
            <div className="staff-profile-contact">
              <span>
                <Mail /> {employee.email || "E-poçt qeyd edilməyib"}
              </span>
              <span>
                <Phone /> {employee.phone || "Telefon qeyd edilməyib"}
              </span>
              <span>
                <MapPin /> {employee.address || "Ünvan qeyd edilməyib"}
              </span>
            </div>
          </div>
        </div>
        <div className="staff-profile-hero-stats">
          <span>
            <small>Əməkdaş tipi</small>
            <strong>
              {employee.staffType === "TEACHER" ? "Müəllim" : "İşçi"}
            </strong>
          </span>
          <span>
            <small>İş stajı</small>
            <strong>{tenure(employee.hireDate)}</strong>
          </span>
          <span>
            <small>Aktiv bildiriş</small>
            <strong>{activeNotifications}</strong>
          </span>
        </div>
      </section>

      {notice ? (
        <div className="staff-profile-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      ) : null}

      {data.knowledge.permissions.canReadNotes || data.knowledge.permissions.canReadDocuments ? (
        <StaffKnowledgeWorkspace
          employeeId={employee.id}
          employeeName={employee.fullName}
          knowledge={data.knowledge}
          createNoteAction={createNoteAction}
          updateNoteAction={updateNoteAction}
          finalizeDocumentAction={finalizeDocumentAction}
        />
      ) : null}

      <div className="staff-profile-grid">
        <main className="staff-profile-main">
          <section className="staff-profile-panel">
            <PanelHeading
              icon={BellRing}
              title="Bildirişlər"
              description="Göndəriş, oxunma və təsdiq statusları canlı yenilənir"
            />
            <div className="staff-notification-list">
              {data.notifications.length ? (
                data.notifications.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    isOwnProfile={permissions.isOwnProfile}
                    canManage={permissions.canManage}
                    pending={pending}
                    onAcknowledge={() => updateStatus(item.id, "ACKNOWLEDGED")}
                    onResolve={() => updateStatus(item.id, "RESOLVED")}
                  />
                ))
              ) : (
                <EmptyState text="Bu əməkdaş üçün hələ bildiriş göndərilməyib." />
              )}
            </div>
          </section>

          {teacher ? (
            <section className="staff-profile-panel">
              <PanelHeading
                icon={GraduationCap}
                title="Müəllim göstəriciləri"
                description="Cari dərs, tələbə və maaş məlumatları"
              />
              <div className="staff-metric-grid">
                <Metric
                  icon={UsersRound}
                  label="Aktiv tələbə"
                  value={`${teacher.activeStudentCount}/${teacher.capacity || "—"}`}
                />
                <Metric
                  icon={BookOpenCheck}
                  label="Dərs iştirakı"
                  value={`${teacher.attendedLessons}/${teacher.plannedLessons}`}
                />
                <Metric
                  icon={CircleDollarSign}
                  label="Cari hesablanan maaş"
                  value={formatMoney(teacher.estimatedSalary)}
                />
                <Metric
                  icon={CalendarDays}
                  label="Növbəti dərs"
                  value={teacher.nextLesson}
                  compact
                />
              </div>
              <div className="staff-teacher-columns">
                <div>
                  <h3>Son tələbələr</h3>
                  {teacher.students.slice(0, 5).map((student) => (
                    <span key={student.id}>
                      <b>{student.name}</b>
                      <small>
                        {student.program} · {student.status}
                      </small>
                    </span>
                  ))}
                </div>
                <div>
                  <h3>Son dərslər</h3>
                  {teacher.lessons.slice(0, 5).map((lesson) => (
                    <span key={lesson.id}>
                      <b>{lesson.student}</b>
                      <small>
                        {lesson.date} · {lesson.time} · {lesson.status}
                      </small>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {data.timeline.length ? (
            <section className="staff-profile-panel">
              <PanelHeading
                icon={Clock3}
                title="Fəaliyyət tarixçəsi"
                description="Profil üzrə son inzibati dəyişikliklər"
              />
              <div className="staff-timeline">
                {data.timeline.map((item) => (
                  <div key={item.id}>
                    <i />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.reason}</small>
                    </span>
                    <em>
                      {item.actor}
                      <br />
                      {formatDateTime(item.createdAt)}
                    </em>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="staff-profile-aside">
          <section className="staff-profile-panel staff-facts">
            <PanelHeading
              icon={BriefcaseBusiness}
              title="Əmək məlumatları"
              description="Müqavilə və iş detalları"
            />
            <Fact label="İşə başlama" value={formatDate(employee.hireDate)} />
            <Fact
              label="Müqavilə"
              value={contractLabel(employee.contractType)}
            />
            <Fact
              label="Maaş modeli"
              value={
                employee.salaryMode === "PERCENT"
                  ? `${employee.salaryPercent}% faizlə`
                  : formatMoney(employee.salaryAmount)
              }
            />
            <Fact
              label="Son yenilənmə"
              value={formatDateTime(employee.updatedAt)}
            />
          </section>
        </aside>
      </div>

      {composerOpen ? (
        <NotificationComposer
          employeeName={employee.fullName}
          employeeId={employee.id}
          pending={pending}
          onClose={() => setComposerOpen(false)}
          onSubmit={(form) => {
            startTransition(
              () =>
                void createNotificationAction(form)
                  .then((result) => {
                    unwrapActionResult(result);
                    setComposerOpen(false);
                    setNotice(
                      "Bildiriş uğurla göndərildi və status izləməsi başladıldı.",
                    );
                    router.refresh();
                  })
                  .catch((error) =>
                    setNotice(
                      notifyCaughtError(error, "Bildiriş göndərilmədi"),
                    ),
                  ),
            );
          }}
        />
      ) : null}
      {editorOpen ? (
        <StaffDetailsEditor
          employee={employee}
          lookups={data.lookups}
          pending={pending}
          onClose={() => setEditorOpen(false)}
          onSubmit={(form) => {
            startTransition(
              () =>
                void updateStaffAction(form)
                  .then((result) => {
                    unwrapActionResult(result);
                    setEditorOpen(false);
                    setNotice("Əməkdaş məlumatları yeniləndi.");
                    router.refresh();
                  })
                  .catch((error) =>
                    setNotice(notifyCaughtError(error, "Əməkdaş məlumatları yenilənmədi")),
                  ),
            );
          }}
        />
      ) : null}
    </section>
  );
}

function StaffDetailsEditor({
  employee,
  lookups,
  pending,
  onClose,
  onSubmit,
}: {
  employee: HrStaffProfileData["employee"];
  lookups: HrStaffProfileData["lookups"];
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const [staffType, setStaffType] = useState(employee.staffType);
  const [salaryMode, setSalaryMode] = useState(employee.salaryMode);
  const [photoPreview, setPhotoPreview] = useState(employee.profilePhotoUrl);
  const [photoError, setPhotoError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  function changeProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setPhotoError("");
    if (!file) {
      setPhotoPreview(employee.profilePhotoUrl);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.currentTarget.value = "";
      setPhotoPreview(employee.profilePhotoUrl);
      setPhotoError("JPEG, PNG və ya WebP seçin; maksimum ölçü 5 MB-dır.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => setPhotoPreview(String(reader.result ?? "")), { once: true });
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="staff-edit-dialog">
        <DialogHeader>
          <DialogTitle>Əməkdaş detallarını redaktə et</DialogTitle>
          <DialogDescription>
            Şəxsi, iş, status və maaş məlumatlarını yeniləyin. Login və sistem rolları ayrıca idarə olunur.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="staff-edit-form">
          <input type="hidden" name="id" value={employee.id} />
          <div className="staff-edit-photo is-wide">
            <div className="staff-edit-photo-preview" aria-hidden="true">
              {photoPreview ? (
                <Image src={photoPreview} alt="" fill sizes="76px" unoptimized />
              ) : (
                <UsersRound />
              )}
            </div>
            <label>
              <span>Profil şəkli</span>
              <input
                name="profilePhoto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={changeProfilePhoto}
              />
              <small>JPEG, PNG və ya WebP · maksimum 5 MB</small>
              {photoError ? <em role="alert">{photoError}</em> : null}
            </label>
          </div>
          <label className="is-wide">
            <span>Əməkdaş tipi</span>
            <FormSelect
              name="staffType"
              value={staffType}
              onValueChange={(value) => {
                const nextType = value as "EMPLOYEE" | "TEACHER";
                setStaffType(nextType);
                if (nextType === "TEACHER") setSalaryMode("PERCENT");
              }}
              options={[
                { value: "EMPLOYEE", label: "İşçi / inzibati əməkdaş" },
                { value: "TEACHER", label: "Müəllim" },
              ]}
              required
            />
          </label>
          <label>
            <span>Ad soyad</span>
            <Input name="fullName" defaultValue={employee.fullName} required />
          </label>
          <label>
            <span>Əlaqə e-poçtu</span>
            <Input name="email" type="email" defaultValue={employee.email} />
          </label>
          <label>
            <span>Telefon</span>
            <Input name="phone" type="tel" defaultValue={employee.phone} />
          </label>
          <label>
            <span>İşə başlama</span>
            <DatePicker
              name="hireDate"
              aria-label="İşə başlama"
              defaultValue={employee.hireDate}
              allowClear={false}
            />
          </label>
          <label className="is-wide">
            <span>Ünvan</span>
            <Input name="address" defaultValue={employee.address} maxLength={240} />
          </label>
          <label>
            <span>Departament</span>
            <FormSelect
              name="department"
              defaultValue={employee.department}
              options={lookups.departments.map((value) => ({ value, label: value }))}
              searchable
              searchPlaceholder="Departament axtar..."
              catalogKey="HR_DEPARTMENT"
              createLabel="Yeni departament əlavə et"
              required
            />
          </label>
          {staffType === "TEACHER" ? (
            <label>
              <span>Tələbə tutumu</span>
              <Input
                name="teacherCapacity"
                type="number"
                min="1"
                max="500"
                defaultValue={employee.teacherCapacity || 20}
                required
              />
              <input type="hidden" name="position" value="Müəllim" />
            </label>
          ) : (
            <label>
              <span>Vəzifə</span>
              <FormSelect
                name="position"
                defaultValue={employee.position}
                options={lookups.positions.map((value) => ({ value, label: value }))}
                searchable
                searchPlaceholder="Vəzifə axtar..."
                catalogKey="HR_POSITION"
                createLabel="Yeni vəzifə əlavə et"
                required
              />
              <input type="hidden" name="teacherCapacity" value="0" />
            </label>
          )}
          <label>
            <span>Status</span>
            <FormSelect
              name="status"
              defaultValue={employee.status}
              options={[
                { value: "ACTIVE", label: "Aktiv" },
                { value: "PROBATION", label: "Sınaq müddəti" },
                { value: "ON_LEAVE", label: "Məzuniyyətdə" },
                { value: "INACTIVE", label: "Deaktiv" },
              ]}
              required
            />
          </label>
          <label>
            <span>Müqavilə</span>
            <FormSelect
              name="contractType"
              defaultValue={employee.contractType}
              options={[
                { value: "FULL_TIME", label: "Tam ştat" },
                { value: "PART_TIME", label: "Yarım ştat" },
                { value: "CONTRACTOR", label: "Müqaviləli" },
              ]}
              required
            />
          </label>
          <label>
            <span>Maaş növü</span>
            <FormSelect
              name="salaryMode"
              value={salaryMode}
              onValueChange={(value) => setSalaryMode(value as "STATIC" | "PERCENT")}
              options={[
                { value: "STATIC", label: "Statik maaş" },
                { value: "PERCENT", label: "Faizlə maaş" },
              ]}
              required
            />
          </label>
          {salaryMode === "STATIC" ? (
            <label>
              <span>Aylıq maaş (AZN)</span>
              <Input
                name="salaryAmount"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={employee.salaryAmount || ""}
                required
              />
              <input type="hidden" name="salaryPercent" value="0" />
            </label>
          ) : (
            <label>
              <span>Maaş faizi</span>
              <Input
                name="salaryPercent"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={employee.salaryPercent || ""}
                required
              />
              <input type="hidden" name="salaryAmount" value="0" />
            </label>
          )}
          <DialogFooter className="is-wide">
            <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
            <Button type="submit" disabled={pending}>Dəyişiklikləri saxla</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotificationComposer({
  employeeName,
  employeeId,
  pending,
  onClose,
  onSubmit,
}: {
  employeeName: string;
  employeeId: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const [category, setCategory] = useState<Category>("RULE_VIOLATION");
  const [title, setTitle] = useState(categoryMeta.RULE_VIOLATION.title);
  const [message, setMessage] = useState(
    categoryMeta.RULE_VIOLATION.message(employeeName),
  );
  function choose(next: Category) {
    setCategory(next);
    setTitle(categoryMeta[next].title);
    setMessage(categoryMeta[next].message(employeeName));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="staff-notification-dialog">
        <DialogHeader>
          <DialogTitle>Bildiriş göndər</DialogTitle>
          <DialogDescription>
            {employeeName} üçün peşəkar mətn hazırlayın. Göndərişdən sonra
            oxunma və təsdiq statusu canlı izlənəcək.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="staff-notification-form">
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="category" value={category} />
          <div className="staff-category-grid">
            {(
              Object.entries(categoryMeta) as Array<
                [Category, (typeof categoryMeta)[Category]]
              >
            ).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  type="button"
                  key={key}
                  className={key === category ? "is-active" : ""}
                  onClick={() => choose(key)}
                >
                  <Icon />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
          <div className="staff-form-row">
            <label>
              <span>Prioritet</span>
              <select name="priority" defaultValue="HIGH">
                <option value="LOW">Aşağı</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Yüksək</option>
                <option value="URGENT">Təcili</option>
              </select>
            </label>
          </div>
          <label>
            <span>Başlıq</span>
            <Input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={140}
              required
            />
          </label>
          <label>
            <span>Bildiriş mətni</span>
            <textarea
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={8}
              maxLength={3000}
              required
            />
          </label>
          <div className="staff-copy-hint">
            <Sparkles /> Mətn seçilən mövzuya uyğun peşəkar şablondan yaradılıb
            və göndərməzdən əvvəl tam redaktə edilə bilər.
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={pending}>
              <Send data-icon="inline-start" /> Göndər
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotificationItem({
  item,
  isOwnProfile,
  canManage,
  pending,
  onAcknowledge,
  onResolve,
}: {
  item: HrStaffNotificationRow;
  isOwnProfile: boolean;
  canManage: boolean;
  pending: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
}) {
  const meta = categoryMeta[item.category];
  const Icon = meta.icon;
  const status = statusMeta[item.status];
  const canAcknowledge =
    isOwnProfile && (item.status === "SENT" || item.status === "READ");
  const canResolve = canManage && item.status !== "RESOLVED";
  return (
    <article
      className={`staff-notification-item is-${item.priority.toLowerCase()}`}
    >
      <div className="staff-notification-icon">
        <Icon />
      </div>
      <div className="staff-notification-content">
        <div className="staff-notification-head">
          <span>{meta.label}</span>
          <Badge
            variant="outline"
            className={`staff-notification-status is-${status.className}`}
          >
            <i />
            {status.label}
          </Badge>
        </div>
        <h3>{item.title}</h3>
        <p>{item.message}</p>
        <div className="staff-notification-meta">
          <span>
            {item.creatorName} · {formatDateTime(item.sentAt)}
          </span>
          <span>{deliveryProgress(item)}</span>
        </div>
      </div>
      {canAcknowledge || canResolve ? (
        <div className="staff-notification-buttons">
          {canAcknowledge ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onAcknowledge}
            >
              <CheckCheck data-icon="inline-start" /> Tanış oldum
            </Button>
          ) : null}
          {canResolve ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onResolve}
            >
              Bağla
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function PanelHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BellRing;
  title: string;
  description: string;
}) {
  return (
    <div className="staff-panel-heading">
      <span>
        <Icon />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`staff-metric ${compact ? "is-compact" : ""}`}>
      <Icon />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="staff-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="staff-empty">
      <BellRing />
      <span>{text}</span>
    </div>
  );
}
function initials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function formatMoney(value: number) {
  const rounded = Math.round(value);
  return `${String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} AZN`;
}
const monthNames = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyn",
  "iyl",
  "avq",
  "sen",
  "okt",
  "noy",
  "dek",
];
function formatDate(value: string) {
  const part = azDateParts(value);
  return `${part.day} ${monthNames[part.month]} ${part.year}`;
}
function formatDateTime(value: string) {
  const part = azDateParts(value);
  return `${part.day} ${monthNames[part.month]} ${part.year}, ${part.hour}:${part.minute}`;
}
function azDateParts(value: string) {
  const date = new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: date.getUTCMonth(),
    year: date.getUTCFullYear(),
    hour: String(date.getUTCHours()).padStart(2, "0"),
    minute: String(date.getUTCMinutes()).padStart(2, "0"),
  };
}
function tenure(value: string) {
  const months = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 2_629_746_000),
  );
  return months >= 12
    ? `${Math.floor(months / 12)} il ${months % 12} ay`
    : `${months} ay`;
}
function employmentStatus(value: HrStaffProfileData["employee"]["status"]) {
  return (
    {
      ACTIVE: "Aktiv",
      PROBATION: "Sınaq müddəti",
      ON_LEAVE: "Məzuniyyətdə",
      INACTIVE: "Deaktiv",
    } as const
  )[value];
}
function contractLabel(value: string) {
  return (
    (
      {
        FULL_TIME: "Tam ştat",
        PART_TIME: "Yarımştat",
        CONTRACTOR: "Müqaviləli",
      } as Record<string, string>
    )[value] ?? value
  );
}
function deliveryProgress(item: HrStaffNotificationRow) {
  if (item.resolvedAt) return `Bağlandı: ${formatDateTime(item.resolvedAt)}`;
  if (item.acknowledgedAt)
    return `Təsdiq: ${formatDateTime(item.acknowledgedAt)}`;
  if (item.readAt) return `Oxundu: ${formatDateTime(item.readAt)}`;
  return "Qəbul edənin oxuması gözlənilir";
}
