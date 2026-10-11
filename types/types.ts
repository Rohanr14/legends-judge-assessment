export type UserInfo = {
  name: string;
  email: string;
};

export type RegistrationFormValues = {
  name: string;
  email: string;
  confirmEmail: string;
};

export type VideoNote = {
  videoId: number;
  note: string;
};

export type Ranking = {
  id: string;
  team: string;
  rank: string;
  justification: string;
};

export type AssessmentData = {
  userInfo: UserInfo;
  videoNotes: VideoNote[];
  rankings: Ranking[];
};

export type AdminSettings = {
  assessment: {
    /** Seconds of note-taking time after each video ends. */
    additionalTime: number;
    totalVideos: number;
    /** Seconds allowed for the ranking step. */
    rankingTime: number;
    youtubeVideoIds: string[];
  };
  googleDrive: {
    folderId: string;
  };
};

// ---- Judge endorsement application ----

export type EndorsementVideo = {
  /** What judges see, e.g. "Team 1". */
  label: string;
  youtubeId: string;
};

export type RubricCategory = {
  id: string;
  name: string;
  description: string;
  maxScore: number;
};

export type EndorsementSettings = {
  videos: EndorsementVideo[];
  rubric: RubricCategory[];
  /** Seconds to finish notes and scores after each video ends. */
  noteTime: number;
  /** Seconds allowed for the final ranking. */
  rankingTime: number;
  driveFolderId: string;
};

/** The part of the settings copied onto each application when it starts, so later admin edits don't affect it. */
export type EndorsementConfig = Omit<EndorsementSettings, 'driveFolderId'>;

export type PerformanceResponse = {
  scores: Record<string, number | null>;
  notes: Record<string, string>;
  feedback: string;
  /** Epoch ms. */
  startedAt?: number;
  videoDuration?: number;
  endedAt?: number;
  submittedAt?: number;
  autoSubmitted?: boolean;
};

export type RankingResponse = {
  /** Performance indexes, 1st place first. */
  order: number[];
  explanation: string;
  startedAt?: number;
  submittedAt?: number;
  autoSubmitted?: boolean;
};

export const APPLICATION_STATUSES = ['in_progress', 'submitted', 'under_review', 'endorsed', 'not_endorsed'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type EndorsementApplication = {
  id: string;
  judge: UserInfo;
  createdAt: number;
  config: EndorsementConfig;
  performances: PerformanceResponse[];
  ranking: RankingResponse;
  status: ApplicationStatus;
  submittedAt?: number;
  statusUpdatedAt?: number;
  drive?: {
    fileId?: string;
    uploadedAt?: number;
    error?: string;
  };
};

/** What the judge's browser receives: their own answers, without admin-only fields. */
export type JudgeApplicationView = Omit<EndorsementApplication, 'status' | 'statusUpdatedAt' | 'drive'>;
