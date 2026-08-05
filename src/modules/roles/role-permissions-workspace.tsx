"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
  EyeOff,
  FileText,
  Info,
  LayoutGrid,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditLogPanel } from "@/modules/roles/audit-log-panel";
import {
  createStandaloneUserAction,
  createRoleAction,
  deleteRoleAction,
  updateRoleUserAction,
  updateRolePermissionsAction,
} from "@/modules/roles/actions";
import type {
  PermissionDefinitionDto,
  RoleGrantDto,
  RolePermissionMatrix,
  RoleUserDto,
} from "@/modules/roles/types";
import type {
  PermissionCode,
  PermissionScope,
} from "@/server/rbac/permissions";
import styles from "./role-permissions.module.css";

type PermissionDraft = Partial<Record<PermissionCode, PermissionScope>>;
type CreateStep = 1 | 2 | 3;

export function RolePermissionsWorkspace({
  initialData,
}: {
  initialData: RolePermissionMatrix;
}) {
  const [roles, setRoles] = useState(initialData.roles);
  const [users, setUsers] = useState(initialData.users);
  const [selectedRoleId, setSelectedRoleId] = useState(initialData.roles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>(() =>
    Object.fromEntries(initialData.roles.map((role) => [role.id, grantsToRecord(role.grants)])),
  );
  const [query, setQuery] = useState("");
  const [activeModule, setActiveModule] = useState("ALL");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [copyFromRoleId, setCopyFromRoleId] = useState("");
  const [newRoleDraft, setNewRoleDraft] = useState<PermissionDraft>({});
  const [createQuery, setCreateQuery] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [accountRoleId, setAccountRoleId] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [showEditingPassword, setShowEditingPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("az"));
  const deferredCreateQuery = useDeferredValue(createQuery.trim().toLocaleLowerCase("az"));

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const selectedRoleUsers = useMemo(
    () => selectedRole ? users.filter((user) => user.roleIds.includes(selectedRole.id)) : [],
    [selectedRole, users],
  );
  const editingUser = users.find((user) => user.id === editingUserId) ?? null;
  const currentDraft = useMemo(
    () => (selectedRole ? drafts[selectedRole.id] ?? {} : {}),
    [drafts, selectedRole],
  );
  const original = useMemo(
    () => (selectedRole ? grantsToRecord(selectedRole.grants) : {}),
    [selectedRole],
  );
  const changedCodes = useMemo(
    () => getChangedCodes(original, currentDraft),
    [original, currentDraft],
  );
  const readOnly = !initialData.canManage || selectedRole?.code === "SUPER_ADMIN";
  const allModules = useMemo(
    () => groupDefinitions(initialData.definitions),
    [initialData.definitions],
  );
  const visibleModules = useMemo(() => {
    const matchingDefinitions = initialData.definitions.filter((definition) => {
      if (activeModule !== "ALL" && definition.module !== activeModule) return false;
      if (!deferredQuery) return true;
      return permissionSearchText(definition).includes(deferredQuery);
    });
    return groupDefinitions(matchingDefinitions);
  }, [activeModule, deferredQuery, initialData.definitions]);
  const createModules = useMemo(
    () =>
      groupDefinitions(
        initialData.definitions.filter(
          (definition) =>
            !deferredCreateQuery || permissionSearchText(definition).includes(deferredCreateQuery),
        ),
      ),
    [deferredCreateQuery, initialData.definitions],
  );

  if (!selectedRole) return <div className={styles.empty}>Rol məlumatı yoxdur.</div>;

  function updateDraft(updater: (draft: PermissionDraft) => PermissionDraft) {
    setDrafts((current) => ({
      ...current,
      [selectedRole.id]: updater(current[selectedRole.id] ?? {}),
    }));
    setFeedback(null);
  }

  function togglePermission(definition: PermissionDefinitionDto, checked: boolean) {
    if (isPermissionLocked(definition, currentDraft, initialData.definitions, initialData.canManageSuperAdminPermissions)) return;
    updateDraft((draft) =>
      changePermission(draft, definition, checked, initialData.definitions),
    );
  }

  function setModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    const editableDefinitions = definitions.filter(
      (definition) => !isPermissionLocked(definition, currentDraft, initialData.definitions, initialData.canManageSuperAdminPermissions),
    );
    updateDraft((draft) =>
      changePermissionGroup(draft, editableDefinitions, checked, initialData.definitions),
    );
  }

  function toggleNewRolePermission(definition: PermissionDefinitionDto, checked: boolean) {
    if (definition.superAdminManaged && !initialData.canManageSuperAdminPermissions) return;
    setNewRoleDraft((draft) =>
      changePermission(draft, definition, checked, initialData.definitions),
    );
  }

  function setNewRoleModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    const assignableDefinitions = definitions.filter(
      (definition) => initialData.canManageSuperAdminPermissions || !definition.superAdminManaged,
    );
    setNewRoleDraft((draft) =>
      changePermissionGroup(draft, assignableDefinitions, checked, initialData.definitions),
    );
  }

  function copyRolePermissions(roleId: string) {
    setCopyFromRoleId(roleId);
    const source = roles.find((role) => role.id === roleId);
    const copiedDraft = source ? grantsToRecord(source.grants) : {};
    if (!initialData.canManageSuperAdminPermissions) {
      for (const definition of initialData.definitions) {
        if (definition.superAdminManaged) delete copiedDraft[definition.code];
      }
    }
    setNewRoleDraft(copiedDraft);
  }

  function resetCreateFlow() {
    setCreateStep(1);
    setNewName("");
    setNewDescription("");
    setCopyFromRoleId("");
    setNewRoleDraft({});
    setCreateQuery("");
  }

  function openAccountDialog() {
    setAccountEmail("");
    setAccountPassword("");
    setShowAccountPassword(false);
    setAccountRoleId(selectedRole.code === "SUPER_ADMIN"
      ? roles.find((role) => role.code !== "SUPER_ADMIN")?.id ?? ""
      : selectedRole.id);
    setFeedback(null);
    setAccountOpen(true);
  }

  function resetAccountForm() {
    setAccountEmail("");
    setAccountPassword("");
    setShowAccountPassword(false);
    setAccountRoleId("");
  }

  function createAccount() {
    const data = new FormData();
    data.set("email", accountEmail);
    data.set("password", accountPassword);
    data.set("roleId", accountRoleId);
    startTransition(async () => {
      const result = await createStandaloneUserAction(data);
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      setRoles((current) => current.map((role) => role.id === result.data.roleId
        ? { ...role, userCount: role.userCount + 1 }
        : role));
      setUsers((current) => [...current, result.data.user]);
      setAccountOpen(false);
      resetAccountForm();
      setFeedback({
        tone: "success",
        text: `${result.data.user.email} üçün ${result.data.roleName} rolu ilə giriş profili yaradıldı.`,
      });
    });
  }

  function save() {
    const data = new FormData();
    data.set("roleId", selectedRole.id);
    data.set("updatedAt", selectedRole.updatedAt);
    data.set("reason", reason);
    data.set("grants", JSON.stringify(draftToGrants(currentDraft)));
    startTransition(async () => {
      const result = await updateRolePermissionsAction(data);
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        if (result.code === "CONFLICT") setConfirmOpen(false);
        return;
      }
      const grants = draftToGrants(currentDraft);
      setRoles((current) =>
        current.map((role) =>
          role.id === selectedRole.id
            ? { ...role, updatedAt: result.updatedAt, grants }
            : role,
        ),
      );
      setConfirmOpen(false);
      setReason("");
      setFeedback({
        tone: "success",
        text: `${result.grantCount} icazə uğurla saxlanıldı.`,
      });
    });
  }

  function createRole() {
    const data = new FormData();
    data.set("name", newName);
    data.set("description", newDescription);
    data.set("copyFromRoleId", copyFromRoleId);
    data.set("grants", JSON.stringify(draftToGrants(newRoleDraft)));
    startTransition(async () => {
      const result = await createRoleAction(data);
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      setRoles((current) => [...current, result.role]);
      setDrafts((current) => ({
        ...current,
        [result.role.id]: grantsToRecord(result.role.grants),
      }));
      setSelectedRoleId(result.role.id);
      setCreateOpen(false);
      resetCreateFlow();
      setFeedback({ tone: "success", text: `“${result.role.name}” rolu yaradıldı.` });
    });
  }

  function deleteRole() {
    const data = new FormData();
    data.set("roleId", selectedRole.id);
    startTransition(async () => {
      const result = await deleteRoleAction(data);
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      const remaining = roles.filter((role) => role.id !== result.roleId);
      const deletedUserIds = new Set(result.deletedUserIds);
      const nextUsers = users.filter((user) => !deletedUserIds.has(user.id));
      setUsers(nextUsers);
      setRoles(remaining.map((role) => ({
        ...role,
        userCount: result.roleUserCounts[role.id] ?? role.userCount,
      })));
      setSelectedRoleId(remaining[0]?.id ?? "");
      setDeleteOpen(false);
      setFeedback({
        tone: result.authCleanupFailed > 0 ? "error" : "success",
        text: result.authCleanupFailed > 0
          ? `Rol və ${result.deletedUserCount} profil silindi. ${result.authCleanupFailed} giriş hesabının Auth təmizlənməsi tamamlanmadı.`
          : `Rol, ${result.deletedUserCount} profil və ${result.deletedEmployeeCount} əməkdaş qeydi silindi.`,
      });
    });
  }

  function openUserProfile(user: RoleUserDto) {
    setEditingUserId(user.id);
    setEditingEmail(user.email);
    setEditingPassword("");
    setShowEditingPassword(false);
    setEditingRoleIds(user.roleIds);
    setFeedback(null);
  }

  function toggleUserRole(roleId: string, checked: boolean) {
    setEditingRoleIds((current) => checked
      ? [...new Set([...current, roleId])]
      : current.filter((id) => id !== roleId));
  }

  function saveUserProfile() {
    if (!editingUser) return;
    const data = new FormData();
    data.set("userId", editingUser.id);
    data.set("email", editingEmail);
    data.set("password", editingPassword);
    data.set("roleIds", JSON.stringify(editingRoleIds));
    startTransition(async () => {
      const result = await updateRoleUserAction(data);
      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }
      const nextUsers = users.map((user) =>
        user.id === result.user.id ? result.user : user,
      );
      setUsers(nextUsers);
      setRoles((current) => current.map((role) => ({
        ...role,
        userCount: nextUsers.filter((user) => user.roleIds.includes(role.id)).length,
      })));
      setEditingUserId(null);
      setEditingRoleIds([]);
      setEditingEmail("");
      setEditingPassword("");
      setShowEditingPassword(false);
      setFeedback({ tone: "success", text: "Profilin login məlumatları və rolları yeniləndi." });
    });
  }

  return (
    <section className={styles.workspace} aria-busy={isPending}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Rol və icazələr</h1>
          <p>Komandanızın nəyə çıxışı olduğunu sadə şəkildə idarə edin.</p>
        </div>
        {initialData.canManage || initialData.canManageUsers ? (
          <div className={styles.pageActions}>
            {initialData.canManageUsers ? (
              <Button variant="outline" onClick={openAccountDialog}>
                <UserRoundPlus /> Yeni profil yarat
              </Button>
            ) : null}
            {initialData.canManage ? (
              <Button className={styles.primaryAction} onClick={() => setCreateOpen(true)}>
                <Plus /> Yeni rol yarat
              </Button>
            ) : null}
          </div>
        ) : (
          <span className={styles.readOnlyState}>
            <LockKeyhole /> Yalnız baxış rejimi
          </span>
        )}
      </header>

      {feedback ? (
        <div className={feedback.tone === "success" ? styles.success : styles.error} role="status">
          {feedback.tone === "success" ? <Check /> : <AlertTriangle />}
          {feedback.text}
        </div>
      ) : null}

      <Tabs defaultValue="roles" className={styles.mainTabs}>
        <TabsList>
          <TabsTrigger value="roles">Rollar</TabsTrigger>
          {initialData.canViewAudit ? (
            <TabsTrigger value="audit">
              Fəaliyyət jurnalı <span>{initialData.auditLogs.length}</span>
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="roles">
          <div className={styles.permissionShell}>
            <aside className={styles.roleRail} aria-label="Rollar">
              <div className={styles.roleRailHeader}>
                <div>
                  <strong>Rollar</strong>
                  <span>{roles.length} rol</span>
                </div>
                {initialData.canManage ? (
                  <button type="button" aria-label="Yeni rol yarat" onClick={() => setCreateOpen(true)}>
                    <Plus />
                  </button>
                ) : null}
              </div>
              <div className={styles.roleList}>
                {roles.map((role) => {
                  const active = role.id === selectedRole.id;
                  return (
                    <button
                      type="button"
                      key={role.id}
                      className={active ? styles.activeRole : styles.roleButton}
                      onClick={() => {
                        setSelectedRoleId(role.id);
                        setFeedback(null);
                        setQuery("");
                        setActiveModule("ALL");
                      }}
                    >
                      <span className={styles.roleAvatar}>{initials(role.name)}</span>
                      <span className={styles.roleCopy}>
                        <strong>{role.name}</strong>
                        <small>
                          {role.code === "SUPER_ADMIN"
                            ? "Bütün icazələr aktivdir"
                            : `${role.grants.length} icazə aktivdir`}
                        </small>
                      </span>
                      {role.code === "SUPER_ADMIN" ? <LockKeyhole /> : <ChevronRight />}
                    </button>
                  );
                })}
              </div>
              <div className={styles.protectedNote}>
                <ShieldCheck />
                <p>
                  <strong>Super Admin qorunur</strong>
                  <span>Bu rolun tam giriş hüququ dəyişdirilə bilməz.</span>
                </p>
              </div>
            </aside>

            <div className={styles.permissionEditor}>
              <div className={styles.editorHeader}>
                <div className={styles.selectedRole}>
                  <span className={styles.selectedRoleAvatar}>{initials(selectedRole.name)}</span>
                  <div>
                    <div className={styles.roleTitleLine}>
                      <h2>{selectedRole.name}</h2>
                      {!selectedRole.isSystem ? <span>Fərdi rol</span> : null}
                    </div>
                    <p>
                      {Object.keys(currentDraft).length} icazə aktivdir
                      <span aria-hidden="true">·</span>
                      {selectedRole.userCount} istifadəçi
                    </p>
                  </div>
                </div>
                <div className={styles.editorActions}>
                  {changedCodes.length ? (
                    <span className={styles.pendingState}>{changedCodes.length} dəyişiklik</span>
                  ) : (
                    <span className={styles.savedState}>
                      <Check /> Dəyişiklik yoxdur
                    </span>
                  )}
                  {initialData.canManage && !selectedRole.isSystem ? (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Rolu sil"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>

              <section className={styles.roleMembers}>
                <div className={styles.roleMembersHeader}>
                  <div>
                    <Users />
                    <span>
                      <strong>Bu roldakı profil və əməkdaşlar</strong>
                      <small>{selectedRoleUsers.length} istifadəçi</small>
                    </span>
                  </div>
                </div>
                {selectedRoleUsers.length > 0 ? (
                  <div className={styles.roleMemberList}>
                    {selectedRoleUsers.map((user) => (
                      <article className={styles.roleMember} key={user.id}>
                        <span className={styles.roleMemberAvatar}>{initials(user.fullName)}</span>
                        <div>
                          <strong>{user.fullName}</strong>
                          <small>{user.position} · {user.department}</small>
                        </div>
                        <span className={styles.roleCount}>
                          {user.isProtected ? "Qorunan profil" : user.kind === "EMPLOYEE" ? "Əməkdaş" : "Profil"} · {user.roleIds.length} rol
                        </span>
                        {(initialData.canManageUsers || initialData.canManage) && selectedRole.code !== "SUPER_ADMIN" && !user.isProtected ? (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Profil məlumatlarını dəyiş" onClick={() => openUserProfile(user)}>
                            <Pencil />
                          </Button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.roleMembersEmpty}>Bu rola təyin edilmiş profil və ya əməkdaş yoxdur.</p>
                )}
              </section>

              <div className={styles.permissionTools}>
                <label className={styles.searchBox}>
                  <Search />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="İcazələrdə axtar"
                  />
                </label>
                <div className={styles.moduleFilters} aria-label="Bölmə filtri">
                  <button
                    type="button"
                    className={activeModule === "ALL" ? styles.activeFilter : styles.moduleFilter}
                    onClick={() => setActiveModule("ALL")}
                  >
                    <LayoutGrid /> Bütün bölmələr
                  </button>
                  {allModules.map((module) => (
                    <button
                      type="button"
                      key={module.key}
                      className={activeModule === module.key ? styles.activeFilter : styles.moduleFilter}
                      onClick={() => setActiveModule(module.key)}
                    >
                      {module.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.dependencyNote}>
                <Info />
                <span>
                  Əsas icazəni seçin — ona bağlı baxış icazələri avtomatik əlavə olunur.
                </span>
              </div>

              <div className={styles.moduleList}>
                {visibleModules.length ? (
                  visibleModules.map((module) => {
                    const definitions = module.definitions;
                    const editableDefinitions = definitions.filter(
                      (definition) => !isPermissionLocked(definition, currentDraft, initialData.definitions, initialData.canManageSuperAdminPermissions),
                    );
                    const activeCount = definitions.filter((item) => currentDraft[item.code]).length;
                    const allEditableSelected = editableDefinitions.every((item) => currentDraft[item.code]);
                    return (
                      <section className={styles.moduleSection} key={module.key}>
                        <header className={styles.moduleHeader}>
                          <div>
                            <span className={styles.moduleIcon}>
                              <ModuleIcon module={module.key} />
                            </span>
                            <div>
                              <h3>{module.label}</h3>
                              <p>{activeCount}/{definitions.length} aktivdir</p>
                            </div>
                          </div>
                          {!readOnly && editableDefinitions.length ? (
                            <label className={styles.selectAll}>
                              <span>Hamısını seç</span>
                              <input
                                type="checkbox"
                                checked={allEditableSelected}
                                onChange={(event) => setModule(editableDefinitions, event.target.checked)}
                              />
                            </label>
                          ) : null}
                        </header>
                        <div className={styles.permissionRows}>
                          {definitions.map((definition) => (
                            <PermissionRow
                              key={definition.code}
                              definition={definition}
                              checked={Boolean(currentDraft[definition.code])}
                              scope={currentDraft[definition.code]}
                              changed={currentDraft[definition.code] !== original[definition.code]}
                              readOnly={readOnly || isPermissionLocked(definition, currentDraft, initialData.definitions, initialData.canManageSuperAdminPermissions)}
                              onToggle={(checked) => togglePermission(definition, checked)}
                              onScope={(scope) =>
                                updateDraft((draft) => ({ ...draft, [definition.code]: scope }))
                              }
                            />
                          ))}
                        </div>
                      </section>
                    );
                  })
                ) : (
                  <div className={styles.empty}>Axtarışa uyğun icazə tapılmadı.</div>
                )}
              </div>

              {changedCodes.length ? (
                <footer className={styles.saveBar}>
                  <div>
                    <span className={styles.saveStatusIcon}>{changedCodes.length}</span>
                    <div>
                      <strong>Dəyişikliklər saxlanılmayıb</strong>
                      <span>Yalnız “Saxla” düyməsindən sonra tətbiq olunacaq.</span>
                    </div>
                  </div>
                  <Button
                    className={styles.primaryAction}
                    disabled={readOnly || isPending}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <ShieldCheck /> Dəyişiklikləri saxla
                  </Button>
                </footer>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {initialData.canViewAudit ? (
          <TabsContent value="audit">
            <AuditLogPanel logs={initialData.auditLogs} />
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog
        open={accountOpen}
        onOpenChange={(open) => {
          setAccountOpen(open);
          if (!open) resetAccountForm();
        }}
      >
        <DialogContent className={styles.accountDialog}>
          <DialogHeader>
            <DialogTitle>Yeni giriş profili yarat</DialogTitle>
            <DialogDescription>
              İnvestor və ya digər profil üçün giriş məlumatlarını və rolunu təyin edin. Bu profil HR işçilərinə əlavə olunmayacaq.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className={styles.accountForm}>
            <Field>
              <FieldLabel htmlFor="account-email">E-poçt</FieldLabel>
              <Input
                id="account-email"
                type="email"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                placeholder="investor@example.com"
                autoComplete="off"
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-password">Parol</FieldLabel>
              <div className={styles.passwordInputWrap}>
                <Input
                  id="account-password"
                  type={showAccountPassword ? "text" : "password"}
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  placeholder="Ən az 8 simvol"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showAccountPassword ? "Parolu gizlət" : "Parolu göstər"}
                  aria-pressed={showAccountPassword}
                  onClick={() => setShowAccountPassword((current) => !current)}
                >
                  {showAccountPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-role">Rol</FieldLabel>
              <select
                id="account-role"
                value={accountRoleId}
                onChange={(event) => setAccountRoleId(event.target.value)}
                required
              >
                <option value="">Rol seçin</option>
                {roles.filter((role) => role.code !== "SUPER_ADMIN").map((role) => (
                  <option value={role.id} key={role.id}>{role.name}</option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountOpen(false)}>Ləğv et</Button>
            <Button
              className={styles.primaryAction}
              disabled={!accountEmail.trim() || accountPassword.length < 8 || !accountRoleId || isPending}
              onClick={createAccount}
            >
              <UserRoundPlus /> {isPending ? "Yaradılır..." : "Profili yarat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUserId(null);
            setEditingEmail("");
            setEditingPassword("");
            setShowEditingPassword(false);
            setEditingRoleIds([]);
          }
        }}
      >
        <DialogContent className={styles.memberRoleDialog}>
          <DialogHeader>
            <DialogTitle>Profil və giriş məlumatlarını redaktə et</DialogTitle>
            <DialogDescription>
              {editingUser?.fullName} üçün login məlumatlarını və rolları idarə edin.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className={styles.accountForm}>
            <Field>
              <FieldLabel htmlFor="editing-login-email">Login e-poçtu</FieldLabel>
              <Input
                id="editing-login-email"
                type="email"
                value={editingEmail}
                onChange={(event) => setEditingEmail(event.target.value)}
                autoComplete="off"
                disabled={!initialData.canManageUsers}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="editing-login-password">Yeni parol</FieldLabel>
              <div className={styles.passwordInputWrap}>
                <Input
                  id="editing-login-password"
                  type={showEditingPassword ? "text" : "password"}
                  value={editingPassword}
                  onChange={(event) => setEditingPassword(event.target.value)}
                  placeholder="Dəyişmirsə boş saxlayın"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  disabled={!initialData.canManageUsers || !editingUser?.hasLogin}
                />
                <button
                  type="button"
                  aria-label={showEditingPassword ? "Yeni parolu gizlət" : "Yeni parolu göstər"}
                  aria-pressed={showEditingPassword}
                  disabled={!initialData.canManageUsers || !editingUser?.hasLogin}
                  onClick={() => setShowEditingPassword((current) => !current)}
                >
                  {showEditingPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
              <p className={styles.passwordHint}>
                Mövcud parol təhlükəsizlik səbəbindən oxunmur. Yeni parol təyin etdikdə yazdığınız dəyəri göz işarəsi ilə görə bilərsiniz.
              </p>
            </Field>
          </FieldGroup>
          <div className={styles.editRolesHeader}>Təyin edilmiş rollar</div>
          <div className={styles.roleChoices}>
            {roles.filter((role) => role.code !== "SUPER_ADMIN").map((role) => (
              <label className={styles.roleChoice} key={role.id}>
                <input
                  type="checkbox"
                  checked={editingRoleIds.includes(role.id)}
                  disabled={!initialData.canManage}
                  onChange={(event) => toggleUserRole(role.id, event.target.checked)}
                />
                <span className={styles.roleAvatar}>{initials(role.name)}</span>
                <span>
                  <strong>{role.name}</strong>
                  <small>{role.description || "Əlavə açıqlama yoxdur"}</small>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUserId(null)}>Ləğv et</Button>
            <Button
              className={styles.primaryAction}
              disabled={
                editingRoleIds.length === 0
                || !editingEmail.trim()
                || (editingPassword.length > 0 && editingPassword.length < 8)
                || isPending
              }
              onClick={saveUserProfile}
            >
              {isPending ? "Saxlanılır..." : "Məlumatları saxla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={styles.confirmDialog}>
          <DialogHeader>
            <DialogTitle>Dəyişiklikləri təsdiqləyin</DialogTitle>
            <DialogDescription>
              {selectedRole.name} rolu üçün {changedCodes.length} icazə dəyişəcək və dərhal tətbiq olunacaq.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.changeSummary}>
            {changedCodes.slice(0, 10).map((code) => {
              const definition = initialData.definitions.find((item) => item.code === code);
              return (
                <span key={code} data-removed={!currentDraft[code]}>
                  {currentDraft[code] ? "+" : "−"} {definition?.tabLabel ?? code}: {definition?.actionLabel ?? code}
                </span>
              );
            })}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="role-change-reason">Dəyişiklik səbəbi</FieldLabel>
              <textarea
                id="role-change-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Məsələn: Satış komandası üçün yeni giriş hüququ əlavə edildi"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Ləğv et</Button>
            <Button
              className={styles.primaryAction}
              disabled={reason.trim().length < 5 || isPending}
              onClick={save}
            >
              {isPending ? "Saxlanılır..." : "Təsdiqlə və saxla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateFlow();
        }}
      >
        <DialogContent className={styles.createDrawer}>
          <DialogHeader className={styles.drawerHeader}>
            <DialogTitle>Yeni rol yarat</DialogTitle>
            <DialogDescription>Rolun adını və icazələrini seçin.</DialogDescription>
            <div className={styles.steps} aria-label="Rol yaratma addımları">
              <Step number={1} label="Rol məlumatları" active={createStep === 1} complete={createStep > 1} />
              <Step number={2} label="İcazələri seç" active={createStep === 2} complete={createStep > 2} />
              <Step number={3} label="Yoxla və yarat" active={createStep === 3} complete={false} />
            </div>
          </DialogHeader>

          <div className={styles.drawerBody}>
            {createStep === 1 ? (
              <div className={styles.roleDetailsStep}>
                <div className={styles.stepIntro}>
                  <span>1</span>
                  <div>
                    <h3>Rol məlumatları</h3>
                    <p>Komandada asan tanınan qısa ad və açıqlama yazın.</p>
                  </div>
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="new-role-name">Rolun adı</FieldLabel>
                    <Input
                      id="new-role-name"
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="Məsələn, Filial meneceri"
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-role-description">Qısa açıqlama</FieldLabel>
                    <textarea
                      id="new-role-description"
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                      rows={3}
                      maxLength={240}
                      placeholder="Bu rolun əsas məsuliyyətini yazın"
                    />
                    <small>{newDescription.length}/240</small>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="copy-role">Başqa roldan başla</FieldLabel>
                    <select
                      id="copy-role"
                      value={copyFromRoleId}
                      onChange={(event) => copyRolePermissions(event.target.value)}
                    >
                      <option value="">Boş rol</option>
                      {roles.map((role) => (
                        <option value={role.id} key={role.id}>{role.name}</option>
                      ))}
                    </select>
                    <small>İstəyə bağlıdır. Sonrakı addımda hər icazəni dəyişə bilərsiniz.</small>
                  </Field>
                </FieldGroup>
              </div>
            ) : null}

            {createStep === 2 ? (
              <div className={styles.permissionStep}>
                <div className={styles.roleDraftSummary}>
                  <div>
                    <span>Rolun adı</span>
                    <strong>{newName}</strong>
                  </div>
                  <div>
                    <span>Qısa açıqlama</span>
                    <strong>{newDescription || "Açıqlama əlavə edilməyib"}</strong>
                  </div>
                </div>
                <div className={styles.drawerPermissionTools}>
                  <label className={styles.searchBox}>
                    <Search />
                    <Input
                      value={createQuery}
                      onChange={(event) => setCreateQuery(event.target.value)}
                      placeholder="İcazələrdə axtar"
                    />
                  </label>
                  <span><strong>{Object.keys(newRoleDraft).length}</strong> icazə seçilib</span>
                </div>
                <div className={styles.dependencyNote}>
                  <Info />
                  <span>Bağlı əsas icazələr avtomatik seçilir. Siz yalnız lazım olan imkanları seçin.</span>
                </div>
                <div className={styles.drawerModuleList}>
                  {createModules.map((module) => {
                    const assignableDefinitions = module.definitions.filter(
                      (definition) => initialData.canManageSuperAdminPermissions || !definition.superAdminManaged,
                    );
                    const activeCount = module.definitions.filter((item) => newRoleDraft[item.code]).length;
                    return (
                      <section className={styles.drawerModule} key={module.key}>
                        <header>
                          <div>
                            <ModuleIcon module={module.key} />
                            <strong>{module.label}</strong>
                            <span>{activeCount}/{module.definitions.length}</span>
                          </div>
                          {assignableDefinitions.length ? <label className={styles.selectAll}>
                            <span>Hamısını seç</span>
                            <input
                              type="checkbox"
                              checked={assignableDefinitions.every((item) => newRoleDraft[item.code])}
                              onChange={(event) => setNewRoleModule(assignableDefinitions, event.target.checked)}
                            />
                          </label> : null}
                        </header>
                        {module.definitions.map((definition) => (
                          <PermissionRow
                            key={definition.code}
                            compact
                            definition={definition}
                            checked={Boolean(newRoleDraft[definition.code])}
                            scope={newRoleDraft[definition.code]}
                            changed={false}
                            readOnly={definition.superAdminManaged && !initialData.canManageSuperAdminPermissions}
                            onToggle={(checked) => toggleNewRolePermission(definition, checked)}
                            onScope={(scope) =>
                              setNewRoleDraft((draft) => ({ ...draft, [definition.code]: scope }))
                            }
                          />
                        ))}
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {createStep === 3 ? (
              <div className={styles.reviewStep}>
                <div className={styles.reviewHero}>
                  <span className={styles.reviewAvatar}>{initials(newName)}</span>
                  <div>
                    <h3>{newName}</h3>
                    <p>{newDescription || "Açıqlama əlavə edilməyib"}</p>
                  </div>
                </div>
                <div className={styles.reviewStats}>
                  <div><strong>{Object.keys(newRoleDraft).length}</strong><span>aktiv icazə</span></div>
                  <div><strong>{selectedModuleCount(newRoleDraft, allModules)}</strong><span>bölməyə giriş</span></div>
                </div>
                <div className={styles.reviewModules}>
                  <h4>Seçilmiş bölmələr</h4>
                  {allModules.map((module) => {
                    const count = module.definitions.filter((item) => newRoleDraft[item.code]).length;
                    if (!count) return null;
                    return (
                      <div key={module.key}>
                        <span><ModuleIcon module={module.key} /> {module.label}</span>
                        <strong>{count} icazə</strong>
                      </div>
                    );
                  })}
                  {!Object.keys(newRoleDraft).length ? (
                    <p>Bu rol icazəsiz yaradılacaq. İcazələri sonra da əlavə edə bilərsiniz.</p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <footer className={styles.drawerFooter}>
            {createStep > 1 ? (
              <Button variant="outline" onClick={() => setCreateStep((createStep - 1) as CreateStep)}>
                <ArrowLeft /> Geri
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Ləğv et</Button>
            )}
            {createStep < 3 ? (
              <Button
                className={styles.primaryAction}
                disabled={createStep === 1 && newName.trim().length < 2}
                onClick={() => setCreateStep((createStep + 1) as CreateStep)}
              >
                Davam et <ChevronRight />
              </Button>
            ) : (
              <Button className={styles.primaryAction} disabled={isPending} onClick={createRole}>
                <UserRoundPlus /> {isPending ? "Yaradılır..." : "Rolu yarat"}
              </Button>
            )}
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>“{selectedRole.name}” rolunu sil?</DialogTitle>
            <DialogDescription>
              Bu rol və ona bağlı profillər silinəcək. Bağlı HR əməkdaşları da əməkdaş siyahısından çıxarılacaq və giriş hesabları deaktiv ediləcək. Qorunan Super Admin hesabları silinməyəcək. Bu əməliyyat geri qaytarılmır və fəaliyyət jurnalında qalır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Ləğv et</Button>
            <Button variant="destructive" disabled={isPending} onClick={deleteRole}>Rolu sil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PermissionRow({
  definition,
  checked,
  scope,
  changed,
  readOnly,
  compact = false,
  onToggle,
  onScope,
}: {
  definition: PermissionDefinitionDto;
  checked: boolean;
  scope?: PermissionScope;
  changed: boolean;
  readOnly: boolean;
  compact?: boolean;
  onToggle: (checked: boolean) => void;
  onScope: (scope: PermissionScope) => void;
}) {
  return (
    <div
      className={`${styles.permissionRow} ${compact ? styles.compactPermissionRow : ""}`}
      data-active={checked}
      data-changed={changed}
    >
      <label className={styles.permissionToggle}>
        <input
          type="checkbox"
          checked={checked}
          disabled={readOnly}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span aria-hidden="true"><Check /></span>
      </label>
      <span className={styles.actionIcon}><ActionIcon action={definition.action} /></span>
      <div className={styles.permissionCopy}>
        <div>
          <strong>{definition.actionLabel}</strong>
          {definition.sensitive ? <span>Həssas</span> : null}
          {definition.superAdminManaged ? <span>Yalnız Super Admin</span> : null}
        </div>
        <p><b>{definition.tabLabel}</b> — {definition.description}</p>
      </div>
      {checked && definition.supportsScope ? (
        <div className={styles.scopeControl} aria-label={`${definition.actionLabel} məlumat əhatəsi`}>
          <button
            type="button"
            className={scope === "ALL" ? styles.activeScope : undefined}
            disabled={readOnly}
            onClick={() => onScope("ALL")}
          >
            Bütün məlumatlar
          </button>
          <button
            type="button"
            className={scope === "ASSIGNED" ? styles.activeScope : undefined}
            disabled={readOnly}
            onClick={() => onScope("ASSIGNED")}
          >
            Yalnız təyin olunanlar
          </button>
        </div>
      ) : (
        <span className={styles.scopeSpacer} />
      )}
    </div>
  );
}

function Step({
  number,
  label,
  active,
  complete,
}: {
  number: number;
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className={styles.step} data-active={active} data-complete={complete}>
      <span>{complete ? <Check /> : number}</span>
      <strong>{label}</strong>
    </div>
  );
}

function ActionIcon({ action }: { action: PermissionDefinitionDto["action"] }) {
  if (action === "read") return <Eye />;
  if (action === "create") return <Plus />;
  if (action === "update") return <Pencil />;
  if (action === "delete") return <Trash2 />;
  if (action === "export") return <FileText />;
  return <ShieldCheck />;
}

function ModuleIcon({ module }: { module: string }) {
  if (module === "finance") return <CircleDollarSign />;
  if (module === "crm" || module === "students" || module === "hr") return <Users />;
  return <LayoutGrid />;
}

function permissionSearchText(definition: PermissionDefinitionDto) {
  return `${definition.moduleLabel} ${definition.tabLabel} ${definition.actionLabel} ${definition.description} ${definition.code}`.toLocaleLowerCase("az");
}

function changePermission(
  draft: PermissionDraft,
  definition: PermissionDefinitionDto,
  checked: boolean,
  definitions: PermissionDefinitionDto[],
) {
  const next = { ...draft };
  const byCode = new Map(definitions.map((item) => [item.code, item]));
  if (checked) {
    next[definition.code] = next[definition.code] ?? "ALL";
    let dependency = definition.dependsOn ? byCode.get(definition.dependsOn) : undefined;
    while (dependency) {
      next[dependency.code] = next[dependency.code] ?? "ALL";
      dependency = dependency.dependsOn ? byCode.get(dependency.dependsOn) : undefined;
    }
  } else {
    removePermissionAndDependents(next, definition.code, definitions);
  }
  return next;
}

function isPermissionLocked(
  definition: PermissionDefinitionDto,
  draft: PermissionDraft,
  definitions: PermissionDefinitionDto[],
  canManageSuperAdminPermissions: boolean,
) {
  if (canManageSuperAdminPermissions) return false;
  if (definition.superAdminManaged) return true;

  const byCode = new Map(definitions.map((item) => [item.code, item]));
  return definitions.some((candidate) => {
    if (!candidate.superAdminManaged || !draft[candidate.code]) return false;
    let dependencyCode = candidate.dependsOn;
    while (dependencyCode) {
      if (dependencyCode === definition.code) return true;
      dependencyCode = byCode.get(dependencyCode)?.dependsOn ?? null;
    }
    return false;
  });
}

function changePermissionGroup(
  draft: PermissionDraft,
  group: PermissionDefinitionDto[],
  checked: boolean,
  definitions: PermissionDefinitionDto[],
) {
  let next = { ...draft };
  for (const definition of group) {
    next = changePermission(next, definition, checked, definitions);
  }
  return next;
}

function removePermissionAndDependents(
  draft: PermissionDraft,
  code: PermissionCode,
  definitions: PermissionDefinitionDto[],
) {
  delete draft[code];
  for (const definition of definitions) {
    if (definition.dependsOn === code) {
      removePermissionAndDependents(draft, definition.code, definitions);
    }
  }
}

function grantsToRecord(grants: RoleGrantDto[]) {
  return Object.fromEntries(grants.map((grant) => [grant.code, grant.scope])) as PermissionDraft;
}

function draftToGrants(draft: PermissionDraft): RoleGrantDto[] {
  return Object.entries(draft).flatMap(([code, scope]) =>
    scope ? [{ code: code as PermissionCode, scope }] : [],
  );
}

function getChangedCodes(original: PermissionDraft, draft: PermissionDraft) {
  return [...new Set([...Object.keys(original), ...Object.keys(draft)])].filter(
    (code) => original[code as PermissionCode] !== draft[code as PermissionCode],
  ) as PermissionCode[];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("az");
}

function groupDefinitions(definitions: PermissionDefinitionDto[]) {
  const modules = new Map<
    string,
    { key: string; label: string; definitions: PermissionDefinitionDto[] }
  >();
  for (const definition of definitions) {
    const moduleGroup = modules.get(definition.module) ?? {
      key: definition.module,
      label: definition.moduleLabel,
      definitions: [],
    };
    moduleGroup.definitions.push(definition);
    modules.set(definition.module, moduleGroup);
  }
  return [...modules.values()];
}

function selectedModuleCount(
  draft: PermissionDraft,
  modules: ReturnType<typeof groupDefinitions>,
) {
  return modules.filter((module) =>
    module.definitions.some((definition) => draft[definition.code]),
  ).length;
}
