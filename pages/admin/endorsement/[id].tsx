import { useState } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DriveInfo, DriveLink, StatusSelect } from '../../../components/endorsement/AdminControls';
import { EndorsementApplication } from '../../../types/types';
import { LOGIN_REDIRECT, isAdmin } from '../../../utils/adminSession';
import { currentStage, maxTotalScore, ordinal, totalScore } from '../../../utils/endorsement';
import { driveInfo, loadApplication } from '../../../utils/endorsementService';

interface DetailProps {
  application: EndorsementApplication;
  drive: DriveInfo;
}

const formatDate = (ms: number | undefined) =>
  ms === undefined ? '—' : new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const submittedNote = (submittedAt: number | undefined, autoSubmitted: boolean | undefined) =>
  submittedAt === undefined ? 'Not submitted yet' : `${autoSubmitted ? 'Auto-submitted when time ran out' : 'Submitted'} ${formatDate(submittedAt)}`;

const cardClassName = 'bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-6 shadow-xl';

const ApplicationDetail = ({ application: app, drive }: DetailProps) => {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const { videos, rubric } = app.config;
  const maxTotal = maxTotalScore(rubric);
  const isComplete = currentStage(app).kind === 'complete';

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${app.judge.name}'s application? This can't be undone. They will be able to apply again with the same email. A PDF already saved to Google Drive is not deleted.`)) {
      return;
    }
    setDeleting(true);
    const response = await fetch(`/api/admin/endorsement/applications/${encodeURIComponent(app.id)}`, { method: 'DELETE' });
    if (response.status === 401) {
      router.push('/admin/login');
    } else if (response.ok) {
      router.push('/admin/endorsement');
    } else {
      setDeleting(false);
      window.alert('Failed to delete the application.');
    }
  };

  return (
    <div className="min-h-screen">
      <Link href="/admin/endorsement">
        <span className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          All applications
        </span>
      </Link>
      <main className="max-w-5xl mx-auto py-6 sm:px-6 lg:px-8 space-y-6">
        <div className={cardClassName}>
          <div className="flex flex-wrap justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">{app.judge.name}</h1>
              <p className="text-gray-300">{app.judge.email}</p>
              <p className="text-sm text-gray-400 mt-2">Started {formatDate(app.createdAt)} · Submitted {formatDate(app.submittedAt)}</p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Status</p>
                <StatusSelect id={app.id} name={app.judge.name} status={app.status} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Google Drive</p>
                <DriveLink id={app.id} drive={drive} isComplete={isComplete} />
              </div>
            </div>
          </div>
        </div>

        {app.performances.map((performance, index) => (
          <section key={index} className={cardClassName}>
            <div className="flex flex-wrap justify-between items-baseline gap-2 mb-4">
              <h2 className="text-xl font-semibold text-white">Video {index + 1}: {videos[index]?.label}</h2>
              <p className="text-white font-semibold">Total {totalScore(performance)} / {maxTotal}</p>
            </div>
            <p className="text-sm text-gray-400 mb-4">{submittedNote(performance.submittedAt, performance.autoSubmitted)}</p>
            <div className="space-y-3">
              {rubric.map((category) => (
                <div key={category.id} className="rounded bg-gray-800 bg-opacity-60 p-3">
                  <div className="flex justify-between gap-4">
                    <h3 className="font-semibold text-white">{category.name}</h3>
                    <span className="text-white shrink-0">{performance.scores[category.id] ?? '—'} / {category.maxScore}</span>
                  </div>
                  <p className="text-gray-300 whitespace-pre-wrap mt-1">{performance.notes[category.id] || <span className="text-gray-500">No notes</span>}</p>
                </div>
              ))}
              <div className="rounded bg-gray-800 bg-opacity-60 p-3">
                <h3 className="font-semibold text-white">What should this team improve before their next competition?</h3>
                <p className="text-gray-300 whitespace-pre-wrap mt-1">{performance.feedback || <span className="text-gray-500">No response</span>}</p>
              </div>
            </div>
          </section>
        ))}

        <section className={cardClassName}>
          <h2 className="text-xl font-semibold text-white mb-1">Final Ranking</h2>
          <p className="text-sm text-gray-400 mb-4">{submittedNote(app.ranking.submittedAt, app.ranking.autoSubmitted)}</p>
          <ol className="space-y-2 mb-4">
            {app.ranking.order.map((performanceIndex, place) => (
              <li key={performanceIndex} className="flex gap-4 text-white">
                <span className="font-bold w-10">{ordinal(place + 1)}</span>
                <span className="flex-1">{videos[performanceIndex]?.label}</span>
                <span className="text-gray-300">{totalScore(app.performances[performanceIndex])} / {maxTotal}</span>
              </li>
            ))}
          </ol>
          <h3 className="font-semibold text-white">Explanation</h3>
          <p className="text-gray-300 whitespace-pre-wrap mt-1">{app.ranking.explanation || <span className="text-gray-500">No explanation</span>}</p>
        </section>

        <div className="text-center">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm text-red-300 underline hover:text-red-200 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete application (lets this judge start over)'}
          </button>
        </div>
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<DetailProps> = async (context) => {
  if (!(await isAdmin(context))) {
    return LOGIN_REDIRECT;
  }
  const app = await loadApplication(String(context.params?.id));
  if (!app) {
    return { notFound: true };
  }
  // JSON round trip: getServerSideProps can't serialize undefined values.
  return { props: { application: JSON.parse(JSON.stringify(app)), drive: driveInfo(app) } };
};

export default ApplicationDetail;
