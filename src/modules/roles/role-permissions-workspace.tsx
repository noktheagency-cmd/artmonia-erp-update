"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditLogPanel } from "@/modules/roles/audit-log-panel";
import {
  createRoleAction,
  deleteRoleAction,
  updateRolePermissionsAction,
} from "@/modules/roles/actions";
import type {
  PermissionDefinitionDto,
  RoleGrantDto,
  RolePermissionMatrix,
} from "@/modules/roles/types";
import type {
  PermissionAction,
  PermissionCode,
  PermissionScope,
} from "@/server/rbac/permissions";
import styles from "./role-permissions.module.css";

const actionColumns: Array<{ action: PermissionAction; label: string }> = [
  { action: "read", label: "Görə bilər" },
  { action: "create", label: "Əlavə edə bilər" },
  { action: "update", label: "Dəyişə bilər" },
  { action: "delete", label: "Silə bilər" },
  { action: "export", label: "İxrac edə bilər" },
  { action: "special", label: "Xüsusi əməliyyatlar" },
];
type PermissionDraft = Partial<Record<PermissionCode, PermissionScope>>;

export function RolePermissionsWorkspace({
  initialData,
}: {
  initialData: RolePermissionMatrix;
}) {
  const [roles, setRoles] = useState(initialData.roles);
  const [selectedRoleId, setSelectedRoleId] = useState(
    initialData.roles[0]?.id ?? "",
  );
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>(() =>
    Object.fromEntries(
      initialData.roles.map((role) => [role.id, grantsToRecord(role.grants)]),
    ),
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("az"));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [copyFromRoleId, setCopyFromRoleId] = useState("");
  const [newRoleDraft, setNewRoleDraft] = useState<PermissionDraft>({});
  const [permissionPickerOpen, setPermissionPickerOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentDraft = useMemo(
    () => (selectedRole ? (drafts[selectedRole.id] ?? {}) : {}),
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
  const readOnly =
    !initialData.canManage || selectedRole?.code === "SUPER_ADMIN";
  const modules = useMemo(
    () =>
      groupDefinitions(
        initialData.definitions.filter(
          (definition) =>
            !deferredQuery ||
            `${definition.moduleLabel} ${definition.tabLabel} ${definition.actionLabel} ${definition.description} ${definition.code}`
              .toLocaleLowerCase("az")
              .includes(deferredQuery),
        ),
      ),
    [deferredQuery, initialData.definitions],
  );
  const createModules = useMemo(
    () => groupDefinitions(initialData.definitions),
    [initialData.definitions],
  );
  if (!selectedRole)
    return <div className={styles.empty}>Rol məlumatı yoxdur.</div>;

  function updateDraft(updater: (draft: PermissionDraft) => PermissionDraft) {
    setDrafts((current) => ({
      ...current,
      [selectedRole.id]: updater(current[selectedRole.id] ?? {}),
    }));
    setFeedback(null);
  }
  function togglePermission(
    definition: PermissionDefinitionDto,
    checked: boolean,
  ) {
    updateDraft((draft) => {
      const next = { ...draft };
      if (checked) {
        next[definition.code] = "ALL";
        if (definition.dependsOn) next[definition.dependsOn] ??= "ALL";
      } else {
        delete next[definition.code];
        for (const candidate of initialData.definitions)
          if (candidate.dependsOn === definition.code)
            delete next[candidate.code];
      }
      return next;
    });
  }
  function setModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    updateDraft((draft) => {
      const next = { ...draft };
      for (const item of definitions) {
        if (checked) next[item.code] = "ALL";
        else delete next[item.code];
      }
      return next;
    });
  }
  function toggleNewRolePermission(
    definition: PermissionDefinitionDto,
    checked: boolean,
  ) {
    setNewRoleDraft((draft) => {
      const next = { ...draft };
      if (checked) {
        next[definition.code] = "ALL";
        if (definition.dependsOn) next[definition.dependsOn] ??= "ALL";
      } else {
        delete next[definition.code];
        for (const candidate of initialData.definitions)
          if (candidate.dependsOn === definition.code)
            delete next[candidate.code];
      }
      return next;
    });
  }
  function copyRolePermissions(roleId: string) {
    setCopyFromRoleId(roleId);
    const source = roles.find((role) => role.id === roleId);
    setNewRoleDraft(source ? grantsToRecord(source.grants) : {});
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
      setNewName("");
      setNewDescription("");
      setCopyFromRoleId("");
      setNewRoleDraft({});
      setPermissionPickerOpen(false);
      setFeedback({
        tone: "success",
        text: `“${result.role.name}” rolu yaradıldı.`,
      });
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
      setRoles(remaining);
      setSelectedRoleId(remaining[0]?.id ?? "");
      setDeleteOpen(false);
      setFeedback({ tone: "success", text: "Custom rol silindi." });
    });
  }

  return (
    <section className={styles.workspace} aria-busy={isPending}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon}>
            <ShieldCheck />
          </span>
          <div>
            <p>Sistem sazlamaları</p>
            <h1>Rol, icazələr və audit</h1>
            <span>
              Giriş hüquqlarını idarə edin və bütün kritik əməliyyatları
              izləyin.
            </span>
          </div>
        </div>
        <div className={styles.headerStats}>
          <span>
            <strong>{roles.length}</strong> rol
          </span>
          <span>
            <strong>{initialData.definitions.length}</strong> icazə
          </span>
          <Badge variant={initialData.canManage ? "default" : "secondary"}>
            {initialData.canManage ? "Redaktə rejimi" : "Yalnız baxış"}
          </Badge>
        </div>
      </header>
      {feedback ? (
        <div
          className={
            feedback.tone === "success" ? styles.success : styles.error
          }
          role="status"
        >
          {feedback.tone === "success" ? <Check /> : <AlertTriangle />}
          {feedback.text}
        </div>
      ) : null}
      <Tabs defaultValue="roles" className={styles.mainTabs}>
        <TabsList>
          <TabsTrigger value="roles">Rollar və icazələr</TabsTrigger>
          {initialData.canViewAudit ? (
            <TabsTrigger value="audit">
              Audit jurnalı{" "}
              <Badge variant="secondary">{initialData.auditLogs.length}</Badge>
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="roles">
          <div className={styles.layout}>
            <aside className={styles.rolePanel} aria-label="Rollar">
              <div className={styles.panelHeading}>
                <div>
                  <span>Rollar</span>
                  <small>Sistem və custom rollar</small>
                </div>
                {initialData.canManage ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus /> Yeni
                  </Button>
                ) : (
                  <Badge variant="secondary">{roles.length}</Badge>
                )}
              </div>
              <div className={styles.roleList}>
                {roles.map((role) => (
                  <button
                    type="button"
                    key={role.id}
                    className={
                      role.id === selectedRole.id
                        ? styles.activeRole
                        : styles.roleButton
                    }
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      setFeedback(null);
                    }}
                  >
                    <span className={styles.roleAvatar}>
                      {initials(role.name)}
                    </span>
                    <span className={styles.roleCopy}>
                      <strong>{role.name}</strong>
                      <small>
                        <Users /> {role.userCount} istifadəçi ·{" "}
                        {role.isSystem ? "Sistem" : "Custom"}
                      </small>
                    </span>
                    {role.code === "SUPER_ADMIN" ? (
                      <LockKeyhole />
                    ) : (
                      <ChevronRight />
                    )}
                  </button>
                ))}
              </div>
              <div className={styles.roleNotice}>
                <LockKeyhole />
                <p>
                  <strong>Super Admin qorunur</strong>
                  <span>
                    Bütün icazələrə daim sahibdir və dəyişdirilə bilməz.
                  </span>
                </p>
              </div>
            </aside>
            <div className={styles.matrixPanel}>
              <div className={styles.matrixToolbar}>
                <div>
                  <span className={styles.selectedRoleAvatar}>
                    {initials(selectedRole.name)}
                  </span>
                  <div>
                    <h2>
                      {selectedRole.name}{" "}
                      {!selectedRole.isSystem ? (
                        <Badge variant="outline">Custom</Badge>
                      ) : null}
                    </h2>
                    <p>
                      {Object.keys(currentDraft).length} aktiv icazə ·{" "}
                      {selectedRole.userCount} istifadəçi
                    </p>
                  </div>
                </div>
                <div className={styles.toolbarActions}>
                  <label className={styles.searchBox}>
                    <Search />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Bölmə və ya icazə axtar..."
                    />
                  </label>
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
              <div className={styles.legend}>
                <span>
                  <i className={styles.allowedDot} /> Aktiv icazə
                </span>
                <span>
                  <i className={styles.sensitiveDot} /> Həssas əməliyyat
                </span>
                <span>
                  <Badge variant="outline">ALL</Badge> Bütün məlumatlar
                </span>
                <span>
                  <Badge variant="outline">ASSIGNED</Badge> Yalnız təyin
                  olunanlar
                </span>
              </div>
              <div className={styles.moduleStack}>
                {modules.length ? (
                  modules.map((module) => {
                    const definitions = module.tabs.flatMap(
                      (tab) => tab.definitions,
                    );
                    const active = definitions.filter(
                      (item) => currentDraft[item.code],
                    ).length;
                    return (
                      <section className={styles.moduleCard} key={module.key}>
                        <header className={styles.moduleHeader}>
                          <div>
                            <h3>{module.label}</h3>
                            <p>
                              {active}/{definitions.length} icazə aktivdir
                            </p>
                          </div>
                          {!readOnly ? (
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setModule(definitions, true)}
                              >
                                Hamısını seç
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setModule(definitions, false)}
                              >
                                Təmizlə
                              </Button>
                            </div>
                          ) : null}
                        </header>
                        <div className={styles.tableScroll}>
                          <table className={styles.matrixTable}>
                            <thead>
                              <tr>
                                <th>Section / Tab</th>
                                {actionColumns.map((column) => (
                                  <th key={column.action}>{column.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {module.tabs.map((tab) => (
                                <tr key={`${module.key}-${tab.key}`}>
                                  <td>
                                    <strong>{tab.label}</strong>
                                    <small>
                                      {tab.definitions
                                        .map((item) => item.description)
                                        .join(" · ")}
                                    </small>
                                  </td>
                                  {actionColumns.map((column) => (
                                    <td key={column.action}>
                                      {renderPermissionCell({
                                        definitions: tab.definitions.filter(
                                          (item) =>
                                            item.action === column.action,
                                        ),
                                        draft: currentDraft,
                                        original,
                                        readOnly,
                                        onToggle: togglePermission,
                                        onScope: (code, scope) =>
                                          updateDraft((draft) => ({
                                            ...draft,
                                            [code]: scope,
                                          })),
                                      })}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    );
                  })
                ) : (
                  <div className={styles.empty}>
                    Axtarışa uyğun icazə tapılmadı.
                  </div>
                )}
              </div>
              <footer className={styles.saveBar}>
                <div>
                  <strong>
                    {changedCodes.length
                      ? `${changedCodes.length} dəyişiklik gözləyir`
                      : "Bütün dəyişikliklər saxlanılıb"}
                  </strong>
                  <span>Dəyişikliklər audit jurnalında qeyd olunur.</span>
                </div>
                <Button
                  disabled={readOnly || !changedCodes.length || isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  <ShieldCheck /> Dəyişiklikləri saxla
                </Button>
              </footer>
            </div>
          </div>
        </TabsContent>
        {initialData.canViewAudit ? (
          <TabsContent value="audit">
            <AuditLogPanel logs={initialData.auditLogs} />
          </TabsContent>
        ) : null}
      </Tabs>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className={styles.confirmDialog}>
          <DialogHeader>
            <DialogTitle>İcazə dəyişikliklərini təsdiqləyin</DialogTitle>
            <DialogDescription>
              {selectedRole.name} rolu üçün {changedCodes.length} icazə
              dəyişəcək və dərhal tətbiq olunacaq.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.changeSummary}>
            {changedCodes.slice(0, 8).map((code) => (
              <Badge
                key={code}
                variant={currentDraft[code] ? "default" : "destructive"}
              >
                {currentDraft[code] ? "+" : "−"} {code}
              </Badge>
            ))}
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="role-change-reason">
                Dəyişiklik səbəbi
              </FieldLabel>
              <textarea
                id="role-change-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Məsələn: Maliyyə komandası üçün yeni icazə əlavə edildi"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Ləğv et
            </Button>
            <Button
              disabled={reason.trim().length < 5 || isPending}
              onClick={save}
            >
              {isPending ? "Saxlanılır..." : "Təsdiqlə və saxla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={styles.createRoleDialog}>
          <DialogHeader>
            <DialogTitle>Yeni rol yarat</DialogTitle>
            <DialogDescription>
              Rol məlumatlarını daxil edin və həmin rolun görə, yarada, dəyişə,
              silə və ixrac edə biləcəyi sahələri detallı seçin.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.createRoleLayout}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-role-name">Rol adı</FieldLabel>
                <Input
                  id="new-role-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Məsələn: Filial meneceri"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-role-description">Açıqlama</FieldLabel>
                <textarea
                  id="new-role-description"
                  value={newDescription}
                  onChange={(event) => setNewDescription(event.target.value)}
                  rows={2}
                  placeholder="Rolun məsuliyyətini qısa təsvir edin"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="copy-role">Başlanğıc şablonu</FieldLabel>
                <select
                  id="copy-role"
                  value={copyFromRoleId}
                  onChange={(event) => copyRolePermissions(event.target.value)}
                >
                  <option value="">Boş rol</option>
                  {roles.map((role) => (
                    <option value={role.id} key={role.id}>
                      {role.name} icazələrini kopyala
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>
            <div className={styles.permissionPickerHeading}>
              <div>
                <strong>Detallı icazələr</strong>
                <span>
                  {Object.keys(newRoleDraft).length}/
                  {initialData.definitions.length} icazə seçilib
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPermissionPickerOpen((open) => !open)}
              >
                {permissionPickerOpen
                  ? "Siyahını bağla"
                  : "İcazə siyahısını aç"}
              </Button>
            </div>
            {permissionPickerOpen ? (
              <div className={styles.permissionPicker}>
                {createModules.map((module) => (
                  <section key={module.key}>
                    <header>
                      <strong>{module.label}</strong>
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setNewRoleDraft((draft) => {
                              const next = { ...draft };
                              for (const item of module.tabs.flatMap(
                                (tab) => tab.definitions,
                              ))
                                next[item.code] = "ALL";
                              return next;
                            })
                          }
                        >
                          Hamısını seç
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setNewRoleDraft((draft) => {
                              const next = { ...draft };
                              for (const item of module.tabs.flatMap(
                                (tab) => tab.definitions,
                              ))
                                delete next[item.code];
                              return next;
                            })
                          }
                        >
                          Təmizlə
                        </button>
                      </div>
                    </header>
                    {module.tabs.map((tab) => (
                      <div
                        className={styles.permissionPickerRow}
                        key={`${module.key}-${tab.key}`}
                      >
                        <div>
                          <strong>{tab.label}</strong>
                          <small>{tab.definitions[0]?.description}</small>
                        </div>
                        <div>
                          {tab.definitions.map((definition) => (
                            <label
                              key={definition.code}
                              title={definition.description}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(newRoleDraft[definition.code])}
                                onChange={(event) =>
                                  toggleNewRolePermission(
                                    definition,
                                    event.target.checked,
                                  )
                                }
                              />
                              <span>{definition.actionLabel}</span>
                              {newRoleDraft[definition.code] &&
                              definition.supportsScope ? (
                                <select
                                  value={newRoleDraft[definition.code]}
                                  onChange={(event) =>
                                    setNewRoleDraft((draft) => ({
                                      ...draft,
                                      [definition.code]: event.target
                                        .value as PermissionScope,
                                    }))
                                  }
                                >
                                  <option value="ALL">ALL</option>
                                  <option value="ASSIGNED">ASSIGNED</option>
                                </select>
                              ) : null}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Ləğv et
            </Button>
            <Button
              disabled={newName.trim().length < 2 || isPending}
              onClick={createRole}
            >
              {isPending
                ? "Yaradılır..."
                : `Rolu yarat · ${Object.keys(newRoleDraft).length} icazə`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>“{selectedRole.name}” rolunu sil?</DialogTitle>
            <DialogDescription>
              Rol yalnız heç bir istifadəçiyə təyin edilməyibsə silinəcək. Bu
              əməliyyat audit jurnalında qalacaq.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Ləğv et
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={deleteRole}
            >
              Rolu sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function renderPermissionCell({
  definitions,
  draft,
  original,
  readOnly,
  onToggle,
  onScope,
}: {
  definitions: PermissionDefinitionDto[];
  draft: PermissionDraft;
  original: PermissionDraft;
  readOnly: boolean;
  onToggle: (definition: PermissionDefinitionDto, checked: boolean) => void;
  onScope: (code: PermissionCode, scope: PermissionScope) => void;
}) {
  if (!definitions.length) return <span className={styles.unavailable}>—</span>;
  return (
    <div className={styles.cellStack}>
      {definitions.map((definition) => {
        const checked = Boolean(draft[definition.code]);
        const changed = draft[definition.code] !== original[definition.code];
        return (
          <div
            className={
              changed ? styles.changedPermission : styles.permissionControl
            }
            key={definition.code}
            title={`${definition.description} (${definition.code})`}
          >
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={readOnly}
                onChange={(event) => onToggle(definition, event.target.checked)}
              />
              <span>
                {definitions.length > 1 ? definition.actionLabel : ""}
              </span>
              {definition.sensitive ? <i title="Həssas əməliyyat" /> : null}
            </label>
            {checked && definition.supportsScope ? (
              <select
                aria-label={`${definition.actionLabel} məlumat əhatəsi`}
                value={draft[definition.code]}
                disabled={readOnly}
                onChange={(event) =>
                  onScope(
                    definition.code,
                    event.target.value as PermissionScope,
                  )
                }
              >
                <option value="ALL">ALL</option>
                <option value="ASSIGNED">ASSIGNED</option>
              </select>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
function grantsToRecord(grants: RoleGrantDto[]) {
  return Object.fromEntries(
    grants.map((grant) => [grant.code, grant.scope]),
  ) as PermissionDraft;
}
function draftToGrants(draft: PermissionDraft): RoleGrantDto[] {
  return Object.entries(draft).flatMap(([code, scope]) =>
    scope ? [{ code: code as PermissionCode, scope }] : [],
  );
}
function getChangedCodes(original: PermissionDraft, draft: PermissionDraft) {
  return [...new Set([...Object.keys(original), ...Object.keys(draft)])].filter(
    (code) =>
      original[code as PermissionCode] !== draft[code as PermissionCode],
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
    {
      key: string;
      label: string;
      tabs: Map<
        string,
        { key: string; label: string; definitions: PermissionDefinitionDto[] }
      >;
    }
  >();
  for (const definition of definitions) {
    const moduleGroup = modules.get(definition.module) ?? {
      key: definition.module,
      label: definition.moduleLabel,
      tabs: new Map(),
    };
    const tab = moduleGroup.tabs.get(definition.tab) ?? {
      key: definition.tab,
      label: definition.tabLabel,
      definitions: [],
    };
    tab.definitions.push(definition);
    moduleGroup.tabs.set(definition.tab, tab);
    modules.set(definition.module, moduleGroup);
  }
  return [...modules.values()].map((module) => ({
    ...module,
    tabs: [...module.tabs.values()],
  }));
}
