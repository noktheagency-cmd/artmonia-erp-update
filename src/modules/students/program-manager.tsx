"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
  X,
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
import { Input } from "@/components/ui/input";
import type { StudentListData } from "@/modules/students/queries";
import {
  programMaterialImageInputName,
  type ProgramJourneyMaterial,
  type ProgramJourneyStep,
} from "@/modules/students/program-journey";
import { unwrapActionResult } from "@/lib/action-result";
import {
  notifyCaughtError,
  notifySuccess,
} from "@/lib/app-notifications";

type Program = StudentListData["createOptions"]["programs"][number];

export function ProgramManager({
  programs,
  canManage,
  saveAction,
  deleteAction,
  archiveAction,
}: {
  programs: Program[];
  canManage: boolean;
  saveAction: (formData: FormData) => unknown | Promise<unknown>;
  deleteAction: (formData: FormData) => unknown | Promise<unknown>;
  archiveAction: (formData: FormData) => unknown | Promise<unknown>;
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<Program | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function changeArchiveStatus(formData: FormData) {
    if (!archiving || archivePending) return;
    setArchivePending(true);
    try {
      unwrapActionResult(await archiveAction(formData));
      notifySuccess(archiving.isActive ? "Proqram arxivləndi" : "Proqram arxivdən çıxarıldı");
      setArchiving(null);
      router.refresh();
    } catch (error) {
      notifyCaughtError(error, "Proqramın arxiv statusu dəyişdirilmədi.");
    } finally {
      setArchivePending(false);
    }
  }

  function openEditor(program?: Program) {
    const next = program ? cloneProgram(program) : emptyProgram();
    setEditing(next);
    setExpandedStepId(next.lessonTopics[0]?.id ?? null);
  }

  async function saveProgram(formData: FormData) {
    if (!editing || saving) return;
    setSaving(true);
    const uploadedPaths: string[] = [];
    try {
      const preparedSteps = cloneSteps(editing.lessonTopics);
      for (const step of preparedSteps) {
        for (const material of step.materials) {
          const inputName = programMaterialImageInputName(step.id, material.id);
          const imageFile = formData.get(inputName);
          formData.delete(inputName);
          if (!(imageFile instanceof File) || imageFile.size === 0) continue;

          const uploadData = new FormData();
          uploadData.set("file", imageFile);
          uploadData.set("topicId", step.id);
          
          const response = await fetch("/api/programs/journey-images", {
            method: "POST",
            body: uploadData,
          });
          const payload = await response.json() as {
            path?: string;
            url?: string;
            error?: string;
          };
          if (!response.ok || !payload.path) {
            throw new Error(payload.error || "Journey şəkli yüklənmədi.");
          }
          uploadedPaths.push(payload.path);
          material.imageObjectPath = payload.path;
          material.imageUrl = payload.url ?? null;
        }
      }

      formData.set("journeySteps", serializeJourneySteps(preparedSteps));
      unwrapActionResult(await saveAction(formData));
      setEditing(null);
      notifySuccess(
        editing.id ? "Proqram yeniləndi" : "Proqram yaradıldı",
        "Dərslər və addımlar mobil tətbiq üçün hazırdır.",
      );
    } catch (error) {
      await Promise.allSettled(
        uploadedPaths.map((path) =>
          fetch("/api/programs/journey-images", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          }),
        ),
      );
      notifyCaughtError(error, "Proqram saxlanmadı.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProgram(formData: FormData) {
    try {
      unwrapActionResult(await deleteAction(formData));
      setDeleting(null);
    } catch (error) {
      notifyCaughtError(error, "Proqram silinmədi.");
    }
  }

  function addStep() {
    const step: ProgramJourneyStep = {
      id: crypto.randomUUID(),
      sequence: (editing?.lessonTopics.length ?? 0) + 1,
      title: "",
      materials: [],
    };
    setEditing((current) => current ? {
      ...current,
      lessonTopics: [...current.lessonTopics, step],
    } : current);
    setExpandedStepId(step.id);
  }

  function updateStepTitle(stepId: string, title: string) {
    setEditing((current) => current ? {
      ...current,
      lessonTopics: current.lessonTopics.map((step) =>
        step.id === stepId ? { ...step, title } : step
      ),
    } : current);
  }

  function moveStep(stepId: string, direction: -1 | 1) {
    setEditing((current) => {
      if (!current) return current;
      const index = current.lessonTopics.findIndex((step) => step.id === stepId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.lessonTopics.length) {
        return current;
      }
      const steps = [...current.lessonTopics];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return {
        ...current,
        lessonTopics: steps.map((step, stepIndex) => ({
          ...step,
          sequence: stepIndex + 1,
        })),
      };
    });
  }

  function removeStep(stepId: string) {
    setEditing((current) => current ? {
      ...current,
      lessonTopics: current.lessonTopics
        .filter((step) => step.id !== stepId)
        .map((step, index) => ({ ...step, sequence: index + 1 })),
    } : current);
    if (expandedStepId === stepId) setExpandedStepId(null);
  }

  function addMaterial(stepId: string) {
    setEditing((current) => current ? {
      ...current,
      lessonTopics: current.lessonTopics.map((step) =>
        step.id === stepId
          ? {
              ...step,
              materials: [...step.materials, emptyMaterial()],
            }
          : step
      ),
    } : current);
  }

  function updateMaterial(
    stepId: string,
    materialId: string,
    patch: Partial<ProgramJourneyMaterial>,
  ) {
    setEditing((current) => current ? {
      ...current,
      lessonTopics: current.lessonTopics.map((step) =>
        step.id === stepId ? {
          ...step,
          materials: step.materials.map((material) =>
            material.id === materialId ? { ...material, ...patch } : material
          ),
        } : step
      ),
    } : current);
  }

  function removeMaterial(stepId: string, materialId: string) {
    setEditing((current) => current ? {
      ...current,
      lessonTopics: current.lessonTopics.map((step) =>
        step.id === stepId ? {
          ...step,
          materials: step.materials.filter((material) => material.id !== materialId),
        } : step
      ),
    } : current);
  }

  return (
    <section className="program-manager">
      <div className="program-manager-head">
        <div>
          <h2>Proqramlar</h2>
          <p>Paket qiymətləri, dərs sayı və Dərslər və addımlar</p>
        </div>
        <Button onClick={() => openEditor()} disabled={!canManage}>
          <Plus data-icon="inline-start" />
          Proqram yarat
        </Button>
      </div>

      <div className="program-card-actions" role="group" aria-label="Proqram arxivi">
        <Button type="button" variant={showArchived ? "outline" : "default"} aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Aktiv proqramlar ({programs.filter((program) => program.isActive).length})</Button>
        <Button type="button" variant={showArchived ? "default" : "outline"} aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Arxiv ({programs.filter((program) => !program.isActive).length})</Button>
      </div>
      <div className="program-manager-grid">
        {programs.filter((program) => program.isActive !== showArchived).map((program) => (
          <article className="program-card" key={program.id} data-active={program.isActive}>
            <div>
              <span>{program.isActive ? "Tədris proqramı" : "Arxivdə"}</span>
              <strong>{program.name}</strong>
              <small>{program.description || "Qeyd yoxdur"}</small>
            </div>
            <div className="program-card-meta">
              <b>{program.monthlyFee} AZN</b>
              <span>{program.lessonsPerMonth || "—"} dərs / ay</span>
            </div>
            <div className="program-topic-summary">
              <span>{program.lessonTopics.length} Journey addımı</span>
              <small>
                {program.lessonTopics[0]
                  ? "1. " + program.lessonTopics[0].title
                  : "Addım əlavə edilməyib"}
              </small>
            </div>
            {canManage ? (
              <div className="program-card-actions">
                <Button type="button" variant="outline" size="sm" onClick={() => setArchiving(program)}>
                  {program.isActive ? <Archive /> : <ArchiveRestore />}
                  {program.isActive ? "Arxivlə" : "Arxivdən çıxar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={program.name + " proqramını redaktə et"}
                  onClick={() => openEditor(program)}
                >
                  <BookOpen />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={program.name + " proqramını sil"}
                  onClick={() => setDeleting(program)}
                >
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {programs.every((program) => program.isActive === showArchived) ? (
        <p className="empty-state">{showArchived ? "Arxivdə proqram yoxdur." : "Aktiv proqram yoxdur."}</p>
      ) : null}
      <Dialog open={archiving !== null} onOpenChange={(open) => { if (!open && !archivePending) setArchiving(null); }}>
        <DialogContent className="program-dialog">
          <DialogHeader>
            <DialogTitle>{archiving?.isActive ? "Proqramı arxivlə" : "Proqramı arxivdən çıxar"}</DialogTitle>
            <DialogDescription>
              {archiving?.name}. {archiving?.isActive ? "Proqram yeni qeydiyyat seçimlərindən çıxarılacaq. Mövcud tələbələr, onların tədris paketləri və ödəniş tarixçəsi saxlanılacaq." : "Proqram yenidən yeni qeydiyyat seçimlərində görünəcək."}
            </DialogDescription>
          </DialogHeader>
          <form action={changeArchiveStatus}>
            <input type="hidden" name="id" value={archiving?.id ?? ""} />
            <input type="hidden" name="archived" value={String(archiving?.isActive ?? false)} />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={archivePending} onClick={() => setArchiving(null)}>Ləğv et</Button>
              <Button type="submit" disabled={archivePending}>{archivePending ? "İcra olunur..." : archiving?.isActive ? "Arxivlə" : "Arxivdən çıxar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent className="program-dialog program-journey-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Proqramı redaktə et" : "Yeni proqram"}
            </DialogTitle>
            <DialogDescription>
              Proqram məlumatlarını və mobil Dərslər və addımlarnı idarə edin.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form action={saveProgram} className="student-create-form program-journey-form">
              <input name="id" type="hidden" value={editing.id} />
              <input
                name="journeySteps"
                type="hidden"
                value={serializeJourneySteps(editing.lessonTopics)}
              />
              <div className="program-basics">
                <div className="field-grid">
                  <label className="form-field">
                    <span>Proqram adı</span>
                    <Input name="name" defaultValue={editing.name} required />
                  </label>
                  <label className="form-field">
                    <span>Kod</span>
                    <Input name="code" defaultValue={editing.code} />
                  </label>
                </div>
                <div className="field-grid">
                  <label className="form-field">
                    <span>Aylıq qiymət</span>
                    <Input
                      name="monthlyFee"
                      defaultValue={editing.monthlyFee}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Dərs sayı / ay</span>
                    <Input
                      name="lessonsPerMonth"
                      defaultValue={editing.lessonsPerMonth}
                      inputMode="numeric"
                    />
                  </label>
                </div>
                <label className="form-field">
                  <span>Qeyd</span>
                  <Input
                    name="description"
                    defaultValue={editing.description}
                    maxLength={500}
                  />
                </label>
              </div>

              <section className="journey-editor">
                <div className="journey-editor-head">
                  <div>
                    <strong>Dərslər və addımlar</strong>
                    <small>
                      Bir dərs bir addımdır. Dərs sayı qədər addım mobil tətbiqdə görünür.
                    </small>
                  </div>
                  <Button type="button" variant="outline" onClick={addStep}>
                    <Plus data-icon="inline-start" />
                    Dərs əlavə et
                  </Button>
                </div>

                {editing.lessonTopics.length ? (
                  <div className="journey-step-list">
                    {editing.lessonTopics.map((step, index) => {
                      const expanded = expandedStepId === step.id;
                      return (
                        <article
                          className="journey-step-card"
                          data-expanded={expanded}
                          key={step.id}
                        >
                          <div className="journey-step-head">
                            <span className="journey-step-number">{index + 1}</span>
                            <label>
                              <span className="sr-only">
                                {index + 1} nömrəli addımın başlığı
                              </span>
                              <Input
                                value={step.title}
                                onChange={(event) =>
                                  updateStepTitle(step.id, event.target.value)}
                                placeholder="Addımın başlığı"
                                minLength={2}
                                maxLength={200}
                                required
                              />
                            </label>
                            <div className="journey-step-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Addımı yuxarı daşı"
                                disabled={index === 0}
                                onClick={() => moveStep(step.id, -1)}
                              >
                                <ChevronUp />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Addımı aşağı daşı"
                                disabled={index === editing.lessonTopics.length - 1}
                                onClick={() => moveStep(step.id, 1)}
                              >
                                <ChevronDown />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Addımı sil"
                                onClick={() => removeStep(step.id)}
                              >
                                <Trash2 />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={expanded ? "Addımı yığ" : "Addımı aç"}
                                onClick={() =>
                                  setExpandedStepId(expanded ? null : step.id)}
                              >
                                {expanded ? <X /> : <BookOpen />}
                              </Button>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="journey-step-body">
                              {step.materials.map((material) => <JourneyMaterialEditor
                                key={material.id} stepId={step.id} material={material}
                                onChange={(patch) => updateMaterial(step.id, material.id, patch)}
                                onRemove={() => removeMaterial(step.id, material.id)}
                              />)}
                              <Button type="button" variant="outline" disabled={step.materials.length >= 20}
                                onClick={() => addMaterial(step.id)}><Plus /> Material əlavə et</Button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="journey-editor-empty">
                    <BookOpen aria-hidden="true" />
                    <strong>Journey hələ boşdur</strong>
                    <small>İlk dərs addımını əlavə etməklə başlayın.</small>
                    <Button type="button" variant="outline" onClick={addStep}>
                      <Plus data-icon="inline-start" />
                      İlk addımı əlavə et
                    </Button>
                  </div>
                )}
              </section>

              <DialogFooter className="program-journey-footer">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                  disabled={saving}
                >
                  Ləğv et
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="is-spinning" data-icon="inline-start" />
                  ) : null}
                  {saving ? "Yadda saxlanılır..." : "Yadda saxla"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent className="program-dialog program-delete-dialog">
          <DialogHeader>
            <DialogTitle>Proqramı silmək?</DialogTitle>
            <DialogDescription>
              “{deleting?.name}” proqramı birdəfəlik silinəcək. Bu əməliyyat üçün
              səbəb yazmaq məcburidir.
            </DialogDescription>
          </DialogHeader>
          <form action={deleteProgram} className="program-delete-form">
            <input name="id" type="hidden" value={deleting?.id || ""} />
            <label className="form-field">
              <span>Silmə səbəbi</span>
              <textarea
                name="reason"
                rows={4}
                minLength={3}
                maxLength={500}
                required
                autoFocus
                placeholder="Proqramın niyə silindiyini yazın..."
              />
            </label>
            <small>
              Minimum 3 simvol daxil edin. Səbəb audit jurnalında saxlanılacaq.
            </small>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleting(null)}
              >
                Ləğv et
              </Button>
              <Button type="submit" variant="destructive">
                <Trash2 data-icon="inline-start" />
                Proqramı sil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function JourneyMaterialEditor({
  stepId,
  material,
  onChange,
  onRemove,
}: {
  stepId: string;
  material: ProgramJourneyMaterial;
  onChange: (patch: Partial<ProgramJourneyMaterial>) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const visibleImageUrl = previewUrl ?? material.imageUrl;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectImage(file: File | undefined) {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function removeImage() {
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    onChange({ imageObjectPath: null, imageUrl: null });
  }

  return (
    <div className="journey-material-editor">
      <div className="journey-material-fields">
        <label className="form-field">
          <span>Mövzu</span>
          <Input
            value={material.subject}
            onChange={(event) => onChange({ subject: event.target.value })}
            minLength={2}
            maxLength={200}
            placeholder="Məsələn: Kürə"
            required
          />
        </label>
        <label className="form-field">
          <span>Məqsəd</span>
          <textarea
            value={material.objective}
            onChange={(event) => onChange({ objective: event.target.value })}
            minLength={2}
            maxLength={1000}
            placeholder="Tələbənin bu addımda öyrənəcəyi bacarıq"
            required
          />
        </label>
        <label className="form-field">
          <span>Ev tapşırığı</span>
          <textarea
            value={material.homework}
            onChange={(event) => onChange({ homework: event.target.value })}
            minLength={2}
            maxLength={2000}
            placeholder="Mobil tətbiqdə göstəriləcək tapşırıq"
            required
          />
        </label>
      </div>

      <div className="journey-material-media">
        <span>Şəkil</span>
        <div className="journey-image-preview">
          {visibleImageUrl ? (
            <Image
              src={visibleImageUrl}
              alt={material.id + " material şəkli"}
              fill
              sizes="180px"
              unoptimized={visibleImageUrl.startsWith("blob:")}
            />
          ) : (
            <ImagePlus aria-hidden="true" />
          )}
        </div>
        <input
          ref={inputRef}
          name={programMaterialImageInputName(stepId, material.id)}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => selectImage(event.target.files?.[0])}
        />
        <small>JPG, PNG və ya WebP · maksimum 5 MB</small>
        {visibleImageUrl ? (
          <Button type="button" variant="ghost" onClick={removeImage}>
            <X data-icon="inline-start" />
            Şəkli sil
          </Button>
        ) : null}
      </div>

      <Button
        className="journey-material-remove"
        type="button"
        variant="ghost"
        onClick={onRemove}
      >
        <Trash2 data-icon="inline-start" />
        {material.id} materialını sil
      </Button>
    </div>
  );
}

function emptyProgram(): Program {
  return {
    id: "",
    name: "",
    code: "",
    monthlyFee: "",
    lessonsPerMonth: "",
    description: "",
    lessonTopics: [],
    isActive: true,
  };
}

function emptyMaterial(): ProgramJourneyMaterial {
  return {
    id: crypto.randomUUID(),
    subject: "",
    objective: "",
    homework: "",
    imageObjectPath: null,
    imageUrl: null,
  };
}

function cloneProgram(program: Program): Program {
  return {
    ...program,
    lessonTopics: cloneSteps(program.lessonTopics),
  };
}

function cloneSteps(steps: ProgramJourneyStep[]) {
  return steps.map((step) => ({
    ...step,
    materials: step.materials.map((material) => ({ ...material })),
  }));
}

function serializeJourneySteps(steps: ProgramJourneyStep[]) {
  return JSON.stringify(
    steps.map((step) => ({
      id: step.id,
      title: step.title,
      materials: step.materials.map((material) => ({
        id: material.id,
        subject: material.subject,
        objective: material.objective,
        homework: material.homework,
        imageObjectPath: material.imageObjectPath,
      })),
    })),
  );
}
