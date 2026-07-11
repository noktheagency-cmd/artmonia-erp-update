export type BonusStageInput = {
  threshold: number;
  bonusPool: number;
};

export function validateBonusStages(stages: BonusStageInput[]) {
  if (stages.length === 0 || stages.length > 6) {
    throw new Error("Bonus kampaniyasında 1–6 etap olmalıdır");
  }

  let previousThreshold = 0;
  for (const stage of stages) {
    if (!Number.isFinite(stage.threshold) || stage.threshold <= previousThreshold) {
      throw new Error("Etap hədəfləri müsbət və artan sıra ilə olmalıdır");
    }
    if (!Number.isFinite(stage.bonusPool) || stage.bonusPool <= 0) {
      throw new Error("Hər etap üçün bonus fondu sıfırdan böyük olmalıdır");
    }
    previousThreshold = stage.threshold;
  }

  return stages;
}

export function splitBonusPool(pool: number, participantIds: string[]) {
  const ids = participantIds.toSorted((first, second) => first.localeCompare(second));
  if (ids.length === 0) return [];

  const totalCents = Math.round(pool * 100);
  const baseCents = Math.floor(totalCents / ids.length);
  let remainder = totalCents - baseCents * ids.length;

  return ids.map((participantId) => {
    const cents = baseCents + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    return { participantId, amount: cents / 100 };
  });
}

export function bonusProgress(currentValue: number, maxThreshold: number) {
  if (maxThreshold <= 0) return 0;
  return Math.max(0, Math.min(100, (currentValue / maxThreshold) * 100));
}
