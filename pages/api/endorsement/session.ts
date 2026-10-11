import type { NextApiRequest, NextApiResponse } from 'next';
import type { EndorsementApplication } from '../../../types/types';
import {
  MAX_VIDEO_DURATION_SECONDS,
  VIDEO_END_GRACE_MS,
  currentStage,
  performanceDeadline,
  performanceProblems,
  rankingDeadline,
  rankingProblems,
  sanitizePerformanceInput,
  sanitizeRankingInput,
  settleApplication,
  toJudgeView,
} from '../../../utils/endorsement';
import { readSessionId } from '../../../utils/endorsementSession';
import { saveApplication } from '../../../utils/endorsementStore';
import { loadApplication, uploadIfComplete } from '../../../utils/endorsementService';

// One endpoint for everything the judge's page does. The browser sends its requests one at a time,
// so these read-modify-write updates don't race each other.
//
//   GET                                       -> current application
//   POST { action: 'start', section, duration? }   video started (or ranking opened)
//   POST { action: 'ended', section, duration }    video finished; the note timer starts
//   POST { action: 'save', section, data }         auto-save while typing
//   POST { action: 'submit', section, data, auto } lock the section

type Section = number | 'ranking';

class RequestError extends Error {
  constructor(public status: number, message: string, public problems?: string[]) {
    super(message);
  }
}

const LOCKED = () => new RequestError(409, 'This section has already been submitted.');

function parseDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_VIDEO_DURATION_SECONDS) {
    throw new RequestError(400, 'Invalid video duration.');
  }
  return value;
}

function applyAction(app: EndorsementApplication, body: Record<string, unknown>, now: number) {
  const { action, section } = body as { action?: string; section?: Section };
  const stage = currentStage(app);

  if (section === 'ranking') {
    if (stage.kind !== 'ranking') throw stage.kind === 'complete' ? LOCKED() : new RequestError(409, 'Finish the videos first.');
    const ranking = app.ranking;
    const deadline = rankingDeadline(ranking, app.config);

    if (action === 'start') {
      ranking.startedAt ??= now;
      return;
    }
    if (action !== 'save' && action !== 'submit') throw new RequestError(400, 'Unknown action.');
    if (deadline === null) throw new RequestError(409, 'The ranking hasn\'t started yet.');

    const input = sanitizeRankingInput(body.data, app.performances.length);
    if (!input) throw new RequestError(400, 'Invalid ranking.');
    Object.assign(ranking, input);

    if (action === 'submit') {
      const auto = body.auto === true && now >= deadline - 5000;
      const problems = auto ? [] : rankingProblems(input);
      if (problems.length > 0) throw new RequestError(400, problems.join(' '), problems);
      ranking.submittedAt = Math.min(now, deadline);
      ranking.autoSubmitted = auto;
    }
    return;
  }

  if (typeof section !== 'number' || !Number.isInteger(section) || section < 0 || section >= app.performances.length) {
    throw new RequestError(400, 'Unknown section.');
  }
  if (stage.kind !== 'performance' || stage.index !== section) {
    throw stage.kind !== 'performance' || stage.index > section ? LOCKED() : new RequestError(409, 'Finish the earlier videos first.');
  }
  const performance = app.performances[section];

  if (action === 'start') {
    if (performance.startedAt === undefined) {
      performance.startedAt = now;
      performance.videoDuration = parseDuration(body.duration);
    }
    return;
  }

  if (action === 'ended') {
    if (performance.startedAt === undefined) {
      // The start request was lost; reconstruct it from the video's length.
      performance.videoDuration = parseDuration(body.duration);
      performance.startedAt = now - performance.videoDuration * 1000;
    }
    if (performance.endedAt === undefined) {
      // The note timer starts when the video actually ends, but can't be pushed earlier than the
      // video's runtime or later than the buffering allowance.
      const expectedEnd = performance.startedAt + (performance.videoDuration ?? 0) * 1000;
      performance.endedAt = Math.min(Math.max(now, expectedEnd), expectedEnd + VIDEO_END_GRACE_MS);
    }
    return;
  }

  if (action !== 'save' && action !== 'submit') throw new RequestError(400, 'Unknown action.');
  const input = sanitizePerformanceInput(body.data, app.config.rubric);
  Object.assign(performance, input);

  if (action === 'submit') {
    const deadline = performanceDeadline(performance, app.config);
    const auto = body.auto === true && deadline !== null && now >= deadline - 5000;
    const problems = auto ? [] : performanceProblems(input, app.config.rubric);
    if (problems.length > 0) throw new RequestError(400, problems.join(' '), problems);
    performance.submittedAt = deadline === null ? now : Math.min(now, deadline);
    performance.autoSubmitted = auto;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const id = readSessionId(req.cookies);
  if (!id) {
    return res.status(401).json({ message: 'Your session has ended. Please register again.' });
  }

  try {
    // Loading locks anything whose time ran out before this request (beyond the grace period).
    let app = await loadApplication(id);
    if (!app) {
      return res.status(401).json({ message: 'Your application could not be found.' });
    }

    if (req.method === 'POST') {
      const now = Date.now();
      // Sections only lock SUBMIT_GRACE_MS after their deadline, so the browser's final auto-submit still lands.
      applyAction(app, (req.body ?? {}) as Record<string, unknown>, now);
      settleApplication(app, now);
      await saveApplication(app);
      app = await uploadIfComplete(app);
    }

    res.status(200).json({ application: toJudgeView(app), now: Date.now() });
  } catch (error) {
    if (error instanceof RequestError) {
      // Send the latest state back too, so the page can move on if the section was locked.
      const app = await loadApplication(id).catch(() => null);
      return res.status(error.status).json({
        message: error.message,
        problems: error.problems,
        application: app ? toJudgeView(app) : undefined,
        now: Date.now(),
      });
    }
    console.error('Error in endorsement session:', error);
    res.status(500).json({ message: 'Something went wrong saving your work. Please check your connection.' });
  }
}
