export type LaneIndex = 0 | 1 | 2;
export type NoteKind = 'tap' | 'hold' | 'bonus' | 'bomb';
export type Judgement = 'perfect' | 'great' | 'good' | 'miss';
export type GameMode = 'intro' | 'playing' | 'ended';

export interface ChartNote {
  id: string;
  lane: LaneIndex;
  timeMs: number;
  kind: NoteKind;
  durationMs?: number;
}

export interface SongChart {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  leadInMs: number;
  notes: ChartNote[];
  totalLengthMs: number;
}

export interface RuntimeNote extends ChartNote {
  status:
    | 'pending'
    | 'holding'
    | 'hit'
    | 'completed'
    | 'missed'
    | 'dodged'
    | 'bombed';
  resolvedAtMs?: number;
  startedAtMs?: number;
  judgement?: Judgement;
  deltaMs?: number;
  holdTicks: number;
  lastHoldTickAtMs?: number;
}

export interface FeedbackEvent {
  id: number;
  lane: LaneIndex | null;
  label: string;
  accent: string;
  createdAtMs: number;
  expiresAtMs: number;
  kind: 'judgement' | 'system';
}

export interface LaneViewState {
  key: string;
  pressed: boolean;
  pulse: number;
  holdActive: boolean;
  recentLabel: string;
  recentAccent: string;
}

export interface GameSummary {
  finalScore: number;
  accuracy: number;
  maxCombo: number;
  cleared: boolean;
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export interface CalibrationStatus {
  active: boolean;
  samples: number;
  previewOffsetMs: number | null;
}

export interface GameSnapshot {
  mode: GameMode;
  title: string;
  artist: string;
  bpm: number;
  score: number;
  combo: number;
  maxCombo: number;
  hp: number;
  feverMeter: number;
  feverActive: boolean;
  feverRemainingMs: number;
  accuracy: number;
  progress: number;
  songTimeMs: number;
  totalLengthMs: number;
  latencyOffsetMs: number;
  masterVolume: number;
  bestScore: number;
  chart: RuntimeNote[];
  feedback: FeedbackEvent[];
  lanes: LaneViewState[];
  judgments: Record<Judgement, number>;
  calibration: CalibrationStatus;
  summary: GameSummary | null;
}

export interface InputResult {
  type: 'hit' | 'hold' | 'bomb' | 'empty';
  lane: LaneIndex;
  kind?: NoteKind;
  judgement?: Judgement;
  deltaMs?: number;
  feverTriggered?: boolean;
}

export interface StoredSettings {
  latencyOffsetMs: number;
  masterVolume: number;
  bestScore: number;
}
