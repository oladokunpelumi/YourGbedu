export type Genre =
  | 'Afro-Beats'
  | 'Afro-R&B'
  | 'Afro-House'
  | 'Afro-Reggae'
  | 'Gospel'
  | 'R&B'
  | 'Hip-Hop'
  | 'Pop'
  | 'Soul'
  | 'Highlife';
export type Mood = 'Nostalgic' | 'Upbeat' | 'Romantic' | 'Melancholic';

export interface Song {
  id: string;
  title: string;
  genre: string;
  duration: string;
  description: string;
  coverUrl: string;
  artist?: string;
  tags?: string[];
  audioUrl?: string | null;
  story?: string;
}

export interface ProductionStep {
  title: string;
  desc: string;
  descActive?: string;
  icon: string;
  status: 'Completed' | 'In Progress' | 'Upcoming';
  active: boolean;
  locked: boolean;
  progress: number;
}

export interface OrderData {
  id: string;
  songTitle: string;
  genre: string;
  mood: string;
  tempo: number;
  occasion: string;
  occasionDetail?: string | null;
  story: string;
  status: string;
  createdAt: string;
  deliveryDate: string;
  overallProgress: number;
  currentStep: number;
  steps: ProductionStep[];
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  amount: number;
  recipientType?: string | null;
  recipientName?: string | null;
  senderName?: string | null;
  voiceGender?: string | null;
  specialQualities?: string | null;
  favoriteMemories?: string | null;
  specialMessage?: string | null;
  finalSongUrl?: string | null;
  finalSongTitle?: string | null;
  deliveredAt?: string | null;
  rating?: number | null;
  trackingToken?: string | null;
}

export type SongGenerationStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'needs_human_review'
  | 'invalid_input'
  | 'failed'
  | 'interrupted'
  | 'not_started';

export type SongPipelineStage =
  | 'validate'
  | 'packs'
  | 'intake'
  | 'brief'
  | 'style'
  | 'lyrics'
  | 'quality'
  | 'format';

export interface SongLlmUsage {
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  provider?: string;
}

export interface SongGeneration {
  order_id: string;
  status: SongGenerationStatus;
  current_stage: SongPipelineStage | null;
  pipeline_form: Record<string, any> | null;
  derived_fields: Record<string, any> | null;
  state: Record<string, any> | null;
  final_output: Record<string, any> | null;
  llm_usage: SongLlmUsage | null;
  stage_status: Record<string, { status?: string; error?: string; started_at?: string; finished_at?: string }>;
  stage_comments: Record<string, string>;
  error: string | null;
}
