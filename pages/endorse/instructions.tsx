import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import type { EndorsementConfig } from '../../types/types';
import { CONTACT_EMAIL, FEEDBACK_MAX_LENGTH } from '../../utils/constants';
import { currentStage, ordinal } from '../../utils/endorsement';
import { readSessionId } from '../../utils/endorsementSession';
import { loadApplication } from '../../utils/endorsementService';
import { formatDuration } from '../../utils/settings';

interface InstructionsProps {
  name: string;
  config: EndorsementConfig;
}

const EndorseInstructions = ({ name, config }: InstructionsProps) => {
  const count = config.videos.length;
  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <h1 className="font-pontiac text-4xl text-white text-center text-shadow-lg">Instructions</h1>
        <div className="bg-black bg-opacity-30 backdrop-blur-sm rounded-lg p-6 shadow-xl space-y-4">
          <p>Welcome, {name}.</p>
          <p>
            You will watch {count} pre-selected back row performances, one at a time. Each video plays once, start to finish.
            While it plays, take notes and enter a score for each rubric category:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            {config.rubric.map((category) => (
              <li key={category.id}>
                <span className="font-semibold">{category.name}</span> (out of {category.maxScore})
                {category.description && <span className="text-gray-300">: {category.description}</span>}
              </li>
            ))}
          </ul>
          <p>
            For each performance you must also answer: <em>What should this team improve before their next competition?</em>{' '}
            (up to {FEEDBACK_MAX_LENGTH} characters).
          </p>
          <p>
            {config.noteTime > 0
              ? `After each video ends you have ${formatDuration(config.noteTime)} to finish your notes and scores.`
              : 'Your notes and scores are due when each video ends.'}{' '}
            When the timer runs out the performance submits automatically, and you can&apos;t change it afterwards.
            You can also submit early.
          </p>
          <p>
            After all {count} videos, rank the performances from 1st to {ordinal(count)} and
            explain your ranking in complete sentences. You will have {formatDuration(config.rankingTime)}, and your
            response submits automatically when time runs out.
          </p>
          <p>
            Your work saves automatically as you type. If you reload the page or lose your connection, come back to this
            site in the same browser: you&apos;ll pick up where you left off, but the timers keep running.
          </p>
          <p>
            Questions? Contact Legends Judging Relations at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-400 underline hover:text-indigo-300">{CONTACT_EMAIL}</a>.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              href="/endorse/session"
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Begin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<InstructionsProps> = async ({ req }) => {
  const id = readSessionId(req.cookies);
  const app = id ? await loadApplication(id) : null;
  if (!app) {
    return { redirect: { destination: '/endorse', permanent: false } };
  }
  // Once the first video has started (or the application is finished), the instructions are skipped.
  const stage = currentStage(app);
  if (stage.kind !== 'performance' || stage.index > 0 || app.performances[0].startedAt !== undefined) {
    return { redirect: { destination: '/endorse/session', permanent: false } };
  }
  return { props: { name: app.judge.name, config: app.config } };
};

export default EndorseInstructions;
