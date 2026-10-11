import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EndorsementConfig, PerformanceResponse, RubricCategory } from '../../types/types';
import type { SessionRequest, SessionResult } from '../../hooks/useEndorsementSession';
import { useAutosave } from '../../hooks/useEndorsementSession';
import { CATEGORY_NOTE_MAX_LENGTH, FEEDBACK_MAX_LENGTH } from '../../utils/constants';
import { type PerformanceInput, VIDEO_END_GRACE_MS, performanceDeadline, performanceProblems } from '../../utils/endorsement';
import { formatDuration } from '../../utils/settings';
import Timer from '../Timer';
import VideoPlayer from '../VideoPlayer';
import SaveIndicator from './SaveIndicator';

interface PerformanceStepProps {
  index: number;
  config: EndorsementConfig;
  performance: PerformanceResponse;
  send: (request: SessionRequest) => Promise<SessionResult>;
  serverNow: () => number;
  toLocalTime: (serverTime: number) => number;
}

// Scores are edited as text so a half-typed "7." isn't rewritten under the judge's cursor.
type Draft = { scores: Record<string, string>; notes: Record<string, string>; feedback: string };

function parseScore(value: string, maxScore: number): number | null {
  if (value.trim() === '') return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= maxScore ? score : null;
}

const toInput = (draft: Draft, rubric: RubricCategory[]): PerformanceInput => ({
  scores: Object.fromEntries(rubric.map((category) => [category.id, parseScore(draft.scores[category.id] ?? '', category.maxScore)])),
  notes: draft.notes,
  feedback: draft.feedback,
});

const textareaClassName = 'w-full p-2 bg-gray-700 text-white border border-gray-600 rounded placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500';

