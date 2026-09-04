"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ProgramLessonTrack } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { requireMutationActor } from "@/server/auth/actor";
import { optionalFormString } from "@/modules/shared/form-values";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import {
  PROGRAM_MATERIAL_TRACKS,
  type ProgramMaterialTrack,
} from "@/modules/students/program-journey";
import { deleteProgramJourneyImage } from "@/server/storage/erp-files";

const optionalText = (max: number) =>
  z.preprocess(optionalFormString, z.string().max(max).optional());

const imageObjectPathSchema = z.string().max(500).regex(
  /^program-journey\/[0-9a-f-]{36}\/(?:H|HB|B|2B)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i,
);
const journeyMaterialSchema = z.object({
  track: z.enum(PROGRAM_MATERIAL_TRACKS),
  subject: z.string().trim().min(2).max(200),
  objective: z.string().trim().min(2).max(1_000),
  homework: z.string().trim().min(2).max(2_000),
  imageObjectPath: imageObjectPathSchema.nullable(),
});
const journeyStepSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  materials: z.array(journeyMaterialSchema).max(PROGRAM_MATERIAL_TRACKS.length),
}).superRefine((step, context) => {
  const uniqueTracks = new Set(step.materials.map((material) => material.track));
  if (uniqueTracks.size !== step.materials.length) {
    context.addIssue({
      code: "custom",
      path: ["materials"],
      message: "Eyni material növü bir addımda yalnız bir dəfə ola bilər.",
    });
  }
  for (const [index, material] of step.materials.entries()) {
    if (
      material.imageObjectPath
      && !material.imageObjectPath.startsWith(
        "program-journey/" + step.id + "/" + material.track + "/",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["materials", index, "imageObjectPath"],
        message: "Şəkil bu Journey addımına aid deyil.",
      });
    }
  }
});
const journeyStepsSchema = z.array(journeyStepSchema).max(120).superRefine(
  (steps, context) => {
    if (new Set(steps.map((step) => step.id)).size !== steps.length) {
      context.addIssue({
        code: "custom",
        message: "Journey addım identifikatorları təkrarlana bilməz.",
      });
    }
  },
);

const programSchema = z.object({
  id: z.preprocess(optionalFormString, z.string().uuid().optional()),
  name: z.string().trim().min(2).max(120),
  code: optionalText(40),
  monthlyFee: z.preprocess((value) => Number(String(value).replace(",", ".")), z.number().min(0).max(100_000)),
  lessonsPerMonth: z.preprocess(optionalFormString, z.coerce.number().int().positive().max(120).optional()),
  description: optionalText(500),
  journeySteps: z.string().max(250_000),
});

const deleteProgramSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

