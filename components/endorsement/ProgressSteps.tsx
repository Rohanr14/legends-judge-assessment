import React from 'react';
import { Check } from 'lucide-react';

interface ProgressStepsProps {
  videoCount: number;
  /** Index into the steps: 0..videoCount-1 are videos, then Final Ranking, then Complete. */
  current: number;
}

// Video 1 → Video 2 → Video 3 → Final Ranking → Complete
const ProgressSteps: React.FC<ProgressStepsProps> = ({ videoCount, current }) => {
  const steps = [...Array.from({ length: videoCount }, (_, index) => `Video ${index + 1}`), 'Final Ranking', 'Complete'];

  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-sm">
        {steps.map((step, index) => {
          const done = index < current || (index === steps.length - 1 && current === index);
          const active = index === current && !done;
          return (
            <li key={step} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 border ${
                  done
                    ? 'border-green-400 text-green-300'
                    : active
                      ? 'border-indigo-400 bg-indigo-600 text-white font-semibold'
                      : 'border-gray-500 text-gray-400'
                }`}
              >
                {done && <Check size={14} aria-hidden="true" />}
                {step}
              </span>
              {index < steps.length - 1 && <span className="text-gray-500" aria-hidden="true">→</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default ProgressSteps;
