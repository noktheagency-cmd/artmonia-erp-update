export type ProgramJourneyMaterial = {
  id: string;
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
  materialId: string,
) {
  return "programMaterialImage:" + topicId + ":" + materialId;
}
