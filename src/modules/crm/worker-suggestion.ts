import { isContactStageCompleted } from "@/modules/crm/stage";

export type WorkerSuggestion = {
  panel: "contact" | "meeting";
  title: string;
  action: string;
};

const missedContactResults = new Set(["UNANSWERED", "ANSWERED_NO_TALK", "WHATSAPP_SENT"]);
const closedStages = new Set(["REGISTERED", "LOST"]);

export function buildWorkerSuggestion(input: {
  stage: string;
  latestMeetingOutcome: string | null;
  meetingUpcoming: boolean;
  latestContactResult: string | null;
}): WorkerSuggestion | null {
  if (closedStages.has(input.stage)) return null;

  const noShow = input.latestMeetingOutcome === "NO_SHOW";
  const postponed =
    input.latestMeetingOutcome === "RESCHEDULED" || input.latestMeetingOutcome === "CANCELLED";

  if (!input.meetingUpcoming && (noShow || postponed)) {
    return {
      panel: "meeting",
      title: noShow ? "Görüş baş tutmadı" : "Görüş təxirə salındı",
      action: "Yeni görüş təyin et",
    };
  }

  if (
    input.latestContactResult &&
    missedContactResults.has(input.latestContactResult) &&
    !isContactStageCompleted(input.stage)
  ) {
    return {
      panel: "contact",
      title: "Əlaqə alınmadı",
      action: "Yenidən əlaqə saxla",
    };
  }

  return null;
}
