import { useMemo, useState } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { DriveInfo, DriveLink, StatusSelect } from '../../../components/endorsement/AdminControls';
import { APPLICATION_STATUSES, ApplicationStatus } from '../../../types/types';
import { LOGIN_REDIRECT, isAdmin } from '../../../utils/adminSession';
import { STATUS_LABELS, currentStage, settleApplication } from '../../../utils/endorsement';
import { driveInfo, uploadIfComplete } from '../../../utils/endorsementService';
import { listApplications, saveApplication } from '../../../utils/endorsementStore';

type ApplicationSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  submittedAt: number | null;
  status: ApplicationStatus;
  progress: string;
  drive: DriveInfo;
};

interface ApplicationsProps {
  applications: ApplicationSummary[];
}

const formatDate = (ms: number | null) =>
  ms === null ? '—' : new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const Applications = ({ applications: initialApplications }: ApplicationsProps) => {
  const [applications, setApplications] = useState(initialApplications);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');

  const counts = useMemo(() => {
    const result = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<ApplicationStatus, number>;
    for (const app of applications) result[app.status]++;
    return result;
  }, [applications]);
  const shown = filter === 'all' ? applications : applications.filter((app) => app.status === filter);

  const setStatus = (id: string, status: ApplicationStatus) =>
    setApplications((prev) => prev.map((app) => (app.id === id ? { ...app, status } : app)));

  return (
    <div className="min-h-screen">
      <Link href="/admin/dashboard">
        <span className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          Back
        </span>
      </Link>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-pontiac text-white text-center mb-8 text-shadow-lg">Endorsement Applications</h1>

        <div className="flex flex-wrap justify-center gap-2 mb-6" role="group" aria-label="Filter by status">
          {(['all', ...APPLICATION_STATUSES] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className={`px-3 py-1 rounded-full text-sm border ${filter === option ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-gray-500 text-gray-300 hover:text-white'}`}
            >
              {option === 'all' ? `All (${applications.length})` : `${STATUS_LABELS[option]} (${counts[option]})`}
            </button>
          ))}
        </div>

        <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-lg shadow-xl overflow-x-auto">
          {shown.length === 0 ? (
            <p className="p-6 text-center text-gray-300">No applications{filter === 'all' ? ' yet' : ' with this status'}.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-300 border-b border-gray-600">
                  <th className="px-4 py-3 font-medium">Judge</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Google Drive</th>
                  <th className="px-4 py-3 font-medium"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((app) => (
                  <tr key={app.id} className="border-b border-gray-700 last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="text-white font-semibold">{app.name}</p>
                      <p className="text-gray-400">{app.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatDate(app.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {app.submittedAt === null ? <span className="text-gray-400">{app.progress}</span> : formatDate(app.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusSelect id={app.id} name={app.name} status={app.status} onChange={(status) => setStatus(app.id, status)} />
                    </td>
                    <td className="px-4 py-3">
                      <DriveLink id={app.id} drive={app.drive} isComplete={app.status !== 'in_progress'} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/endorsement/${app.id}`} className="text-indigo-400 underline hover:text-indigo-300 whitespace-nowrap">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<ApplicationsProps> = async (context) => {
  if (!(await isAdmin(context))) {
    return LOGIN_REDIRECT;
  }

  const apps = await listApplications();
  const settled = await Promise.all(apps.map(async (app) => {
    // Locks timed-out sections for judges who left, and saves finished applications that haven't been
    // sent to Drive yet. Failed uploads wait for the Retry button so a Drive outage doesn't slow this page.
    if (settleApplication(app)) await saveApplication(app);
    return app.drive ? app : uploadIfComplete(app);
  }));

  const applications = settled.map((app): ApplicationSummary => {
    const stage = currentStage(app);
    return {
      id: app.id,
      name: app.judge.name,
      email: app.judge.email,
      createdAt: app.createdAt,
      submittedAt: app.submittedAt ?? null,
      status: app.status,
      progress: stage.kind === 'performance'
        ? `On video ${stage.index + 1} of ${app.performances.length}`
        : stage.kind === 'ranking' ? 'On final ranking' : 'Complete',
      drive: driveInfo(app),
    };
  });
  return { props: { applications } };
};

export default Applications;
