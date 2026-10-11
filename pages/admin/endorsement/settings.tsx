import { useState } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { EndorsementSettings } from '../../../types/types';
import { LOGIN_REDIRECT, isAdmin } from '../../../utils/adminSession';
import { MAX_RUBRIC_CATEGORIES, MAX_VIDEOS, MIN_ENDORSEMENT_VIDEOS } from '../../../utils/constants';
import { validateEndorsementSettings } from '../../../utils/endorsement';
import { getEndorsementSettings } from '../../../utils/endorsementStore';
import { parseDriveFolderId, parseYouTubeId } from '../../../utils/settings';

interface SettingsProps {
  initialSettings: EndorsementSettings;
}

// Times are edited in minutes but stored in seconds.
type FormState = {
  videos: { label: string; input: string }[];
  rubric: { id: string; name: string; description: string; maxScore: string }[];
  noteMinutes: string;
  rankingMinutes: string;
  folderInput: string;
};

const toForm = (settings: EndorsementSettings): FormState => ({
  videos: settings.videos.map((video) => ({ label: video.label, input: video.youtubeId })),
  rubric: settings.rubric.map((category) => ({ ...category, maxScore: String(category.maxScore) })),
  noteMinutes: String(settings.noteTime / 60),
  rankingMinutes: String(settings.rankingTime / 60),
  folderInput: settings.driveFolderId,
});

const minutesToSeconds = (value: string) => (value.trim() === '' ? NaN : Math.round(Number(value) * 60));

const fromForm = (form: FormState): EndorsementSettings => ({
  videos: form.videos.map((video, index) => ({
    label: video.label.trim() || `Team ${index + 1}`,
    youtubeId: parseYouTubeId(video.input) ?? video.input.trim(),
  })),
  rubric: form.rubric.map((category) => ({
    id: category.id,
    name: category.name.trim(),
    description: category.description.trim(),
    maxScore: Number(category.maxScore),
  })),
  noteTime: minutesToSeconds(form.noteMinutes),
  rankingTime: minutesToSeconds(form.rankingMinutes),
  driveFolderId: parseDriveFolderId(form.folderInput),
});

