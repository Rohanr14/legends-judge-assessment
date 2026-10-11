import React, { useEffect, useRef, useState } from 'react';

interface TimerProps {
  /** Full length of the timer, for the progress bar (and the deadline when none is given). */
  durationSeconds: number;
  /** Fixed end time (epoch ms, browser clock), so the countdown survives a page reload. */
  deadline?: number;
  onTimeUp: () => void;
}

// Counts down against a fixed deadline, so the time stays accurate even when the browser
// throttles timers (for example while the judge has another tab in front).
const Timer: React.FC<TimerProps> = React.memo(({ durationSeconds, deadline: fixedDeadline, onTimeUp }) => {
  const [remaining, setRemaining] = useState(() =>
    fixedDeadline === undefined ? durationSeconds : Math.max(0, Math.ceil((fixedDeadline - Date.now()) / 1000)));
  const onTimeUpRef = useRef(onTimeUp);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    const deadline = fixedDeadline ?? Date.now() + durationSeconds * 1000;
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(secondsLeft);
      if (secondsLeft === 0) {
        clearInterval(interval);
        onTimeUpRef.current();
      }
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [durationSeconds, fixedDeadline]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const percentage = durationSeconds > 0 ? Math.min(100, (remaining / durationSeconds) * 100) : 0;

  return (
    <div className="w-full max-w-md mx-auto" role="timer">
      <div className={`mb-2 text-2xl font-bold text-center ${remaining <= 60 ? 'text-red-400' : 'text-white'}`}>
        {`${minutes}:${seconds.toString().padStart(2, '0')}`}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div
          className="bg-blue-600 h-2.5 rounded-full"
          style={{ width: `${percentage}%`, transition: 'width 1s linear' }}
        ></div>
      </div>
    </div>
  );
});

Timer.displayName = 'Timer';

export default Timer;
