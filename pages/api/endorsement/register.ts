import { randomUUID } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { EndorsementApplication } from '../../../types/types';
import { CONTACT_EMAIL } from '../../../utils/constants';
import { configFromSettings, emptyPerformance, validateEndorsementSettings } from '../../../utils/endorsement';
import { readSessionId, sessionCookie } from '../../../utils/endorsementSession';
import { createApplication, findApplicationIdByEmail, getEndorsementSettings } from '../../../utils/endorsementStore';

const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
      typeof email !== 'string' || email.length > 320 || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ message: 'Please enter your name and a valid email address.' });
  }

  try {
    const settings = await getEndorsementSettings();
    if (validateEndorsementSettings(settings)) {
      return res.status(503).json({ message: "Applications aren't open yet. Please check back later." });
    }

    const existingId = await findApplicationIdByEmail(email);
    if (existingId) {
      // The same browser coming back just continues its application.
      if (existingId === readSessionId(req.cookies)) {
        return res.status(200).json({ ok: true });
      }
      return res.status(409).json({
        message: `An application has already been started with this email. If you need help, contact ${CONTACT_EMAIL}.`,
      });
    }

    const config = configFromSettings(settings);
    const app: EndorsementApplication = {
      id: randomUUID(),
      judge: { name: name.trim(), email: email.trim() },
      createdAt: Date.now(),
      config,
      performances: config.videos.map(() => emptyPerformance(config.rubric)),
      ranking: { order: config.videos.map((_, index) => index), explanation: '' },
      status: 'in_progress',
    };
    if (!(await createApplication(app))) {
      return res.status(409).json({
        message: `An application has already been started with this email. If you need help, contact ${CONTACT_EMAIL}.`,
      });
    }

    res.setHeader('Set-Cookie', sessionCookie(app.id));
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error registering endorsement applicant:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
}
