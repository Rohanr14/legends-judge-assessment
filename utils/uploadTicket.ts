import { sign, verifySigned } from './signing';

// Once an assessment is saved, the browser receives a short-lived signed ticket that lets it
// upload handwritten notes into that judge's folder (and nowhere else).
const TICKET_TTL_MS = 2 * 60 * 60 * 1000;

type UploadTicket = {
  folderId: string;
  baseName: string;
  expires: number;
};

export function createUploadTicket(folderId: string, baseName: string): string {
  const ticket: UploadTicket = { folderId, baseName, expires: Date.now() + TICKET_TTL_MS };
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readUploadTicket(value: string): UploadTicket | null {
  const payload = verifySigned(value);
  if (!payload) return null;

  try {
    const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString()) as UploadTicket;
    return ticket.expires > Date.now() ? ticket : null;
  } catch {
    return null;
  }
}
