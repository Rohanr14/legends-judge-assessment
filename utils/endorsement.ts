import type {
  ApplicationStatus,
  EndorsementApplication,
  EndorsementConfig,
  EndorsementSettings,
  JudgeApplicationView,
  PerformanceResponse,
  RankingResponse,
  RubricCategory,
} from '../types/types';
import {
  CATEGORY_NOTE_MAX_LENGTH,
  FEEDBACK_MAX_LENGTH,
  MAX_RUBRIC_CATEGORIES,
  MAX_VIDEOS,
  MIN_ENDORSEMENT_VIDEOS,
  RANKING_EXPLANATION_MAX_LENGTH,
} from './constants';
import { parseYouTubeId } from './settings';

// Shared by the browser and the server: settings, deadlines and validation for the endorsement application.
// Redis access lives in endorsementStore.ts.

/** Extra time after a deadline in which the browser's final save is still accepted (network latency). */
export const SUBMIT_GRACE_MS = 30_000;
/** If the browser never reports that a video ended (tab closed, buffering), assume it ended this long after its runtime. */
export const VIDEO_END_GRACE_MS = 120_000;
export const MAX_VIDEO_DURATION_SECONDS = 30 * 60;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  endorsed: 'Endorsed',
  not_endorsed: 'Not Endorsed',
};

export const DEFAULT_RUBRIC: RubricCategory[] = [
  { id: 'choreography', name: 'Choreography', description: 'Musicality, complexity, and use of the music', maxScore: 10 },
  { id: 'execution', name: 'Execution', description: 'Synchronization, cleanliness, and technique', maxScore: 10 },
  { id: 'creativity', name: 'Creativity', description: 'Originality of concept, theme, and transitions', maxScore: 10 },
  { id: 'formations', name: 'Formations', description: 'Spacing, staging, and formation changes', maxScore: 10 },
  { id: 'overall', name: 'Overall Impression', description: 'Energy, stage presence, and audience engagement', maxScore: 10 },
];

