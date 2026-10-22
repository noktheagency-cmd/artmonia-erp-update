"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Power,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapActionResult } from "@/lib/action-result";
import {
  changeSecurityPasswordAction,
  createSecurityAccountAction,
  setSecurityAccountStatusAction,
  updateSecurityAccountAction,
} from "@/modules/audit/account-actions";
import { revokeOtherSessionsAction } from "@/modules/audit/session-actions";
import type { SecurityAccountDto, SecurityRoleOptionDto } from "@/modules/audit/session-types";
import styles from "./account-security-panel.module.css";

export function AccountSecurityPanel({
  accounts,
  roleOptions,
  generatedAt,
  initialProfileKey,
}: {
  accounts: SecurityAccountDto[];
  roleOptions: SecurityRoleOptionDto[];
  generatedAt: string;
  initialProfileKey?: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedProfileKey, setSelectedProfileKey] = useState(
    accounts.some((account) => accountKey(account) === initialProfileKey)
      ? initialProfileKey!
      : accounts[0] ? accountKey(accounts[0]) : "",
  );
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const normalized = query.trim().toLocaleLowerCase("az");
  const visible = useMemo(() => accounts.filter((account) => !normalized || `${account.fullName} ${account.loginEmail ?? account.contactEmail ?? ""} ${account.department} ${account.position} ${account.companyName ?? ""} ${account.roles.map((role) => role.name).join(" ")}`.toLocaleLowerCase("az").includes(normalized)), [accounts, normalized]);
  const selected = visible.find((account) => accountKey(account) === selectedProfileKey) ?? visible[0] ?? null;

  function run(action: () => Promise<unknown>, success: string) {
    setFeedback(null);
    startTransition(() => {
      void action().then((result) => {
        unwrapActionResult(result);
        setFeedback({ tone: "success", text: success });
        router.refresh();
      }).catch((error) => setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Əməliyyat tamamlanmadı" }));
    });
  }

  return (
    <section className={styles.workspace} aria-busy={pending}>
      {feedback ? <div className={feedback.tone === "success" ? styles.success : styles.error} role="status">{feedback.tone === "success" ? <Check /> : <AlertTriangle />}<span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Bildirişi bağla">×</button></div> : null}
      <div className={styles.securityBanner}><ShieldCheck /><span><strong>Yalnız Super Admin idarəetməsi</strong>Parollar heç vaxt göstərilmir və auditə yazılmır. Bütün hesab dəyişiklikləri izlənilir.</span><small>Yenilənib {formatTime(generatedAt)}</small></div>
      <div className={styles.layout}>
        <div className={styles.listPanel}>
          <header className={styles.listHeader}>
            <label><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, e-poçt, rol və ya departament..." aria-label="Hesablarda axtarış" /></label>
            <span>{visible.length} profil</span>
          </header>
          <div className={styles.tableHead}><span>Profil</span><span>Login / e-poçt</span><span>Rollar</span><span>Status</span><span>Sessiya</span></div>
          <div className={styles.rows}>
            {visible.map((account) => (
              <button type="button" key={accountKey(account)} className={accountKey(account) === (selected ? accountKey(selected) : "") ? styles.activeRow : styles.row} onClick={() => { setSelectedProfileKey(accountKey(account)); setFeedback(null); }}>
                <span className={styles.person}><i data-tone={avatarTone(account.fullName)}>{initials(account.fullName)}</i><span><strong>{account.fullName}</strong><small>{account.profileType === "CORPORATE_CONTACT" ? "Korporativ əlaqə" : "Əməkdaş"} · {account.position} · {account.department}</small></span></span>
                <span className={styles.email}>{account.loginEmail ?? "—"}</span>
                <span className={styles.roles}>{account.roles.slice(0, 2).map((role) => <small key={role.id} data-tone={roleTone(role)}>{role.name}</small>)}{account.roles.length > 2 ? <small data-tone="slate">+{account.roles.length - 2}</small> : null}</span>
                <AccountStatus status={account.status} />
                <span className={styles.sessionCell} data-live={account.activeSessionCount > 0 ? "true" : "false"}>{account.activeSessionCount}</span>
              </button>
            ))}
            {!visible.length ? <div className={styles.empty}><UsersRound /><strong>Nəticə tapılmadı</strong><p>Axtarış sözünü dəyişib yenidən yoxlayın.</p></div> : null}
          </div>
        </div>

        <aside key={selected ? `${accountKey(selected)}:${selected.updatedAt}` : "empty"} className={styles.inspector}>
          {selected ? (
            <>
              <header className={styles.identity}>
                <i data-tone={avatarTone(selected.fullName)}>{initials(selected.fullName)}</i>
                <div><span><h2>{selected.fullName}</h2><AccountStatus status={selected.status} /></span><p>{selected.loginEmail ?? selected.contactEmail ?? "E-poçt qeyd edilməyib"}</p><small>{selected.position} · {selected.department}</small></div>
              </header>
              <dl className={styles.facts}>
                <div data-tone="blue"><dt><Clock3 /> Son fəaliyyət</dt><dd>{selected.lastSeenAt ? formatDateTime(selected.lastSeenAt) : "Aktivlik yoxdur"}</dd></div>
                <div data-tone="mint"><dt><UsersRound /> Aktiv sessiyalar</dt><dd>{selected.activeSessionCount}</dd></div>
                <div data-tone="violet"><dt><ShieldCheck /> Rollar</dt><dd className={styles.factRoles}>{selected.roles.length ? selected.roles.map((role) => <small key={role.id} data-tone={roleTone(role)}>{role.name}</small>) : "Rol yoxdur"}</dd></div>
                <div data-tone="amber"><dt><Clock3 /> Hesab tarixi</dt><dd>{formatDate(selected.createdAt)}</dd></div>
              </dl>

              {selected.status === "NOT_CREATED" ? (
                <CreateAccountForm account={selected} roleOptions={roleOptions} pending={pending} onSubmit={(form) => run(() => createSecurityAccountAction(form), "ERP giriş hesabı yaradıldı.")} />
              ) : (
                <>
                  <AccountDetailsForm account={selected} roleOptions={roleOptions} pending={pending} onSubmit={(form) => run(() => updateSecurityAccountAction(form), "Login e-poçtu və rollar yeniləndi.")} />
                  <PasswordForm account={selected} pending={pending} onSubmit={(form) => run(() => changeSecurityPasswordAction(form), "Parol yeniləndi və digər sessiyalar bağlandı.")} />
                  <section className={styles.actionCard}>
                    <header><UsersRound /><span><strong>Sessiyaları bağla</strong><small>Profilin bütün aktiv cihaz girişlərini təhlükəsiz sonlandırın.</small></span></header>
                    <Button variant="outline" disabled={pending || selected.activeSessionCount === 0 || !selected.userId} onClick={() => run(async () => {
                      const result = await revokeOtherSessionsAction({ userId: selected.userId!, reason: "Hesab təhlükəsizliyi panelindən bütün sessiyalar bağlandı" });
                      if (!result.ok) throw new Error(result.message);
                      return result;
                    }, "Aktiv sessiyalar bağlandı.")}><LockKeyhole /> Bütün sessiyaları bağla</Button>
                  </section>
                  <section className={`${styles.actionCard} ${styles.dangerCard}`}>
                    <header><Power /><span><strong>{selected.status === "ACTIVE" ? "Hesabı deaktiv et" : "Hesabı aktiv et"}</strong><small>{selected.status === "ACTIVE" ? "Yeni girişlər bloklanacaq və sessiyalar bağlanacaq." : "Profil sahibi yenidən ERP-yə daxil ola biləcək."}</small></span></header>
                    <Button variant={selected.status === "ACTIVE" ? "destructive" : "outline"} disabled={pending || selected.isCurrent} onClick={() => {
                      const form = profileFormData(selected); form.set("active", selected.status === "ACTIVE" ? "false" : "true");
                      run(() => setSecurityAccountStatusAction(form), selected.status === "ACTIVE" ? "Hesab deaktiv edildi." : "Hesab aktiv edildi.");
                    }}>{selected.status === "ACTIVE" ? <XCircle /> : <CheckCircle2 />}{selected.status === "ACTIVE" ? "Deaktiv et" : "Aktiv et"}</Button>
                    {selected.isCurrent ? <small className={styles.selfNote}>Hazırkı Super Admin hesabı özünü deaktiv edə bilməz.</small> : null}
                  </section>
                </>
              )}
            </>
          ) : <div className={styles.empty}><UsersRound /><strong>Profil yoxdur</strong><p>Hesab idarəetməsi üçün əvvəl HR-da əməkdaş və ya korporativ əlaqəli şəxs profili yaradılmalıdır.</p></div>}
        </aside>
      </div>
    </section>
  );
}

function CreateAccountForm({ account, roleOptions, pending, onSubmit }: FormProps) {
  return <CredentialForm mode="create" account={account} roleOptions={roleOptions} pending={pending} onSubmit={onSubmit} />;
}
function AccountDetailsForm({ account, roleOptions, pending, onSubmit }: FormProps) {
  return <CredentialForm mode="update" account={account} roleOptions={roleOptions} pending={pending} onSubmit={onSubmit} />;
}
type FormProps = { account: SecurityAccountDto; roleOptions: SecurityRoleOptionDto[]; pending: boolean; onSubmit: (form: FormData) => void };

function CredentialForm({ mode, account, roleOptions, pending, onSubmit }: FormProps & { mode: "create" | "update" }) {
  const available = new Set(roleOptions.map((role) => role.id));
  const teacherRole = roleOptions.find((role) => role.code === "TEACHER");
  const [loginEmail, setLoginEmail] = useState(account.loginEmail ?? account.contactEmail ?? "");
  const [roleIds, setRoleIds] = useState(() => {
    const assigned = account.roles.map((role) => role.id).filter((id) => available.has(id));
    if (assigned.length || mode === "update") return assigned;
    return account.profileType === "EMPLOYEE" && teacherRole && /müəllim/i.test(account.position) ? [teacherRole.id] : [];
  });
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    if (!roleIds.length && !(mode === "update" && account.protectedRole)) { setError("Ən az bir sistem rolu seçilməlidir."); return; }
    if (mode === "create" && form.get("password") !== form.get("confirmation")) { setError("Parollar eyni deyil."); return; }
    form.delete("confirmation"); form.set("roleIds", JSON.stringify(roleIds)); onSubmit(form);
  }
  return <form className={styles.actionCard} onSubmit={submit}>
    <header>{mode === "create" ? <UserPlus /> : <Mail />}<span><strong>{mode === "create" ? "ERP hesabı yarat" : "Login məlumatları"}</strong><small>{mode === "create" ? "İlkin giriş və səlahiyyət rollarını təyin edin." : "E-poçtu və təyin edilən rolları yeniləyin."}</small></span></header>
    <ProfileFields account={account} />
    <label><span>Login e-poçtu</span><Input name="loginEmail" type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required autoComplete="off" /></label>
    <fieldset><legend>Sistem rolları</legend><div className={styles.roleGrid}>{roleOptions.map((role) => <label key={role.id} data-tone={roleTone(role)}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={() => setRoleIds((current) => current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id])} /><span>{role.name}</span></label>)}</div>{account.protectedRole ? <small>Qorunan Super Admin/Admin rolu bu paneldə saxlanılır və dəyişdirilmir.</small> : null}</fieldset>
    {mode === "create" ? <div className={styles.twoColumns}><label><span>İlkin parol</span><Input name="password" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label><label><span>Parolu təsdiqlə</span><Input name="confirmation" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label></div> : null}
    {error ? <p className={styles.formError}>{error}</p> : null}
    <Button type="submit" disabled={pending || !roleOptions.length}>{pending ? <LoaderCircle className={styles.spin} /> : mode === "create" ? <UserPlus /> : <Check />}{mode === "create" ? "Hesab yarat" : "Dəyişiklikləri saxla"}</Button>
  </form>;
}

