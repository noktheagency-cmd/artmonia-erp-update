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
import { isProtectedTeamRole } from "@/lib/protected-roles";
import { RoleAccountControls } from "./role-account-controls";
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
  const [serverUsers, setServerUsers] = useState(initialData.users);
  if (serverUsers !== initialData.users) {
    setServerUsers(initialData.users);
    setUsers(initialData.users);
  }
  const [selectedRoleId, setSelectedRoleId] = useState(initialData.roles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>(() =>
    Object.fromEntries(initialData.roles.map((role) => [role.id, grantsToRecord(role.grants)])),
  );
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<"permissions" | "people">("permissions");
  const [openModules, setOpenModules] = useState<string[]>(() => {
    const firstModule = initialData.definitions[0]?.module;
    return firstModule ? [firstModule] : [];
  });
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
  const [accountFullName, setAccountFullName] = useState("");
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
  const assignableRoles = useMemo(
    () => roles.filter((role) => !isProtectedTeamRole(role.code)),
    [roles],
  );
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
      if (!deferredQuery) return true;
      return permissionSearchText(definition).includes(deferredQuery);
    });
    return groupDefinitions(matchingDefinitions);
  }, [deferredQuery, initialData.definitions]);
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

  function toggleModule(key: string) {
    setOpenModules((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

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
    if (definition.superAdminOnly || (definition.superAdminManaged && !initialData.canManageSuperAdminPermissions)) return;
    setNewRoleDraft((draft) =>
      changePermission(draft, definition, checked, initialData.definitions),
    );
  }

  function setNewRoleModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    const assignableDefinitions = definitions.filter(
      (definition) => !definition.superAdminOnly && (initialData.canManageSuperAdminPermissions || !definition.superAdminManaged),
    );
    setNewRoleDraft((draft) =>
      changePermissionGroup(draft, assignableDefinitions, checked, initialData.definitions),
    );
  }

  function copyRolePermissions(roleId: string) {
    setCopyFromRoleId(roleId);
    const source = roles.find((role) => role.id === roleId);
    const copiedDraft = source ? grantsToRecord(source.grants) : {};
    for (const definition of initialData.definitions) {
      if (definition.superAdminOnly || (definition.superAdminManaged && !initialData.canManageSuperAdminPermissions)) {
        delete copiedDraft[definition.code];
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
    setAccountFullName("");
    setAccountEmail("");
    setAccountPassword("");
    setShowAccountPassword(false);
    setAccountRoleId(isProtectedTeamRole(selectedRole.code)
      ? assignableRoles[0]?.id ?? ""
      : selectedRole.id);
    setFeedback(null);
    setAccountOpen(true);
  }

  function resetAccountForm() {
    setAccountFullName("");
    setAccountEmail("");
    setAccountPassword("");
    setShowAccountPassword(false);
    setAccountRoleId("");
  }

  function createAccount() {
    const data = new FormData();
    data.set("fullName", accountFullName);
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

      <div className={styles.permissionShell}>
            <aside className={styles.roleRail} aria-label="Rollar">
              <div className={styles.roleRailHeader}>
                <strong>Rollar</strong>
                <span>{roles.length}</span>
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
                        setPanel("permissions");
                        setOpenModules(allModules[0] ? [allModules[0].key] : []);
                      }}
                    >
                      <span className={styles.roleCopy}>
                        <strong>{role.name}</strong>
                      </span>
                      <small>{role.code === "SUPER_ADMIN" ? "Tam" : role.grants.length}</small>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className={styles.permissionEditor}>
              <div className={styles.editorHeader}>
                <div className={styles.selectedRole}>
                  <div>
                    <h2>{selectedRole.name}</h2>
                    <p>
                      {Object.keys(currentDraft).length} icazə
                      <span aria-hidden="true">·</span>
                      {selectedRole.userCount} istifadəçi
                      {selectedRole.code === "SUPER_ADMIN" ? (
                        <>
                          <span aria-hidden="true">·</span>
                          Dəyişdirilə bilməz
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className={styles.editorActions}>
                  {changedCodes.length ? (
                    <Button
                      className={styles.primaryAction}
                      disabled={readOnly || isPending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <ShieldCheck /> Saxla ({changedCodes.length})
                    </Button>
                  ) : null}
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

              <div className={styles.panelTabs} role="tablist" aria-label="Rol bölmələri">
                <button
                  type="button"
                  role="tab"
                  aria-selected={panel === "permissions"}
                  className={panel === "permissions" ? styles.activePanel : styles.panelTab}
                  onClick={() => setPanel("permissions")}
                >
                  İcazələr
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={panel === "people"}
                  className={panel === "people" ? styles.activePanel : styles.panelTab}
                  onClick={() => setPanel("people")}
                >
                  İstifadəçilər
                  <span>{selectedRoleUsers.length}</span>
                </button>
              </div>

              {panel === "people" ? (
                <section className={styles.peoplePanel} role="tabpanel">
                  {selectedRoleUsers.length > 0 ? (
                    <ul className={styles.peopleList}>
                      {selectedRoleUsers.map((user) => (
                        <li key={user.id}>
                          <div>
                            <strong>{user.fullName}</strong>
                            <span>{user.position} · {user.department}</span>
                          </div>
                          <em>
                            {user.isProtected ? "Qorunan profil" : !user.hasLogin ? "Giriş yoxdur" : user.pendingAccessChange ? "Əməliyyat gözləyir" : user.isActive ? "Aktiv giriş" : "Giriş dayandırılıb"}
                          </em>
                          <div className={styles.peopleActions}>
                            {(initialData.canManageUsers || initialData.canManage) && selectedRole.code !== "SUPER_ADMIN" && !user.isProtected ? (
                              <Button type="button" variant="ghost" size="icon-sm" aria-label="Profil məlumatlarını dəyiş" onClick={() => openUserProfile(user)}>
                                <Pencil />
                              </Button>
                            ) : null}
                            <RoleAccountControls
                              user={user}
                              canChangeStatus={initialData.canChangeUserStatus}
                              canDelete={initialData.canDeleteUserAccounts}
                              onChanged={(result) => {
                                const nextUsers = result.hasLogin
                                  ? users.map((item) => item.id === result.userId ? { ...item, ...result, pendingAccessChange: null } : item)
                                  : users.filter((item) => item.id !== result.userId);
                                setUsers(nextUsers);
                                setRoles((current) => current.map((role) => ({ ...role, userCount: nextUsers.filter((item) => item.roleIds.includes(role.id)).length })));
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.peopleEmpty}>Bu rolda istifadəçi yoxdur.</p>
                  )}
                </section>
              ) : (
                <section role="tabpanel">
                  <div className={styles.permissionTools}>
                    <label className={styles.searchBox}>
                      <Search />
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="İcazə axtar"
                      />
                    </label>
                    <p className={styles.hint}>
                      <Info />
                      Əsas icazə seçiləndə bağlı baxış icazələri özü əlavə olunur.
                    </p>
                  </div>

                  <div className={styles.moduleList}>
                    {visibleModules.length ? (
                      visibleModules.map((module) => {
                        const definitions = module.definitions;
                        const editableDefinitions = definitions.filter(
                          (definition) => !isPermissionLocked(definition, currentDraft, initialData.definitions, initialData.canManageSuperAdminPermissions),
                        );
                        const activeCount = definitions.filter((item) => currentDraft[item.code]).length;
                        const allEditableSelected = editableDefinitions.length > 0 && editableDefinitions.every((item) => currentDraft[item.code]);
                        const open = deferredQuery.length > 0 || openModules.includes(module.key);
                        return (
                          <section className={styles.moduleSection} data-open={open} key={module.key}>
                            <header className={styles.moduleHeader}>
                              <button
                                type="button"
                                className={styles.moduleToggle}
                                aria-expanded={open}
                                onClick={() => toggleModule(module.key)}
                              >
                                <ChevronRight />
                                <h3>{module.label}</h3>
                                <span>{activeCount}/{definitions.length}</span>
                              </button>
                              {!readOnly && editableDefinitions.length ? (
                                <label className={styles.selectAll}>
                                  <span>Hamısı</span>
                                  <input
                                    type="checkbox"
                                    checked={allEditableSelected}
                                    onChange={(event) => setModule(editableDefinitions, event.target.checked)}
                                  />
                                </label>
                              ) : null}
                            </header>
                            {open ? (
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
                            ) : null}
                          </section>
                        );
                      })
                    ) : (
                      <div className={styles.empty}>Axtarışa uyğun icazə tapılmadı.</div>
                    )}
                  </div>
                </section>
              )}
            </div>
      </div>

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
              <FieldLabel htmlFor="account-full-name">Ad və soyad</FieldLabel>
              <Input
                id="account-full-name"
                value={accountFullName}
                onChange={(event) => setAccountFullName(event.target.value)}
                placeholder="Ad və soyad"
                minLength={2}
                maxLength={120}
                autoComplete="name"
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-email">E-poçt</FieldLabel>
              <Input
                id="account-email"
                type="email"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                placeholder="investor@example.com"
                autoComplete="off"
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
                  placeholder="Ən az 16 simvol"
                  minLength={16}
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
                {assignableRoles.map((role) => (
                  <option value={role.id} key={role.id}>{role.name}</option>
                ))}
              </select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountOpen(false)}>Ləğv et</Button>
            <Button
              className={styles.primaryAction}
              disabled={accountFullName.trim().length < 2 || !accountEmail.trim() || accountPassword.length < 16 || !accountRoleId || isPending}
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
                  minLength={16}
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
            {assignableRoles.map((role) => (
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
                || (editingPassword.length > 0 && editingPassword.length < 16)
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
                      {assignableRoles.map((role) => (
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
                      (definition) => !definition.superAdminOnly && (initialData.canManageSuperAdminPermissions || !definition.superAdminManaged),
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
                            readOnly={definition.superAdminOnly || (definition.superAdminManaged && !initialData.canManageSuperAdminPermissions)}
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
        <span className={styles.permissionCopy} title={definition.description}>
          <strong>{definition.tabLabel}</strong>
          <em>{definition.actionLabel}</em>
          {definition.sensitive ? <small>Həssas</small> : null}
          {definition.superAdminOnly ? <small>Yalnız Super Admin</small> : definition.superAdminManaged ? <small>Super Admin</small> : null}
        </span>
      </label>
      {checked && definition.supportsScope ? (
        <select
          className={styles.scopeSelect}
          aria-label={`${definition.actionLabel} məlumat əhatəsi`}
          value={scope ?? "ALL"}
          disabled={readOnly}
          onChange={(event) => onScope(event.target.value as PermissionScope)}
        >
          <option value="ALL">Bütün məlumatlar</option>
          <option value="ASSIGNED">Yalnız təyin olunanlar</option>
        </select>
      ) : null}
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
  if (definition.superAdminOnly) return true;
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