// Keyed by index, so each video starts with a fresh player, timer and form.
const PerformanceStep: React.FC<PerformanceStepProps> = ({ index, config, performance, send, serverNow, toLocalTime }) => {
  const { rubric, videos, noteTime } = config;
  const video = videos[index];

  const [draft, setDraft] = useState<Draft>(() => ({
    scores: Object.fromEntries(rubric.map((category) => {
      const score = performance.scores[category.id];
      return [category.id, score === null || score === undefined ? '' : String(score)];
    })),
    notes: Object.fromEntries(rubric.map((category) => [category.id, performance.notes[category.id] ?? ''])),
    feedback: performance.feedback,
  }));
  const input = useMemo(() => toInput(draft, rubric), [draft, rubric]);
  const inputRef = useRef(input);
  inputRef.current = input;
  const { status, cancel } = useAutosave(input, index, send);

  const performanceRef = useRef(performance);
  performanceRef.current = performance;
  const durationRef = useRef(performance.videoDuration ?? 0);

  // Reloaded after the video would have finished: don't replay it, go straight to the note timer.
  const [resumedAfterEnd] = useState(() =>
    performance.startedAt !== undefined && performance.endedAt === undefined &&
    serverNow() >= performance.startedAt + (performance.videoDuration ?? 0) * 1000);
  const [endedLocally, setEndedLocally] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const isResuming = performance.startedAt !== undefined && !resumedAfterEnd;
  const videoEnded = performance.endedAt !== undefined || endedLocally || resumedAfterEnd;
  const deadline = performance.endedAt !== undefined ? performanceDeadline(performance, config) : null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (resumedAfterEnd) {
      send({ action: 'ended', section: index, duration: durationRef.current });
    }
  }, [resumedAfterEnd, send, index]);

  const handleStart = useCallback((duration: number) => {
    if (duration > 0) durationRef.current = duration;
    if (performanceRef.current.startedAt === undefined && duration > 0) {
      send({ action: 'start', section: index, duration });
    }
  }, [send, index]);

  const handleEnded = useCallback(() => {
    setEndedLocally(true);
    send({ action: 'ended', section: index, duration: durationRef.current });
  }, [send, index]);

  // If the player stalls, or a reloaded video is never resumed, end it when the server would assume it
  // ended anyway, so the note timer still appears.
  useEffect(() => {
    if (performance.startedAt === undefined || videoEnded) return;
    const forceEndAt = performance.startedAt + (performance.videoDuration ?? 0) * 1000 + VIDEO_END_GRACE_MS;
    const timeout = setTimeout(handleEnded, Math.max(0, forceEndAt - serverNow()));
    return () => clearTimeout(timeout);
  }, [performance.startedAt, performance.videoDuration, videoEnded, handleEnded, serverNow]);

  const getStartOffset = useCallback(() => {
    const { startedAt } = performanceRef.current;
    return startedAt === undefined ? 0 : (serverNow() - startedAt) / 1000;
  }, [serverNow]);

  const handleVideoError = useCallback(() => setVideoFailed(true), []);

  const submit = useCallback(async (auto: boolean) => {
    if (submittingRef.current) return;
    if (!auto) {
      const found = performanceProblems(inputRef.current, rubric);
      setProblems(found);
      if (found.length > 0) return;
      if (!window.confirm(`Submit your scores and notes for ${video?.label ?? `Video ${index + 1}`}? You won't be able to change them afterwards.`)) return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    cancel();
    const result = await send({ action: 'submit', section: index, data: inputRef.current, auto });
    if (result.ok || result.status === 409) {
      // The server's new state moves the page on to the next step.
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    setProblems(result.problems ?? [result.message ?? "We couldn't submit this section. Please check your internet connection."]);
    if (auto) {
      setTimeout(() => submit(true), 5000);
    }
  }, [cancel, send, index, rubric, video?.label]);

  const handleTimeUp = useCallback(() => submit(true), [submit]);

  const setScore = (id: string, value: string) => setDraft((prev) => ({ ...prev, scores: { ...prev.scores, [id]: value } }));
  const setNote = (id: string, value: string) => setDraft((prev) => ({ ...prev, notes: { ...prev.notes, [id]: value } }));

  return (
    <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl">
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-4">
        <h2 className="font-pontiac text-3xl sm:text-4xl text-white text-shadow-lg">{video?.label}</h2>
        <span className="text-gray-300 text-sm">Video {index + 1} of {videos.length}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-4 space-y-4">
            {videoEnded ? (
              <div className="w-full aspect-video rounded bg-gray-800 flex items-center justify-center">
                <p className="text-white text-2xl">Video Ended</p>
              </div>
            ) : (
              <div>
                <VideoPlayer
                  youtubeVideoId={video.youtubeId}
                  onStart={handleStart}
                  getStartOffset={getStartOffset}
                  onEnded={handleEnded}
                  onError={handleVideoError}
                  onProgress={setProgress}
                />
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress * 100}%` }}></div>
                </div>
                {isResuming && progress === 0 && (
                  <p className="mt-2 text-sm text-yellow-200">
                    Press play to resume. The video continues from where it would be now; the time away isn&apos;t added back.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg bg-gray-800 bg-opacity-60 p-4">
              {deadline !== null ? (
                <>
                  <p className="text-center text-sm text-gray-300 mb-2">Time left to finish your notes and scores</p>
                  <Timer durationSeconds={noteTime} deadline={toLocalTime(deadline)} onTimeUp={handleTimeUp} />
                  <p className="text-center text-xs text-gray-400 mt-2">This section submits automatically when the timer reaches 0:00.</p>
                </>
              ) : videoEnded ? (
                <p className="text-center text-gray-300">Starting your note timer…</p>
              ) : (
                <p className="text-center text-gray-300">
                  Take notes while you watch. When the video ends you&apos;ll have {formatDuration(noteTime)} to finish
                  your notes and scores, then this section submits automatically.
                </p>
              )}
            </div>
            <SaveIndicator status={status} />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {rubric.map((category) => {
            const value = draft.scores[category.id] ?? '';
            const invalid = value.trim() !== '' && parseScore(value, category.maxScore) === null;
            return (
              <section key={category.id} className="rounded-lg bg-gray-800 bg-opacity-60 p-4 border border-gray-600">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="font-semibold text-white">{category.name}</h3>
                    {category.description && <p className="text-sm text-gray-400">{category.description}</p>}
                  </div>
                  <label className="shrink-0 flex items-center gap-1.5 text-sm text-gray-300">
                    <span className="sr-only">Score for {category.name}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={category.maxScore}
                      step="any"
                      value={value}
                      onChange={(e) => setScore(category.id, e.target.value)}
                      disabled={submitting}
                      aria-invalid={invalid}
                      placeholder="–"
                      className={`w-20 rounded bg-gray-700 text-white text-right ${invalid ? 'border-red-500' : 'border-gray-600'}`}
                    />
                    / {category.maxScore}
                  </label>
                </div>
                {invalid && <p className="text-sm text-red-400 mb-2">Enter a score from 0 to {category.maxScore}.</p>}
                <textarea
                  value={draft.notes[category.id] ?? ''}
                  onChange={(e) => setNote(category.id, e.target.value)}
                  disabled={submitting}
                  maxLength={CATEGORY_NOTE_MAX_LENGTH}
                  aria-label={`Notes for ${category.name}`}
                  placeholder={`Notes on ${category.name.toLowerCase()}…`}
                  className={`${textareaClassName} h-28`}
                />
              </section>
            );
          })}

          <section className="rounded-lg bg-gray-800 bg-opacity-60 p-4 border border-gray-600">
            <label htmlFor={`feedback-${index}`} className="block font-semibold text-white mb-2">
              What should this team improve before their next competition? <span className="text-red-400">*</span>
            </label>
            <textarea
              id={`feedback-${index}`}
              value={draft.feedback}
              onChange={(e) => setDraft((prev) => ({ ...prev, feedback: e.target.value }))}
              disabled={submitting}
              maxLength={FEEDBACK_MAX_LENGTH}
              required
              className={`${textareaClassName} h-32`}
            />
            <div className="text-right text-sm text-gray-400 mt-1">
              {draft.feedback.length} / {FEEDBACK_MAX_LENGTH} characters
            </div>
          </section>

          {problems.length > 0 && (
            <ul className="text-sm text-red-400 space-y-1" role="alert">
              {problems.map((problem) => <li key={problem}>{problem}</li>)}
            </ul>
          )}

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={submitting || !(videoEnded || videoFailed)}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : index < videos.length - 1 ? 'Submit and Continue' : 'Submit and Go to Ranking'}
            </button>
            {!(videoEnded || videoFailed) && <p className="text-xs text-gray-400">You can submit once the video has finished.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceStep;
