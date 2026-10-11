import React from 'react';
import { CheckCircle2, Loader2, WifiOff } from 'lucide-react';
import type { SaveStatus } from '../../hooks/useEndorsementSession';

const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => (
  <p className="flex items-center gap-1.5 text-sm text-gray-300" role="status" aria-live="polite">
    {status === 'saved' && <><CheckCircle2 size={16} className="text-green-400" /> All changes saved</>}
    {(status === 'pending' || status === 'saving') && <><Loader2 size={16} className="animate-spin" /> Saving…</>}
    {status === 'error' && <><WifiOff size={16} className="text-yellow-300" /> <span className="text-yellow-200">Not saved yet — check your connection. Retrying…</span></>}
  </p>
);

export default SaveIndicator;
