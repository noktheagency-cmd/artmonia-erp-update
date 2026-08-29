export const MOBILE_GAMIFICATION_RULES = {
  presentXp: 100,
  homeworkXp: 25,
  levelStepXp: 500,
  streakUnit: "lesson" as const,
  absentBreaksStreak: true,
  excusedBreaksStreak: false,
};

type TopicInput = {
  id: string;
  sequence: number;
  title: string;
};

type AttendanceInput = {
  status: "PRESENT" | "ABSENT" | "EXCUSED";
  markedAt: Date;
  sessionDate: Date;
  startTime: string;
};

type HomeworkInput = {
  completedAt: Date;
};

type GamificationInput = {
  programId: string;
  topics: TopicInput[];
  attendance: AttendanceInput[];
  homeworkCompletions: HomeworkInput[];
  weekStartsAt: Date;
};

export function calculateMobileJourneyAndGamification(input: GamificationInput) {
  const attendance = input.attendance.toSorted(compareAttendance);
  const present = attendance.filter((item) => item.status === "PRESENT");
  const homework = input.homeworkCompletions.toSorted(
    (left, right) => left.completedAt.getTime() - right.completedAt.getTime(),
  );
  const completedTopicCount = Math.min(present.length, input.topics.length);
  const topics = input.topics.map((topic, index) => {
    const status = index < completedTopicCount
      ? "completed" as const
      : index === completedTopicCount
        ? "current" as const
        : "locked" as const;
    return {
      identifier: `program:${input.programId}:topic:${topic.sequence}`,
      number: topic.sequence,
      title: topic.title,
      status,
      completedAt: status === "completed"
        ? present[index]?.markedAt.toISOString() ?? null
        : null,
    };
  });
  const currentTopic = topics.find((topic) => topic.status === "current") ?? null;
  const progressPercent = topics.length
    ? Math.round((completedTopicCount / topics.length) * 100)
    : 0;

  const streak = calculateLessonStreak(attendance);
  const totalXp = present.length * MOBILE_GAMIFICATION_RULES.presentXp
    + homework.length * MOBILE_GAMIFICATION_RULES.homeworkXp;
  const earnedThisWeek = present.filter((item) => item.markedAt >= input.weekStartsAt).length
    * MOBILE_GAMIFICATION_RULES.presentXp
    + homework.filter((item) => item.completedAt >= input.weekStartsAt).length
    * MOBILE_GAMIFICATION_RULES.homeworkXp;
  const levelNumber = Math.floor(totalXp / MOBILE_GAMIFICATION_RULES.levelStepXp) + 1;
  const levelStartXp = (levelNumber - 1) * MOBILE_GAMIFICATION_RULES.levelStepXp;
  const nextLevelXp = levelNumber * MOBILE_GAMIFICATION_RULES.levelStepXp;
  const levelProgressPercent = Math.round(
    ((totalXp - levelStartXp) / MOBILE_GAMIFICATION_RULES.levelStepXp) * 100,
  );

  const achievements = buildAchievements({
    present,
    homework,
    totalTopics: input.topics.length,
    progressPercent,
    streak,
  });
  const rewards = buildRewards(present, homework, totalXp);
  const latestAchievement = achievements
    .filter((item) => item.status === "earned" && item.earnedAt)
    .toSorted((left, right) => (right.earnedAt ?? "").localeCompare(left.earnedAt ?? ""))[0]
    ?? null;

  return {
    journey: {
      topics,
      currentTopic,
      completedTopicCount,
      totalTopicCount: topics.length,
      progressPercent,
    },
    gamification: {
      xp: { total: totalXp, earnedThisWeek },
      level: {
        number: levelNumber,
        title: levelTitle(levelNumber),
        currentXp: totalXp,
        nextLevelXp,
        progressPercent: levelProgressPercent,
      },
      streak: {
        current: streak.current,
        best: streak.best,
        unit: MOBILE_GAMIFICATION_RULES.streakUnit,
      },
      achievements,
      rewards,
      latestAchievement,
      nextReward: rewards.find((item) => item.status === "locked") ?? null,
    },
    rules: MOBILE_GAMIFICATION_RULES,
  };
}