async function saveProgramActionImpl(formData: FormData) {
  await requireMutationActor("settings.manage");
  const input = programSchema.parse(Object.fromEntries(formData));
  const journeySteps = journeyStepsSchema.parse(parseJson(input.journeySteps));
  const prisma = getPrisma();
  const data = {
    name: input.name,
    code: input.code ?? null,
    defaultMonthlyFee: input.monthlyFee,
    defaultLessonsPerMonth: input.lessonsPerMonth ?? null,
    description: input.description ?? null,
    isActive: true,
  };

  const previous = input.id
    ? await prisma.program.findUnique({
        where: { id: input.id },
        select: {
          lessonTopics: {
            select: {
              id: true,
              materials: { select: { imageObjectPath: true } },
            },
          },
        },
      })
    : null;
  if (input.id && !previous) {
    throw new PublicActionError("Proqram tapılmadı", "NOT_FOUND");
  }
  const previousImagePaths = previous?.lessonTopics.flatMap((topic) =>
    topic.materials.flatMap((material) =>
      material.imageObjectPath ? [material.imageObjectPath] : [],
    ),
  ) ?? [];
  const retainedImagePaths = new Set(
    journeySteps.flatMap((step) =>
      step.materials.flatMap((material) =>
        material.imageObjectPath ? [material.imageObjectPath] : [],
      ),
    ),
  );

  await prisma.$transaction(async (tx) => {
    const program = input.id
      ? await tx.program.update({ where: { id: input.id }, data, select: { id: true } })
      : await tx.program.create({ data, select: { id: true } });
    const incomingTopicIds = journeySteps.map((step) => step.id);
    const foreignTopic = incomingTopicIds.length
      ? await tx.programLessonTopic.findFirst({
          where: {
            id: { in: incomingTopicIds },
            programId: { not: program.id },
          },
          select: { id: true },
        })
      : null;
    if (foreignTopic) {
      throw new PublicActionError(
        "Journey addımlarından biri başqa proqrama aiddir",
        "CONFLICT",
      );
    }

    await tx.$executeRawUnsafe(
      'set constraints "program_lesson_topics_program_sequence_key" deferred',
    );
    await tx.programLessonTopic.deleteMany({
      where: {
        programId: program.id,
        ...(incomingTopicIds.length ? { id: { notIn: incomingTopicIds } } : {}),
      },
    });

    for (const [index, step] of journeySteps.entries()) {
      const topic = await tx.programLessonTopic.upsert({
        where: { id: step.id },
        create: {
          id: step.id,
          programId: program.id,
          sequence: index + 1,
          title: step.title,
        },
        update: {
          sequence: index + 1,
          title: step.title,
        },
        select: { id: true },
      });
      const tracks = step.materials.map((material) =>
        toProgramLessonTrack(material.track),
      );
      await tx.programLessonMaterial.deleteMany({
        where: {
          topicId: topic.id,
          ...(tracks.length ? { track: { notIn: tracks } } : {}),
        },
      });
      for (const material of step.materials) {
        const track = toProgramLessonTrack(material.track);
        await tx.programLessonMaterial.upsert({
          where: {
            topicId_track: { topicId: topic.id, track },
          },
          create: {
            topicId: topic.id,
            track,
            subject: material.subject,
            objective: material.objective,
            homework: material.homework,
            imageObjectPath: material.imageObjectPath,
          },
          update: {
            subject: material.subject,
            objective: material.objective,
            homework: material.homework,
            imageObjectPath: material.imageObjectPath,
          },
        });
      }
    }
  });

  await Promise.all(
    previousImagePaths
      .filter((path) => !retainedImagePaths.has(path))
      .map((path) => deleteProgramJourneyImage(path)),
  );

  revalidatePath("/students");
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new PublicActionError("Journey addımları düzgün formatda deyil", "VALIDATION");
  }
}

function toProgramLessonTrack(track: ProgramMaterialTrack) {
  return track === "2B" ? ProgramLessonTrack.TWO_B : ProgramLessonTrack[track];
}

async function deleteProgramActionImpl(formData: FormData) {
  const actor = await requireMutationActor("settings.manage");
  const input = deleteProgramSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();

  const deletedImagePaths = await prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        code: true,
        defaultMonthlyFee: true,
        defaultLessonsPerMonth: true,
        description: true,
        isActive: true,
        lessonTopics: {
          select: {
            materials: { select: { imageObjectPath: true } },
          },
        },
      },
    });
    if (!program) throw new PublicActionError("Proqram tapılmadı", "NOT_FOUND");

    const usage = await tx.enrollment.count({ where: { programId: program.id } });
    if (usage > 0) {
      throw new PublicActionError(
        "Proqramı silməzdən əvvəl tələbə təyinatlarını başqa proqrama keçirin",
        "CONFLICT",
      );
    }

    await tx.program.delete({ where: { id: program.id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "program.delete",
      entityType: "program",
      entityId: program.id,
      before: {
        name: program.name,
        code: program.code,
        monthlyFee: program.defaultMonthlyFee.toString(),
        lessonsPerMonth: program.defaultLessonsPerMonth,
        description: program.description,
        isActive: program.isActive,
      },
      after: { permanentlyDeleted: true },
      reason: input.reason,
    });
    return program.lessonTopics.flatMap((topic) =>
      topic.materials.flatMap((material) =>
        material.imageObjectPath ? [material.imageObjectPath] : [],
      ),
    );
  });
  await Promise.all(deletedImagePaths.map((path) => deleteProgramJourneyImage(path)));
  revalidatePath("/students");
}

export const saveProgramAction = safeServerAction(
  saveProgramActionImpl,
  "Proqram saxlanmadı.",
);
export const deleteProgramAction = safeServerAction(
  deleteProgramActionImpl,
  "Proqram silinmədi.",
);
