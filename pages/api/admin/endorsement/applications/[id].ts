import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { APPLICATION_STATUSES, ApplicationStatus } from '../../../../../types/types';
import { deleteApplication, saveApplication } from '../../../../../utils/endorsementStore';
import { loadApplication, uploadIfComplete } from '../../../../../utils/endorsementService';
import { authOptions } from '../../../auth/[...nextauth]';

// PATCH { status }  change a finished application's review status
// POST            retry saving the application to Google Drive
// DELETE          remove the application, so the judge can apply again with the same email
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const id = String(req.query.id);
  try {
    const app = await loadApplication(id);
    if (!app) {
      return res.status(404).json({ message: 'Application not found' });
    }

    if (req.method === 'PATCH') {
      const status = (req.body ?? {}).status as ApplicationStatus;
      if (!APPLICATION_STATUSES.includes(status) || status === 'in_progress') {
        return res.status(400).json({ message: 'Invalid status' });
      }
      if (app.status === 'in_progress') {
        return res.status(409).json({ message: "This application hasn't been submitted yet." });
      }
      app.status = status;
      app.statusUpdatedAt = Date.now();
      await saveApplication(app);
      return res.status(200).json({ status: app.status, statusUpdatedAt: app.statusUpdatedAt });
    }

    if (req.method === 'POST') {
      const updated = await uploadIfComplete(app);
      return res.status(updated.drive?.uploadedAt ? 200 : 502).json({ drive: updated.drive ?? null });
    }

    if (req.method === 'DELETE') {
      await deleteApplication(app);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['PATCH', 'POST', 'DELETE']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Error updating endorsement application:', error);
    res.status(500).json({ message: 'Something went wrong' });
  }
}
