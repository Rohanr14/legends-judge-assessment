import type { EndorsementApplication } from '../types/types';
import { settleApplication } from './endorsement';
import { generateEndorsementPdf } from './endorsementPdf';
import {
  acquireLock,
  getApplication,
  getEndorsementSettings,
  releaseLock,
  saveApplication,
} from './endorsementStore';
import { safeFileName, uploadFile, usesGoogleDrive } from './googleDrive';

/** Loads an application with any expired sections locked (and saved). */
export async function loadApplication(id: string): Promise<EndorsementApplication | null> {
  const app = await getApplication(id);
  if (app && settleApplication(app)) {
    await saveApplication(app);
  }
  return app;
}

/**
 * Saves a finished application's PDF to the Drive folder, once. Runs right after the judge finishes,
 * and again whenever an admin opens the applications list, which also covers judges who closed the tab
 * before their final timer ran out.
 */
export async function uploadIfComplete(app: EndorsementApplication): Promise<EndorsementApplication> {
  if (app.status === 'in_progress' || app.drive?.uploadedAt) return app;
  const lock = `upload:${app.id}`;
  if (!(await acquireLock(lock, 120))) return app;

  try {
    // Re-read under the lock in case another request uploaded it meanwhile.
    const fresh = (await getApplication(app.id)) ?? app;
    if (fresh.drive?.uploadedAt) return fresh;

    try {
      const { driveFolderId } = await getEndorsementSettings();
      const date = new Date(fresh.submittedAt ?? Date.now()).toISOString().split('T')[0];
      const fileName = `${safeFileName(fresh.judge.name)}_${date}_endorsement.pdf`;
      const fileId = await uploadFile(driveFolderId, fileName, 'application/pdf', generateEndorsementPdf(fresh));
      fresh.drive = { fileId, uploadedAt: Date.now() };
    } catch (error) {
      console.error(`Error uploading endorsement application ${fresh.id}:`, error);
      fresh.drive = { error: error instanceof Error ? error.message : 'Upload failed' };
    }
    await saveApplication(fresh);
    return fresh;
  } finally {
    await releaseLock(lock);
  }
}

/** For admin pages: where the application's PDF is, if it has been saved. */
export function driveInfo(app: EndorsementApplication): { url: string | null; saved: boolean; error: string | null } {
  const saved = Boolean(app.drive?.uploadedAt);
  return {
    url: saved && app.drive?.fileId && usesGoogleDrive() ? `https://drive.google.com/file/d/${app.drive.fileId}/view` : null,
    saved,
    error: app.drive?.error ?? null,
  };
}