function calculateLessonStreak(attendance: AttendanceInput[]) {
  let current = 0;
  let best = 0;
  let firstFiveAt: Date | null = null;
  for (const item of attendance) {
    if (item.status === "PRESENT") {
      current += 1;
      if (current > best) {
        best = current;
        if (best === 5) firstFiveAt = item.markedAt;
      }
    } else if (item.status === "ABSENT") {
      current = 0;
    }
  }
  return { current, best, firstFiveAt };
}

function buildAchievements({
  present,
  homework,
  totalTopics,
  progressPercent,
  streak,
}: {
  present: AttendanceInput[];
  homework: HomeworkInput[];
  totalTopics: number;
  progressPercent: number;
  streak: ReturnType<typeof calculateLessonStreak>;
}) {
  const halfwayCount = totalTopics ? Math.ceil(totalTopics / 2) : 0;
  return [
    achievement("first-lesson", "İlk addım", "İlk dərsdə iştirak et", present[0]?.markedAt),
    achievement("three-lessons", "Davamlı başlanğıc", "3 dərsdə iştirak et", present[2]?.markedAt),
    achievement("five-lesson-streak", "Dərs seriyası", "Ardıcıl 5 dərsdə iştirak et", streak.best >= 5 ? streak.firstFiveAt : null),
    achievement(
      "program-halfway",
      "Yolun yarısı",
      "Proqram mövzularının 50%-ni tamamla",
      totalTopics > 0 && progressPercent >= 50 ? present[halfwayCount - 1]?.markedAt : null,
    ),
    achievement(
      "program-complete",
      "Proqram ustası",
      "Bütün proqram mövzularını tamamla",
      totalTopics > 0 && progressPercent === 100 ? present[totalTopics - 1]?.markedAt : null,
    ),
    achievement("five-homeworks", "Tapşırıq ustası", "5 ev tapşırığını tamamla", homework[4]?.completedAt),
  ];
}

function achievement(
  id: string,
  title: string,
  description: string,
  earnedAt?: Date | null,
) {
  return {
    id,
    title,
    description,
    iconKey: id,
    status: earnedAt ? "earned" as const : "locked" as const,
    earnedAt: earnedAt?.toISOString() ?? null,
  };
}

function buildRewards(
  present: AttendanceInput[],
  homework: HomeworkInput[],
  totalXp: number,
) {
  const timeline = [
    ...present.map((item) => ({ at: item.markedAt, xp: MOBILE_GAMIFICATION_RULES.presentXp })),
    ...homework.map((item) => ({ at: item.completedAt, xp: MOBILE_GAMIFICATION_RULES.homeworkXp })),
  ].toSorted((left, right) => left.at.getTime() - right.at.getTime());
  const milestones = [
    { id: "bronze-badge", title: "Bürünc nişan", requiredXp: 500 },
    { id: "silver-badge", title: "Gümüş nişan", requiredXp: 1_000 },
    { id: "gold-badge", title: "Qızıl nişan", requiredXp: 2_000 },
  ];
  return milestones.map((milestone) => ({
    ...milestone,
    description: `${milestone.requiredXp} XP topla`,
    iconKey: milestone.id,
    remainingXp: Math.max(milestone.requiredXp - totalXp, 0),
    status: totalXp >= milestone.requiredXp ? "unlocked" as const : "locked" as const,
    unlockedAt: xpThresholdDate(timeline, milestone.requiredXp)?.toISOString() ?? null,
  }));
}

function xpThresholdDate(timeline: Array<{ at: Date; xp: number }>, threshold: number) {
  let total = 0;
  for (const item of timeline) {
    total += item.xp;
    if (total >= threshold) return item.at;
  }
  return null;
}

function levelTitle(level: number) {
  return ["Başlanğıc", "Yaradıcı", "İrəliləyən", "Usta", "Artmonia ustası"][
    Math.min(level - 1, 4)
  ];
}

function compareAttendance(left: AttendanceInput, right: AttendanceInput) {
  const byDate = left.sessionDate.getTime() - right.sessionDate.getTime();
  if (byDate !== 0) return byDate;
  return left.startTime.localeCompare(right.startTime);
}
