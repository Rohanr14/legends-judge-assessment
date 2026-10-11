import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { JudgeApplicationView } from '../../types/types';
import type { SessionRequest, SessionResult } from '../../hooks/useEndorsementSession';
import { useAutosave } from '../../hooks/useEndorsementSession';
import { RANKING_EXPLANATION_MAX_LENGTH } from '../../utils/constants';
import { type RankingInput, maxTotalScore, ordinal, rankingDeadline, rankingProblems, totalScore } from '../../utils/endorsement';
import Timer from '../Timer';
import SaveIndicator from './SaveIndicator';

interface RankingStepProps {
  application: JudgeApplicationView;
  send: (request: SessionRequest) => Promise<SessionResult>;
  toLocalTime: (serverTime: number) => number;
}

const RankingStep: React.FC<RankingStepProps> = ({ application, send, toLocalTime }) => {
  const { config, performances, ranking } = application;
  const [order, setOrder] = useState(ranking.order);
  const [explanation, setExplanation] = useState(ranking.explanation);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [problems, setProblems] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const input = useMemo<RankingInput>(() => ({ order, explanation }), [order, explanation]);
  const inputRef = useRef(input);
  inputRef.current = input;
  const started = ranking.startedAt !== undefined;
  const { status, cancel } = useAutosave(input, 'ranking', send, started);
  const deadline = rankingDeadline(ranking, config);
  const maxTotal = maxTotalScore(config.rubric);

  // The ranking timer starts the first time this step is shown (a reload keeps the original start).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!started) {
      send({ action: 'start', section: 'ranking' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first show
  }, []);

  const move = (place: number, by: number) => {
    setOrder((prev) => {
      const next = [...prev];
      [next[place], next[place + by]] = [next[place + by], next[place]];
      return next;
    });
  };

  const toggle = (performanceIndex: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (!next.delete(performanceIndex)) next.add(performanceIndex);
    return next;
  });

  const submit = useCallback(async (auto: boolean) => {
    if (submittingRef.current) return;
    if (!auto) {
      const found = rankingProblems(inputRef.current);
      setProblems(found);
      if (found.length > 0) return;
      if (!window.confirm("Submit your final ranking? You won't be able to change it afterwards.")) return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    cancel();
    const result = await send({ action: 'submit', section: 'ranking', data: inputRef.current, auto });
    if (result.ok || result.status === 409) return;
    submittingRef.current = false;
    setSubmitting(false);
    setProblems(result.problems ?? [result.message ?? "We couldn't submit your ranking. Please check your internet connection."]);
    if (auto) {
      setTimeout(() => submit(true), 5000);
    }
  }, [cancel, send]);

  const handleTimeUp = useCallback(() => submit(true), [submit]);

  return (
    <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl space-y-6">
      <h2 className="font-pontiac text-3xl sm:text-4xl text-white text-shadow-lg text-center">Final Ranking</h2>

      <div className="rounded-lg bg-gray-800 bg-opacity-60 p-4">
        {deadline !== null ? (
          <>
            <Timer durationSeconds={config.rankingTime} deadline={toLocalTime(deadline)} onTimeUp={handleTimeUp} />
            <p className="text-center text-xs text-gray-400 mt-2">Your ranking submits automatically when the timer reaches 0:00.</p>
          </>
        ) : (
          <p className="text-center text-gray-300">Starting your timer…</p>
        )}
      </div>

      <div>
        <p className="text-white font-semibold mb-3">
          Rank the performances from 1st to {ordinal(order.length)} using the arrows. Your scores and notes are below each team for reference.
        </p>
        <ol className="space-y-3">
          {order.map((performanceIndex, place) => {
            const performance = performances[performanceIndex];
            const label = config.videos[performanceIndex]?.label ?? `Video ${performanceIndex + 1}`;
            const isExpanded = expanded.has(performanceIndex);
            return (
              <li key={performanceIndex} className="rounded-lg bg-gray-700 bg-opacity-60 p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-white w-12">{ordinal(place + 1)}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{label}</h3>
                    <p className="text-sm text-gray-300">Your total: {totalScore(performance)} / {maxTotal}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => move(place, -1)}
                      disabled={place === 0 || submitting || !started}
                      aria-label={`Move ${label} up`}
                      className="p-1 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30"
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(place, 1)}
                      disabled={place === order.length - 1 || submitting || !started}
                      aria-label={`Move ${label} down`}
                      className="p-1 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-30"
                    >
                      <ArrowDown size={18} />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(performanceIndex)}
                  aria-expanded={isExpanded}
                  className="mt-3 w-full text-left text-sm text-gray-200 p-2 bg-gray-600 rounded flex justify-between items-center"
                >
                  <span>Your scores and notes</span>
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {isExpanded && (
                  <dl className="mt-2 space-y-2 text-sm">
                    {config.rubric.map((category) => (
                      <div key={category.id} className="rounded bg-gray-800 bg-opacity-60 p-2">
                        <dt className="font-semibold text-white">
                          {category.name}: {performance.scores[category.id] ?? '—'} / {category.maxScore}
                        </dt>
                        <dd className="text-gray-300 whitespace-pre-wrap">{performance.notes[category.id] || 'No notes'}</dd>
                      </div>
                    ))}
                    <div className="rounded bg-gray-800 bg-opacity-60 p-2">
                      <dt className="font-semibold text-white">Improvement feedback</dt>
                      <dd className="text-gray-300 whitespace-pre-wrap">{performance.feedback || '—'}</dd>
                    </div>
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div>
        <label htmlFor="ranking-explanation" className="block font-semibold text-white mb-2">
          Why did you rank the performances this way? <span className="text-red-400">*</span>
        </label>
        <p className="text-sm text-gray-400 mb-2">Please write in complete sentences.</p>
        <textarea
          id="ranking-explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          disabled={submitting || !started}
          maxLength={RANKING_EXPLANATION_MAX_LENGTH}
          className="w-full h-56 p-2 bg-gray-700 text-white border border-gray-600 rounded placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500"
        />
        <div className="flex justify-between items-start gap-4 mt-1">
          <SaveIndicator status={status} />
          <span className="text-sm text-gray-400 shrink-0">{explanation.length} / {RANKING_EXPLANATION_MAX_LENGTH}</span>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="text-sm text-red-400 space-y-1 text-center" role="alert">
          {problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={submitting || !started}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>
      </div>
    </div>
  );
};

export default RankingStep;
