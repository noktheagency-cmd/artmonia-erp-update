export const PROGRAM_MATERIAL_TRACKS = ["H", "HB", "B", "2B"] as const;

export type ProgramMaterialTrack = (typeof PROGRAM_MATERIAL_TRACKS)[number];

export type ProgramJourneyMaterial = {
  id: string;
  track: ProgramMaterialTrack;
  subject: string;
  objective: string;
  homework: string;
  imageObjectPath: string | null;
  imageUrl: string | null;
};

export type ProgramJourneyStep = {
  id: string;
  sequence: number;
  title: string;
  materials: ProgramJourneyMaterial[];
};

export function programMaterialImageInputName(
  topicId: string,
  track: ProgramMaterialTrack,
) {
  return "programMaterialImage:" + topicId + ":" + track;
}
