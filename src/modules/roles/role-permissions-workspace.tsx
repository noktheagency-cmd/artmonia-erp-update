"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDollarSign,
  Eye,
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
  const [selectedRoleId, setSelectedRoleId] = useState(initialData.roles[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, PermissionDraft>>(() =>
    Object.fromEntries(initialData.roles.map((role) => [role.id, grantsToRecord(role.grants)])),
  );
  const [query, setQuery] = useState("");
  const [activeModule, setActiveModule] = useState("ALL");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [createStep, setCreateStep] = useState<CreateStep>(1);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [copyFromRoleId, setCopyFromRoleId] = useState("");
  const [newRoleDraft, setNewRoleDraft] = useState<PermissionDraft>({});
  const [createQuery, setCreateQuery] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("az"));
  const deferredCreateQuery = useDeferredValue(createQuery.trim().toLocaleLowerCase("az"));

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
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
    updateDraft((draft) =>
      changePermission(draft, definition, checked, initialData.definitions),
    );
  }

  function setModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    updateDraft((draft) =>
      changePermissionGroup(draft, definitions, checked, initialData.definitions),
    );
  }

  function toggleNewRolePermission(definition: PermissionDefinitionDto, checked: boolean) {
    setNewRoleDraft((draft) =>
      changePermission(draft, definition, checked, initialData.definitions),
    );
  }

  function setNewRoleModule(definitions: PermissionDefinitionDto[], checked: boolean) {
    setNewRoleDraft((draft) =>
      changePermissionGroup(draft, definitions, checked, initialData.definitions),
    );
  }

  function copyRolePermissions(roleId: string) {
    setCopyFromRoleId(roleId);
    const source = roles.find((role) => role.id === roleId);
    setNewRoleDraft(source ? grantsToRecord(source.grants) : {});
  }

  function resetCreateFlow() {
    setCreateStep(1);
    setNewName("");
    setNewDescription("");
    setCopyFromRoleId("");
    setNewRoleDraft({});
    setCreateQuery("");
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
      setRoles(remaining);
      setSelectedRoleId(remaining[0]?.id ?? "");
      setDeleteOpen(false);
      setFeedback({ tone: "success", text: "Rol silindi." });
    });
  }

  return (
    <section className={styles.workspace} aria-busy={isPending}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Rol və icazələr</h1>
          <p>Komandanızın nəyə çıxışı olduğunu sadə şəkildə idarə edin.</p>
        </div>
        {initialData.canManage ? (
          <Button className={styles.primaryAction} onClick={() => setCreateOpen(true)}>
            <Plus /> Yeni rol yarat
          </Button>
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
              Audit jurnalı <span>{initialData.auditLogs.length}</span>
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
                    const activeCount = definitions.filter((item) => currentDraft[item.code]).length;
                    const allSelected = activeCount === definitions.length;
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
                          {!readOnly ? (
                            <label className={styles.selectAll}>
                              <span>Hamısını seç</span>
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={(event) => setModule(definitions, event.target.checked)}
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
                              readOnly={readOnly}
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
                    const activeCount = module.definitions.filter((item) => newRoleDraft[item.code]).length;
                    return (
                      <section className={styles.drawerModule} key={module.key}>
                        <header>
                          <div>
                            <ModuleIcon module={module.key} />
                            <strong>{module.label}</strong>
                            <span>{activeCount}/{module.definitions.length}</span>
                          </div>
                          <label className={styles.selectAll}>
                            <span>Hamısını seç</span>
                            <input
                              type="checkbox"
                              checked={activeCount === module.definitions.length}
                              onChange={(event) => setNewRoleModule(module.definitions, event.target.checked)}
                            />
                          </label>
                        </header>
                        {module.definitions.map((definition) => (
                          <PermissionRow
                            key={definition.code}
                            compact
                            definition={definition}
                            checked={Boolean(newRoleDraft[definition.code])}
                            scope={newRoleDraft[definition.code]}
                            changed={false}
                            readOnly={false}
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
              Rol yalnız heç bir istifadəçiyə təyin edilməyibsə silinəcək. Bu əməliyyat audit jurnalında qalacaq.
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
