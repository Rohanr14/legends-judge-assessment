import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { normalizeEndorsementSettings, validateEndorsementSettings } from '../../../../utils/endorsement';
import { saveEndorsementSettings } from '../../../../utils/endorsementStore';
import { parseDriveFolderId } from '../../../../utils/settings';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  const settings = normalizeEndorsementSettings(req.body);
  settings.driveFolderId = parseDriveFolderId(settings.driveFolderId);
  const validationError = validateEndorsementSettings(settings);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    await saveEndorsementSettings(settings);
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error updating endorsement settings:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
}
