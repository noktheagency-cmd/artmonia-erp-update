"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
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
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
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
import { Input } from "@/components/ui/input";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import type {
  HrStaffProfileData,
  HrStaffNotificationRow,
} from "@/modules/hr/staff-profile-data";
import "./staff-profile.css";

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
  updateCredentialsAction,
}: {
  data: HrStaffProfileData;
  createNotificationAction: Action;
  updateNotificationStatusAction: Action;
  updateCredentialsAction: Action;
}) {
  const router = useRouter();
  const { employee, teacher, permissions } = data;
  const [composerOpen, setComposerOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
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
          {permissions.canManageCredentials ? (
            <Button variant="outline" onClick={() => setCredentialsOpen(true)}>
              <KeyRound data-icon="inline-start" />{" "}
              {employee.hasLogin ? "Login məlumatları" : "Login hesabı yarat"}
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
                  label="Hesablanan maaş"
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
              label="ERP girişi"
              value={employee.hasLogin ? "Aktivdir" : "Yaradılmayıb"}
            />
            <Fact
              label="Sistem rolu"
              value={employee.roles.join(", ") || "Rol verilməyib"}
            />
            <Fact
              label="Son yenilənmə"
              value={formatDateTime(employee.updatedAt)}
            />
          </section>
          <section className="staff-profile-panel staff-note-card">
            <PanelHeading
              icon={UserRoundCheck}
              title="HR qeydi"
              description="Daxili profil qeydi"
            />
            <p>{employee.note || "Bu profil üçün əlavə HR qeydi yoxdur."}</p>
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
      {credentialsOpen ? (
        <CredentialDialog
          data={data}
          pending={pending}
          onClose={() => setCredentialsOpen(false)}
          onSubmit={(form) => {
            startTransition(
              () =>
                void updateCredentialsAction(form)
                  .then((result) => {
                    unwrapActionResult(result);
                    setCredentialsOpen(false);
                    setNotice(
                      employee.hasLogin
                        ? "Login məlumatları uğurla yeniləndi."
                        : "ERP login hesabı uğurla yaradıldı.",
                    );
                    router.refresh();
                  })
                  .catch((error) =>
                    setNotice(
                      notifyCaughtError(
                        error,
                        employee.hasLogin
                          ? "Login məlumatları yenilənmədi"
                          : "Login hesabı yaradılmadı",
                      ),
                    ),
                  ),
            );
          }}
        />
      ) : null}
    </section>
  );
}

function CredentialDialog({
  data,
  pending,
  onClose,
  onSubmit,
}: {
  data: HrStaffProfileData;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const { employee, roleOptions } = data;
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const defaultRoleId =
    (employee.staffType === "TEACHER"
      ? roleOptions.find((role) => role.code === "TEACHER")
      : roleOptions.find((role) => role.code !== "TEACHER")
    )?.id ??
    roleOptions[0]?.id ??
    "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (!employee.hasLogin && password.length < 8) {
      setError("Parol ən az 8 simvoldan ibarət olmalıdır.");
      return;
    }
    if (password && password !== confirmation) {
      setError("Parol və parol təsdiqi eyni deyil.");
      return;
    }
    form.delete("passwordConfirmation");
    onSubmit(form);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="staff-credential-dialog">
        <DialogHeader>
          <div className="staff-credential-heading">
            <span>
              <KeyRound />
            </span>
            <div>
              <DialogTitle>
                {employee.hasLogin
                  ? "Login məlumatlarını dəyiş"
                  : "ERP login hesabı yarat"}
              </DialogTitle>
              <DialogDescription>
                {employee.hasLogin
                  ? `${employee.fullName} üçün giriş e-poçtunu və ya parolu təhlükəsiz şəkildə yeniləyin.`
                  : `${employee.fullName} üçün sistemə giriş hesabı və uyğun səlahiyyət rolu yaradın.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="staff-credential-form">
          <input type="hidden" name="employeeId" value={employee.id} />
          <label>
            <span>Login e-poçtu</span>
            <Input
              type="email"
              name="loginEmail"
              defaultValue={employee.loginEmail || employee.email}
              autoComplete="off"
              placeholder="ad.soyad@şirkət.az"
              required
            />
            <small>Əməkdaş sistemə bu e-poçt ünvanı ilə daxil olacaq.</small>
          </label>
          {!employee.hasLogin ? (
            <label>
              <span>Sistem rolu</span>
              <select name="roleId" defaultValue={defaultRoleId} required>
                <option value="" disabled>
                  Rol seçin
                </option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <small>
                Rol əməkdaşın ERP daxilində görə və idarə edə biləcəyi bölmələri
                müəyyən edir.
              </small>
            </label>
          ) : (
            <input type="hidden" name="roleId" value="" />
          )}
          <div className="staff-credential-grid">
            <label>
              <span>{employee.hasLogin ? "Yeni parol" : "Parol"}</span>
              <div className="staff-password-field">
                <Input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  minLength={employee.hasLogin ? undefined : 8}
                  maxLength={72}
                  autoComplete="new-password"
                  required={!employee.hasLogin}
                  placeholder="Ən az 8 simvol"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Parolu gizlət" : "Parolu göstər"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            <label>
              <span>Parolu təsdiqlə</span>
              <Input
                type={showPassword ? "text" : "password"}
                name="passwordConfirmation"
                maxLength={72}
                autoComplete="new-password"
                required={!employee.hasLogin}
                placeholder="Parolu təkrar daxil edin"
              />
            </label>
          </div>
          {employee.hasLogin ? (
            <p className="staff-field-hint">
              Parolu dəyişmək istəmirsinizsə, hər iki parol sahəsini boş
              saxlayın.
            </p>
          ) : null}
          {error ? (
            <div className="staff-credential-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="staff-security-note">
            <ShieldCheck />
            <span>
              <strong>Təhlükəsiz dəyişiklik</strong>Parol profil məlumatlarında
              və fəaliyyət tarixçəsində saxlanılmır. Yalnız dəyişiklik faktı
              audit qeydinə əlavə edilir.
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button
              type="submit"
              disabled={pending || (!employee.hasLogin && !roleOptions.length)}
            >
              <KeyRound data-icon="inline-start" />{" "}
              {employee.hasLogin ? "Yenilə" : "Hesab yarat"}
            </Button>
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