export const DEFAULT_ENDORSEMENT_SETTINGS: EndorsementSettings = {
  videos: [1, 2, 3].map((n) => ({ label: `Team ${n}`, youtubeId: '' })),
  rubric: DEFAULT_RUBRIC,
  noteTime: 300,
  rankingTime: 1200,
  driveFolderId: '',
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const stringOr = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

/** Fills in defaults for anything missing or malformed in stored or posted settings. */
export function normalizeEndorsementSettings(stored: unknown): EndorsementSettings {
  const settings = (stored ?? {}) as Partial<Record<keyof EndorsementSettings, unknown>>;
  const defaults = DEFAULT_ENDORSEMENT_SETTINGS;

  const videos = Array.isArray(settings.videos)
    ? settings.videos.map((video, index) => {
      const value = (video ?? {}) as Record<string, unknown>;
      const youtubeId = stringOr(value.youtubeId).trim();
      return { label: stringOr(value.label).trim() || `Team ${index + 1}`, youtubeId: parseYouTubeId(youtubeId) ?? youtubeId };
    })
    : defaults.videos;

  const rubric = Array.isArray(settings.rubric)
    ? settings.rubric.map((category, index) => {
      const value = (category ?? {}) as Record<string, unknown>;
      return {
        id: stringOr(value.id).trim() || `category-${index + 1}`,
        name: stringOr(value.name).trim(),
        description: stringOr(value.description).trim(),
        maxScore: numberOr(value.maxScore, 10),
      };
    })
    : defaults.rubric;

  return {
    videos,
    rubric,
    noteTime: numberOr(settings.noteTime, defaults.noteTime),
    rankingTime: numberOr(settings.rankingTime, defaults.rankingTime),
    driveFolderId: stringOr(settings.driveFolderId).trim(),
  };
}

export function validateEndorsementSettings(settings: EndorsementSettings): string | null {
  const { videos, rubric, noteTime, rankingTime, driveFolderId } = settings;

  if (videos.length < MIN_ENDORSEMENT_VIDEOS || videos.length > MAX_VIDEOS) {
    return `Use between ${MIN_ENDORSEMENT_VIDEOS} and ${MAX_VIDEOS} videos.`;
  }
  const badVideo = videos.findIndex((video) => !YOUTUBE_ID.test(video.youtubeId));
  if (badVideo !== -1) {
    return `Enter a valid YouTube link or video ID for video ${badVideo + 1}.`;
  }
  if (videos.some((video) => video.label.length > 60)) {
    return 'Video labels must be 60 characters or fewer.';
  }
  if (rubric.length < 1 || rubric.length > MAX_RUBRIC_CATEGORIES) {
    return `Use between 1 and ${MAX_RUBRIC_CATEGORIES} rubric categories.`;
  }
  if (rubric.some((category) => !category.name || category.name.length > 60)) {
    return 'Every rubric category needs a name (60 characters or fewer).';
  }
  if (new Set(rubric.map((category) => category.name.toLowerCase())).size !== rubric.length) {
    return 'Rubric category names must be unique.';
  }
  if (new Set(rubric.map((category) => category.id)).size !== rubric.length) {
    return 'Rubric categories must have unique ids.';
  }
  if (rubric.some((category) => category.description.length > 300)) {
    return 'Rubric descriptions must be 300 characters or fewer.';
  }
  if (rubric.some((category) => !Number.isInteger(category.maxScore) || category.maxScore < 1 || category.maxScore > 100)) {
    return 'Each category\'s maximum score must be a whole number from 1 to 100.';
  }
  if (!Number.isFinite(noteTime) || noteTime < 0 || noteTime > 900) {
    return 'Time after each video must be between 0 and 15 minutes.';
  }
  if (!Number.isFinite(rankingTime) || rankingTime < 60 || rankingTime > 3600) {
    return 'Final ranking time must be between 1 and 60 minutes.';
  }
  if (!DRIVE_ID.test(driveFolderId)) {
    return 'Enter the Google Drive folder (link or ID) where applications should be saved.';
  }
  return null;
}

export function configFromSettings({ videos, rubric, noteTime, rankingTime }: EndorsementSettings): EndorsementConfig {
  return { videos, rubric, noteTime, rankingTime };
}

export function emptyPerformance(rubric: RubricCategory[]): PerformanceResponse {
  return {
    scores: Object.fromEntries(rubric.map((category) => [category.id, null])),
    notes: Object.fromEntries(rubric.map((category) => [category.id, ''])),
    feedback: '',
  };
}

// ---- Deadlines and progress ----

/** When the note-taking time for a performance runs out, or null if its video hasn't started. */
export function performanceDeadline(performance: PerformanceResponse, config: EndorsementConfig): number | null {
  if (performance.startedAt === undefined || performance.videoDuration === undefined) return null;
  const videoEnd = performance.endedAt ?? performance.startedAt + performance.videoDuration * 1000 + VIDEO_END_GRACE_MS;
  return videoEnd + config.noteTime * 1000;
}

export function rankingDeadline(ranking: RankingResponse, config: EndorsementConfig): number | null {
  return ranking.startedAt === undefined ? null : ranking.startedAt + config.rankingTime * 1000;
}

export type Stage = { kind: 'performance'; index: number } | { kind: 'ranking' } | { kind: 'complete' };

export function currentStage(app: Pick<EndorsementApplication, 'performances' | 'ranking'>): Stage {
  const index = app.performances.findIndex((performance) => performance.submittedAt === undefined);
  if (index !== -1) return { kind: 'performance', index };
  return app.ranking.submittedAt === undefined ? { kind: 'ranking' } : { kind: 'complete' };
}

/**
 * Locks any section whose time has run out, keeping whatever was last auto-saved.
 * Deadlines are enforced here rather than only in the browser, so closing the tab doesn't stop the clock.
 * Returns true if anything changed.
 */
export function settleApplication(app: EndorsementApplication, now = Date.now()): boolean {
  let changed = false;
  for (const performance of app.performances) {
    if (performance.submittedAt !== undefined) continue;
    const deadline = performanceDeadline(performance, app.config);
    if (deadline !== null && now > deadline + SUBMIT_GRACE_MS) {
      performance.submittedAt = deadline;
      performance.autoSubmitted = true;
      changed = true;
    }
    // Later performances can't have started before this one is submitted.
    break;
  }

  if (currentStage(app).kind === 'ranking') {
    const deadline = rankingDeadline(app.ranking, app.config);
    if (deadline !== null && now > deadline + SUBMIT_GRACE_MS) {
      app.ranking.submittedAt = deadline;
      app.ranking.autoSubmitted = true;
      changed = true;
    }
  }

  if (currentStage(app).kind === 'complete' && app.status === 'in_progress') {
    app.status = 'submitted';
    app.submittedAt = app.ranking.submittedAt;
    changed = true;
  }
  return changed;
}

export function toJudgeView(app: EndorsementApplication): JudgeApplicationView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropping admin-only fields
  const { status, statusUpdatedAt, drive, ...view } = app;
  return view;
}

