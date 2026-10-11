import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { auth, drive as createDrive, type drive_v3 } from '@googleapis/drive';

let client: drive_v3.Drive | null | undefined;

function getDrive(): drive_v3.Drive | null {
  if (client !== undefined) return client;

  const clientEmail = process.env.GOOGLE_CREDENTIALS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CREDENTIALS_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('GOOGLE_CREDENTIALS_CLIENT_EMAIL and GOOGLE_CREDENTIALS_PRIVATE_KEY must be set in production.');
    }
    client = null;
    return client;
  }

  const googleAuth = new auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.GOOGLE_CREDENTIALS_PROJECT_ID,
      private_key_id: process.env.GOOGLE_CREDENTIALS_PRIVATE_KEY_ID,
      // Keys copied out of the JSON key file keep their "\n" escapes; restore real newlines.
      private_key: privateKey.replace(/\\n/g, '\n'),
      client_email: clientEmail,
      client_id: process.env.GOOGLE_CREDENTIALS_CLIENT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  client = createDrive({ version: 'v3', auth: googleAuth });
  return client;
}

// Local development without Google credentials: submissions are written here instead.
const LOCAL_SUBMISSIONS_DIR = path.join(process.cwd(), '.local-submissions');

/** Makes a judge's name safe to use in file and folder names. */
export function safeFileName(name: string): string {
  return name.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'judge';
}

export async function createFolder(name: string, parentId: string): Promise<string> {
  const drive = getDrive();
  if (!drive) {
    const folderId = `${name}_${Date.now()}`;
    await fs.mkdir(path.join(LOCAL_SUBMISSIONS_DIR, folderId), { recursive: true });
    return folderId;
  }
  if (!parentId) {
    throw new Error('No Google Drive folder is configured in Admin → Settings.');
  }

  const res = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Google Drive did not return a folder id.');
  return res.data.id;
}

/** Uploads a file and returns its Drive id (or local path in development). */
export async function uploadFile(folderId: string, name: string, mimeType: string, content: Buffer): Promise<string> {
  const drive = getDrive();
  if (!drive) {
    const dir = path.join(LOCAL_SUBMISSIONS_DIR, folderId || 'unconfigured-folder');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
    return path.join(dir, name);
  }
  if (!folderId) {
    throw new Error('No Google Drive folder is configured.');
  }

  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(content) },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Google Drive did not return a file id.');
  return res.data.id;
}

/** True when uploads go to real Google Drive rather than the local development folder. */
export function usesGoogleDrive(): boolean {
  return getDrive() !== null;
}
