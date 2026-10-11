import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';
import { APPLICATION_STATUSES, ApplicationStatus } from '../../types/types';
import { STATUS_LABELS } from '../../utils/endorsement';

const applicationUrl = (id: string) => `/api/admin/endorsement/applications/${encodeURIComponent(id)}`;

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  in_progress: 'text-gray-300',
  submitted: 'text-blue-300',
  under_review: 'text-yellow-300',
  endorsed: 'text-green-300',
  not_endorsed: 'text-red-300',
};

interface StatusSelectProps {
  id: string;
  name: string;
  status: ApplicationStatus;
  onChange?: (status: ApplicationStatus) => void;
}

/** Review status for a finished application. In-progress applications can't be changed. */
export const StatusSelect: React.FC<StatusSelectProps> = ({ id, name, status: initialStatus, onChange }) => {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (status === 'in_progress') {
    return <span className={STATUS_COLORS.in_progress}>{STATUS_LABELS.in_progress}</span>;
  }

  const handleChange = async (next: ApplicationStatus) => {
    const previous = status;
    setStatus(next);
    setSaving(true);
    setError('');
    try {
      const response = await fetch(applicationUrl(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? 'Failed to update');
      onChange?.(next);
    } catch (err) {
      setStatus(previous);
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value as ApplicationStatus)}
          disabled={saving}
          aria-label={`Status for ${name}`}
          className={`bg-gray-700 bg-opacity-50 border border-gray-600 rounded-md text-sm py-1 ${STATUS_COLORS[status]}`}
        >
          {APPLICATION_STATUSES.filter((option) => option !== 'in_progress').map((option) => (
            <option key={option} value={option} className="text-white">{STATUS_LABELS[option]}</option>
          ))}
        </select>
        {saving && <Loader2 size={16} className="animate-spin text-gray-300" />}
      </div>
      {error && <p className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
    </div>
  );
};

export type DriveInfo = { url: string | null; saved: boolean; error: string | null };

/** Link to the application's PDF in Drive, or a retry button if saving it failed. */
export const DriveLink: React.FC<{ id: string; drive: DriveInfo; isComplete: boolean }> = ({ id, drive: initialDrive, isComplete }) => {
  const router = useRouter();
  const [drive, setDrive] = useState(initialDrive);
  const [retrying, setRetrying] = useState(false);

  if (!isComplete) return <span className="text-gray-500">—</span>;
  if (drive.saved) {
    return drive.url
      ? <a href={drive.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline hover:text-indigo-300">Open PDF</a>
      : <span className="text-gray-300" title="Google Drive isn't configured, so the PDF was saved to .local-submissions/">Saved locally</span>;
  }

  const retry = async () => {
    setRetrying(true);
    try {
      const response = await fetch(applicationUrl(id), { method: 'POST' });
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      if (response.ok) {
        // Reload to pick up the new Drive link.
        router.replace(router.asPath);
        setDrive({ ...drive, saved: true, error: null });
      } else {
        const body = await response.json().catch(() => null);
        setDrive({ ...drive, error: body?.drive?.error ?? 'Upload failed' });
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="text-sm px-3 py-1 rounded bg-yellow-700 hover:bg-yellow-600 text-white disabled:opacity-60"
      >
        {retrying ? 'Saving…' : 'Retry save to Drive'}
      </button>
      {drive.error && <p className="text-xs text-red-400 mt-1 max-w-xs">{drive.error}</p>}
    </div>
  );
};
