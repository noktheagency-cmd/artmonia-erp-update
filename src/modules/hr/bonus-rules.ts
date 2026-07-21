export type BonusStageInput = {
  threshold: number;
  bonusPool: number;
  bonusPercent: number;
  fixedAmount: number;
  churnRules?: TeacherChurnRuleInput[];
};

export type TeacherChurnRuleInput = {
  churnThreshold: number;
  deductionAmount: number;
};

export function validateBonusStages(stages: BonusStageInput[]) {
  if (stages.length === 0 || stages.length > 6) {
    throw new Error("Bonus kampaniyasında 1–6 etap olmalıdır");
  }

  let previousThreshold = 0;
  let previousPercent = -1;
  let previousFixedAmount = -1;
  for (const stage of stages) {
    if (!Number.isFinite(stage.threshold) || stage.threshold <= previousThreshold) {
      throw new Error("Etap hədəfləri müsbət və artan sıra ilə olmalıdır");
    }
    if (![stage.bonusPool, stage.bonusPercent, stage.fixedAmount].every(Number.isFinite)) {
      throw new Error("Bonus məbləğləri düzgün rəqəm olmalıdır");
    }
    if (stage.bonusPool < 0 || stage.bonusPercent < 0 || stage.fixedAmount < 0) {
      throw new Error("Bonus məbləğləri mənfi ola bilməz");
    }
    if (stage.bonusPercent > 100) {
      throw new Error("Bonus faizi 100%-dən böyük ola bilməz");
    }
    if (stage.bonusPool === 0 && stage.bonusPercent === 0 && stage.fixedAmount === 0) {
      throw new Error("Hər etapda faiz, sabit ödəniş və ya bonus fondu olmalıdır");
    }
    if (stage.bonusPool === 0 && (stage.bonusPercent < previousPercent || stage.fixedAmount < previousFixedAmount)) {
      throw new Error("Faiz və sabit ödəniş etaplar üzrə azalmamalıdır");
    }
    validateTeacherChurnRules(stage.churnRules ?? []);
    previousThreshold = stage.threshold;
    previousPercent = stage.bonusPercent;
    previousFixedAmount = stage.fixedAmount;
  }

  return stages;
}

export function validateTeacherChurnRules(rules: TeacherChurnRuleInput[]) {
  let previousThreshold = 0;
  let previousDeduction = -1;
  for (const rule of rules) {
    if (!Number.isInteger(rule.churnThreshold) || rule.churnThreshold <= previousThreshold) {
      throw new Error("Churn sayı müsbət tam ədəd və artan sıra ilə olmalıdır");
    }
    if (!Number.isFinite(rule.deductionAmount) || rule.deductionAmount < 0) {
      throw new Error("Churn kəsintisi mənfi ola bilməz");
    }
    if (rule.deductionAmount < previousDeduction) {
      throw new Error("Churn artdıqca kəsinti azalmamalıdır");
    }
    previousThreshold = rule.churnThreshold;
    previousDeduction = rule.deductionAmount;
  }
  return rules;
}

export function calculateTeacherStudentBonus(
  baseBonus: number,
  churnCount: number,
  rules: TeacherChurnRuleInput[],
) {
  const matchingRule = rules.findLast((rule) => churnCount >= rule.churnThreshold);
  const deductionAmount = money(matchingRule?.deductionAmount ?? 0);
  return {
    baseBonus: money(baseBonus),
    deductionAmount,
    amount: money(Math.max(0, baseBonus - deductionAmount)),
  };
}

export function nextMonthlyBonusPeriod(previousEndsAt: Date) {
  const startsAt = new Date(Date.UTC(
    previousEndsAt.getUTCFullYear(),
    previousEndsAt.getUTCMonth(),
    previousEndsAt.getUTCDate() + 1,
  ));
  const targetMonth = startsAt.getUTCMonth() + 1;
  const targetYear = startsAt.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const monthLater = new Date(Date.UTC(
    targetYear,
    normalizedMonth,
    Math.min(startsAt.getUTCDate(), lastDay),
  ));
  const endsAt = new Date(Date.UTC(
    monthLater.getUTCFullYear(),
    monthLater.getUTCMonth(),
    monthLater.getUTCDate() - 1,
  ));
  return { startsAt, endsAt };
}

export type TierAwardInput = {
  baseAmount: number;
  bonusPercent: number;
  fixedAmount: number;
  previousBonusPercent?: number;
  previousFixedAmount?: number;
  workloadMultiplier?: number;
};

export function calculateTierAward(input: TierAwardInput) {
  const multiplier = clamp(input.workloadMultiplier ?? 1, 0, 2);
  const percentDelta = Math.max(0, input.bonusPercent - (input.previousBonusPercent ?? 0));
  const fixedDelta = Math.max(0, input.fixedAmount - (input.previousFixedAmount ?? 0));
  const percentAmount = money(input.baseAmount * percentDelta / 100 * multiplier);
  const fixedAmount = money(fixedDelta * multiplier);
  return {
    baseAmount: money(input.baseAmount),
    percentAmount,
    fixedAmount,
    amount: money(percentAmount + fixedAmount),
    workloadMultiplier: money(multiplier),
  };
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
