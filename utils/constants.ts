export const CONTACT_EMAIL = 'legendsjudging@desidancenetwork.org';

export const MAX_VIDEOS = 5;
export const MAX_JUSTIFICATION_LENGTH = 1500;

export const MAX_NOTE_FILES = 10;
// Vercel rejects function request bodies over 4.5 MB, so each handwritten-note upload must stay below that.
export const MAX_NOTE_UPLOAD_BYTES = 4 * 1024 * 1024;

// Judge endorsement application
export const MIN_ENDORSEMENT_VIDEOS = 2;
export const MAX_RUBRIC_CATEGORIES = 12;
export const FEEDBACK_MAX_LENGTH = 500;
export const CATEGORY_NOTE_MAX_LENGTH = 5000;
export const RANKING_EXPLANATION_MAX_LENGTH = 3000;
