import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LOGIN_REDIRECT, isAdmin } from '../../utils/adminSession';
import { getSettings } from '../../utils/settingsStore';

interface DashboardProps {
  submissionsFolderUrl: string | null;
}

const sectionTitleClassName = 'text-xl font-semibold text-white text-center mb-2';
const cardClassName = 'block bg-white bg-opacity-10 hover:bg-opacity-20 transition-all duration-300 rounded-lg shadow-lg p-6 border border-white border-opacity-20 text-center';

const AdminDashboard = ({ submissionsFolderUrl }: DashboardProps) => (
  <div className="min-h-screen">
    <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div className="py-6">
        <h1 className="text-3xl font-pontiac text-white text-center mb-8 text-shadow-lg">Admin Dashboard</h1>
        <h2 className={sectionTitleClassName}>Judge Endorsement</h2>
        <p className="text-center text-gray-300">
          Judges apply at <Link href="/endorse" className="text-indigo-300 underline hover:text-indigo-200">/endorse</Link>
        </p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-4 sm:flex-row">
          <Link href="/admin/endorsement" className="w-full sm:w-72">
            <span className={cardClassName}>
              <h2 className="text-xl font-semibold text-white mb-2">Applications</h2>
              <p className="text-gray-300">Review submitted applications and update their status</p>
            </span>
          </Link>
          <Link href="/admin/endorsement/settings" className="w-full sm:w-72">
            <span className={cardClassName}>
              <h2 className="text-xl font-semibold text-white mb-2">Endorsement Settings</h2>
              <p className="text-gray-300">Choose the videos, rubric categories, timers, and Drive folder</p>
            </span>
          </Link>
        </div>

        <h2 className={`${sectionTitleClassName} mt-12`}>Mock Judging Assessment</h2>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-4 sm:flex-row">
          <Link href="/admin/settings" className="w-full sm:w-72">
            <span className={cardClassName}>
              <h2 className="text-xl font-semibold text-white mb-2">Settings</h2>
              <p className="text-gray-300">Choose the videos, timers, and submissions folder</p>
            </span>
          </Link>
          {submissionsFolderUrl && (
            <a href={submissionsFolderUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-72">
              <span className={cardClassName}>
                <h2 className="text-xl font-semibold text-white mb-2">Submissions</h2>
                <p className="text-gray-300">Open the Google Drive folder with judges&apos; reports</p>
              </span>
            </a>
          )}
        </div>
        <div className="mt-10 text-center">
          <button
            onClick={() => signOut({ callbackUrl: '/admin/login' })}
            className="text-gray-300 underline hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  </div>
);

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (context) => {
  if (!(await isAdmin(context))) {
    return LOGIN_REDIRECT;
  }
  const { googleDrive } = await getSettings();
  return {
    props: {
      submissionsFolderUrl: googleDrive.folderId ? `https://drive.google.com/drive/folders/${googleDrive.folderId}` : null,
    },
  };
};

export default AdminDashboard;