// ---- Validating what judges send ----

export type PerformanceInput = Pick<PerformanceResponse, 'scores' | 'notes' | 'feedback'>;
export type RankingInput = Pick<RankingResponse, 'order' | 'explanation'>;

/** Keeps only known categories, clamps lengths, and drops out-of-range scores. Never rejects, so auto-saves always land. */
export function sanitizePerformanceInput(body: unknown, rubric: RubricCategory[]): PerformanceInput {
  const value = (body ?? {}) as Record<string, unknown>;
  const scores = (value.scores ?? {}) as Record<string, unknown>;
  const notes = (value.notes ?? {}) as Record<string, unknown>;
  return {
    scores: Object.fromEntries(rubric.map((category) => {
      const score = scores[category.id];
      const valid = typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= category.maxScore;
      return [category.id, valid ? Math.round(score * 100) / 100 : null];
    })),
    notes: Object.fromEntries(rubric.map((category) => [category.id, stringOr(notes[category.id]).slice(0, CATEGORY_NOTE_MAX_LENGTH)])),
    feedback: stringOr(value.feedback).slice(0, FEEDBACK_MAX_LENGTH),
  };
}

export function sanitizeRankingInput(body: unknown, performanceCount: number): RankingInput | null {
  const value = (body ?? {}) as Record<string, unknown>;
  const order = value.order;
  const isPermutation = Array.isArray(order) &&
    order.length === performanceCount &&
    new Set(order).size === performanceCount &&
    order.every((index) => Number.isInteger(index) && index >= 0 && index < performanceCount);
  if (!isPermutation) return null;
  return { order: order as number[], explanation: stringOr(value.explanation).slice(0, RANKING_EXPLANATION_MAX_LENGTH) };
}

/** What a judge must fill in before submitting a performance themselves (timed-out submissions skip this). */
export function performanceProblems(input: PerformanceInput, rubric: RubricCategory[]): string[] {
  const problems: string[] = [];
  const missing = rubric.filter((category) => input.scores[category.id] === null || input.scores[category.id] === undefined);
  if (missing.length > 0) {
    problems.push(`Enter a score for ${missing.map((category) => category.name).join(', ')}.`);
  }
  if (!input.feedback.trim()) {
    problems.push('Tell the team what they should improve before their next competition.');
  }
  return problems;
}

export function rankingProblems(input: RankingInput): string[] {
  return input.explanation.trim() ? [] : ['Explain why you ranked the performances this way.'];
}

export function totalScore(performance: PerformanceResponse): number {
  return Object.values(performance.scores).reduce<number>((sum, score) => sum + (score ?? 0), 0);
}

export function maxTotalScore(rubric: RubricCategory[]): number {
  return rubric.reduce((sum, category) => sum + category.maxScore, 0);
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