const newCategoryId = () => `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const inputBaseClassName = 'block w-full bg-gray-700 bg-opacity-50 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-white sm:text-sm';
const inputClassName = `mt-1 ${inputBaseClassName}`;
const labelClassName = 'block text-sm font-medium text-gray-200';
const iconButtonClassName = 'p-2 rounded bg-gray-600 hover:bg-gray-500 text-white disabled:opacity-30';

function swap<T>(items: T[], index: number, by: number): T[] {
  const next = [...items];
  [next[index], next[index + by]] = [next[index + by], next[index]];
  return next;
}

const EndorsementSettingsPage = ({ initialSettings }: SettingsProps) => {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(initialSettings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const update = (changes: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...changes }));
    setSaved(false);
    setError('');
  };

  const setVideoCount = (count: number) => update({
    videos: Array.from({ length: count }, (_, index) => form.videos[index] ?? { label: `Team ${index + 1}`, input: '' }),
  });
  const updateVideo = (index: number, changes: Partial<FormState['videos'][number]>) =>
    update({ videos: form.videos.map((video, i) => (i === index ? { ...video, ...changes } : video)) });
  const updateCategory = (index: number, changes: Partial<FormState['rubric'][number]>) =>
    update({ rubric: form.rubric.map((category, i) => (i === index ? { ...category, ...changes } : category)) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaved(false);

    const settings = fromForm(form);
    const validationError = validateEndorsementSettings(settings);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/endorsement/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (response.status === 401) {
        router.push('/admin/login');
        return;
      }
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.message ?? 'Failed to update settings');
      }
      setForm(toForm(body));
      setSaved(true);
    } catch (err) {
      console.error('Error updating endorsement settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Link href="/admin/dashboard">
        <span className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          Back
        </span>
      </Link>
      <main className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-3xl font-pontiac text-white text-center mb-2 text-shadow-lg">Endorsement Settings</h1>
          <p className="text-center text-gray-300 mb-8">
            Changes apply to judges who register afterwards. Applications already in progress keep the settings they started with.
          </p>
          <div className="bg-black bg-opacity-40 backdrop-blur-sm rounded-lg p-6 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h2 className="text-xl font-semibold text-white">Videos</h2>
                  <label className="text-sm text-gray-200 flex items-center gap-2">
                    Number of videos
                    <select
                      value={form.videos.length}
                      onChange={(e) => setVideoCount(Number(e.target.value))}
                      className="bg-gray-700 bg-opacity-50 border border-gray-600 rounded-md text-white sm:text-sm"
                    >
                      {Array.from({ length: MAX_VIDEOS - MIN_ENDORSEMENT_VIDEOS + 1 }, (_, i) => i + MIN_ENDORSEMENT_VIDEOS).map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {form.videos.map((video, index) => {
                  const videoId = parseYouTubeId(video.input);
                  return (
                    <div key={index} className="grid gap-3 sm:grid-cols-[10rem_1fr] items-start">
                      <div>
                        <label htmlFor={`label${index}`} className={labelClassName}>Video {index + 1} label</label>
                        <input
                          id={`label${index}`}
                          type="text"
                          value={video.label}
                          onChange={(e) => updateVideo(index, { label: e.target.value })}
                          maxLength={60}
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label htmlFor={`video${index}`} className={labelClassName}>YouTube link or video ID</label>
                        <div className="mt-1 flex items-center gap-3">
                          <input
                            id={`video${index}`}
                            type="text"
                            value={video.input}
                            onChange={(e) => updateVideo(index, { input: e.target.value })}
                            placeholder="https://www.youtube.com/watch?v=…"
                            className={inputBaseClassName}
                          />
                          {videoId && (
                            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element -- small external thumbnail, no optimization needed */}
                              <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt={`Video ${index + 1} thumbnail`} className="h-12 w-auto rounded" />
                            </a>
                          )}
                        </div>
                        {video.input.trim() && !videoId && (
                          <p className="mt-1 text-sm text-yellow-300">That doesn&apos;t look like a YouTube link or video ID.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-sm text-gray-400">Labels are what judges see. Upload videos as Unlisted (Private videos can&apos;t be embedded).</p>
              </section>

              <section className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Rubric categories</h2>
                {form.rubric.map((category, index) => (
                  <div key={category.id} className="rounded-lg bg-gray-800 bg-opacity-60 p-4 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] items-end">
                      <div>
                        <label htmlFor={`name-${category.id}`} className={labelClassName}>Category name</label>
                        <input
                          id={`name-${category.id}`}
                          type="text"
                          value={category.name}
                          onChange={(e) => updateCategory(index, { name: e.target.value })}
                          maxLength={60}
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label htmlFor={`max-${category.id}`} className={labelClassName}>Max score</label>
                        <input
                          id={`max-${category.id}`}
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={category.maxScore}
                          onChange={(e) => updateCategory(index, { maxScore: e.target.value })}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => update({ rubric: swap(form.rubric, index, -1) })} disabled={index === 0} aria-label={`Move ${category.name || 'category'} up`} className={iconButtonClassName}>
                          <ArrowUp size={16} />
                        </button>
                        <button type="button" onClick={() => update({ rubric: swap(form.rubric, index, 1) })} disabled={index === form.rubric.length - 1} aria-label={`Move ${category.name || 'category'} down`} className={iconButtonClassName}>
                          <ArrowDown size={16} />
                        </button>
                        <button type="button" onClick={() => update({ rubric: form.rubric.filter((_, i) => i !== index) })} disabled={form.rubric.length === 1} aria-label={`Remove ${category.name || 'category'}`} className={`${iconButtonClassName} hover:bg-red-700`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor={`desc-${category.id}`} className={labelClassName}>Description shown to judges (optional)</label>
                      <input
                        id={`desc-${category.id}`}
                        type="text"
                        value={category.description}
                        onChange={(e) => updateCategory(index, { description: e.target.value })}
                        maxLength={300}
                        className={inputClassName}
                      />
                    </div>
                  </div>
                ))}
                {form.rubric.length < MAX_RUBRIC_CATEGORIES && (
                  <button
                    type="button"
                    onClick={() => update({ rubric: [...form.rubric, { id: newCategoryId(), name: '', description: '', maxScore: '10' }] })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-white text-sm"
                  >
                    <Plus size={16} /> Add category
                  </button>
                )}
              </section>

              <section className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="noteMinutes" className={labelClassName}>Time after each video (0-15 min)</label>
                  <input
                    type="number"
                    id="noteMinutes"
                    value={form.noteMinutes}
                    onChange={(e) => update({ noteMinutes: e.target.value })}
                    min={0}
                    max={15}
                    step={0.5}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="rankingMinutes" className={labelClassName}>Final ranking time (1-60 min)</label>
                  <input
                    type="number"
                    id="rankingMinutes"
                    value={form.rankingMinutes}
                    onChange={(e) => update({ rankingMinutes: e.target.value })}
                    min={1}
                    max={60}
                    step={0.5}
                    className={inputClassName}
                  />
                </div>
              </section>

              <div>
                <label htmlFor="folder" className={labelClassName}>
                  Google Drive Judging folder (link or folder ID)
                </label>
                <input
                  type="text"
                  id="folder"
                  value={form.folderInput}
                  onChange={(e) => update({ folderInput: e.target.value })}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className={inputClassName}
                />
                <p className="mt-1 text-sm text-gray-400">
                  Each finished application is saved here as a PDF. The folder must be shared (as Editor) with the app&apos;s Google service account.
                </p>
              </div>

              {error && <p className="mt-2 text-sm text-red-400" role="alert">{error}</p>}
              {saved && <p className="mt-2 text-sm text-green-400" role="status">Settings saved.</p>}
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<SettingsProps> = async (context) => {
  if (!(await isAdmin(context))) {
    return LOGIN_REDIRECT;
  }
  return { props: { initialSettings: await getEndorsementSettings() } };
};

export default EndorsementSettingsPage;
