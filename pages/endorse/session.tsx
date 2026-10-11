import { useEffect, useState } from 'react';
import type { GetServerSideProps } from 'next';
import { WifiOff } from 'lucide-react';
import PerformanceStep from '../../components/endorsement/PerformanceStep';
import ProgressSteps from '../../components/endorsement/ProgressSteps';
import RankingStep from '../../components/endorsement/RankingStep';
import { useEndorsementSession } from '../../hooks/useEndorsementSession';
import type { JudgeApplicationView } from '../../types/types';
import { CONTACT_EMAIL } from '../../utils/constants';
import { currentStage, toJudgeView } from '../../utils/endorsement';
import { readSessionId } from '../../utils/endorsementSession';
import { loadApplication, uploadIfComplete } from '../../utils/endorsementService';

interface SessionProps {
  initialApplication: JudgeApplicationView;
  serverNow: number;
}

const EndorseSession = ({ initialApplication, serverNow: initialServerNow }: SessionProps) => {
  const { application, send, serverNow, toLocalTime, connectionError } = useEndorsementSession(initialApplication, initialServerNow);
  const stage = currentStage(application);
  const videoCount = application.config.videos.length;
  const stepIndex = stage.kind === 'performance' ? stage.index : stage.kind === 'ranking' ? videoCount : videoCount + 1;

  // Timers and the YouTube player depend on the browser's clock and APIs, so render only in the browser
  // (rendering on the server too would just produce hydration mismatches).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen px-2 sm:px-6 lg:px-8 py-4">
      <div className="w-full max-w-6xl mx-auto space-y-6">
        <ProgressSteps videoCount={videoCount} current={stepIndex} />
        {connectionError && (
          <p className="flex items-center justify-center gap-2 rounded bg-yellow-900 bg-opacity-70 p-2 text-sm text-yellow-100" role="alert">
            <WifiOff size={16} /> You&apos;re offline. Keep working — we&apos;ll keep trying to save. Timers keep running.
          </p>
        )}

        {stage.kind === 'performance' && (
          <PerformanceStep
            key={stage.index}
            index={stage.index}
            config={application.config}
            performance={application.performances[stage.index]}
            send={send}
            serverNow={serverNow}
            toLocalTime={toLocalTime}
          />
        )}
        {stage.kind === 'ranking' && <RankingStep application={application} send={send} toLocalTime={toLocalTime} />}
        {stage.kind === 'complete' && (
          <div className="max-w-2xl mx-auto bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-6 shadow-xl text-center space-y-4">
            <h1 className="font-pontiac text-4xl text-white text-shadow-lg">Thank You!</h1>
            <p className="text-lg">
              Your judge endorsement application has been submitted. Legends Judging Relations will review it and be in touch.
            </p>
            <p className="text-gray-300">
              Questions? Reach out to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-indigo-400 underline hover:text-indigo-300">{CONTACT_EMAIL}</a>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<SessionProps> = async ({ req }) => {
  const id = readSessionId(req.cookies);
  let app = id ? await loadApplication(id) : null;
  if (!app) {
    return { redirect: { destination: '/endorse', permanent: false } };
  }
  // Covers an application whose final timer ran out while the tab was closed.
  app = await uploadIfComplete(app);
  // JSON round trip: getServerSideProps can't serialize undefined values.
  return { props: { initialApplication: JSON.parse(JSON.stringify(toJudgeView(app))), serverNow: Date.now() } };
};

export default EndorseSession;