function PasswordForm({ account, pending, onSubmit }: { account: SecurityAccountDto; pending: boolean; onSubmit: (form: FormData) => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") ?? ""); if (password !== form.get("confirmation")) { setError("Parollar eyni deyil."); return; } if (!strongPassword(password)) { setError("Ən az 16 simvol, böyük/kiçik hərf, rəqəm və xüsusi simvol istifadə edin."); return; } form.delete("confirmation"); onSubmit(form); }
  return <form className={styles.actionCard} onSubmit={submit}><header><KeyRound /><span><strong>Yeni parol təyin et</strong><small>Yeniləndikdən sonra digər aktiv sessiyalar bağlanır.</small></span></header><ProfileFields account={account} /><div className={styles.twoColumns}><label><span>Yeni parol</span><Input name="password" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label><label><span>Təsdiq</span><Input name="confirmation" type="password" minLength={16} maxLength={72} required autoComplete="new-password" /></label></div>{error ? <p className={styles.formError}>{error}</p> : null}<Button variant="outline" type="submit" disabled={pending}>{pending ? <LoaderCircle className={styles.spin} /> : <KeyRound />} Parolu yenilə</Button></form>;
}

function ProfileFields({ account }: { account: SecurityAccountDto }) {
  return <><input type="hidden" name="profileType" value={account.profileType} /><input type="hidden" name="profileId" value={account.profileId} /></>;
}

function profileFormData(account: SecurityAccountDto) {
  const form = new FormData();
  form.set("profileType", account.profileType);
  form.set("profileId", account.profileId);
  return form;
}

function accountKey(account: Pick<SecurityAccountDto, "profileType" | "profileId">) { return `${account.profileType}:${account.profileId}`; }

type ChipTone = "blue" | "mint" | "violet" | "amber" | "rose" | "teal" | "indigo";
const chipTones: ChipTone[] = ["blue", "mint", "violet", "amber", "rose", "teal", "indigo"];

function roleTone(role: { code: string | null; name: string }): ChipTone {
  const key = `${role.code ?? ""} ${role.name}`.toLocaleUpperCase("az");
  if (/(TEACHER|MÜƏLL|MUELL)/.test(key)) return "violet";
  if (/(SALES|SATIŞ|SATIS|TƏMSİL|TEMSIL)/.test(key)) return "amber";
  if (/MARKET/.test(key)) return "rose";
  if (/(LAW|LEGAL|HÜQUQ|HUQUQ)/.test(key)) return "indigo";
  if (/(ACCOUNT|MÜHAS|MUHAS|FINAN|MALİY|MALIY)/.test(key)) return "teal";
  if (/EVENT/.test(key)) return "mint";
  if (/(ADMIN|OWNER)/.test(key)) return "blue";
  return chipTones[toneIndex(key)];
}

function avatarTone(name: string): ChipTone {
  return chipTones[toneIndex(name)];
}

function toneIndex(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash + char.charCodeAt(0)) % chipTones.length;
  return hash;
}

function AccountStatus({ status }: { status: SecurityAccountDto["status"] }) {
  const label = status === "ACTIVE" ? "Aktiv" : status === "DISABLED" ? "Deaktiv" : "Yaradılmayıb";
  return <span className={styles.status} data-status={status}><i />{label}</span>;
}
function strongPassword(value: string) { return value.length >= 16 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value); }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("az"); }
const accountDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function accountDateParts(value: string) { return Object.fromEntries(accountDateFormatter.formatToParts(new Date(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
function formatDate(value: string) { const parts = accountDateParts(value); return `${parts.day}.${parts.month}.${parts.year}`; }
function formatDateTime(value: string) { const parts = accountDateParts(value); return `${parts.day}.${parts.month}.${parts.year}, ${parts.hour}:${parts.minute}`; }
function formatTime(value: string) { const parts = accountDateParts(value); return `${parts.hour}:${parts.minute}`; }
