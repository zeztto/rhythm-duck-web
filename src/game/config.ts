import type { Judgement, LaneIndex, NoteKind } from './types';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 640;
export const JUDGE_LINE_Y = 538;
export const LANE_WIDTH = 244;
export const LANE_GAP = 18;
export const PLAYFIELD_LEFT = 96;
export const PLAYFIELD_TOP = 68;
export const PLAYFIELD_BOTTOM = 590;
export const BPM = 132;
export const FEVER_THRESHOLD = 100;
export const FEVER_DURATION_MS = 6_250;
export const HOLD_TICK_MS = 95;
export const MAX_HP = 100;
export const MISS_DAMAGE = 6;
export const HOLD_BREAK_DAMAGE = 4;
export const BOMB_DAMAGE = 12;
export const DEFAULT_LATENCY_OFFSET_MS = 0;
export const DEFAULT_MASTER_VOLUME = 0.72;
export const STORAGE_KEY = 'rhythm-duck-settings-v1';
export const RESULT_DELAY_MS = 1_800;

export const LANE_KEYS = ['Q', 'W', 'E'] as const;
export const LANE_CODES = ['KeyQ', 'KeyW', 'KeyE'] as const;

export const JUDGEMENT_WINDOWS: Record<Exclude<Judgement, 'miss'>, number> = {
  perfect: 45,
  great: 90,
  good: 140,
};

export const JUDGEMENT_SCORE_MULTIPLIER: Record<Judgement, number> = {
  perfect: 1,
  great: 0.7,
  good: 0.4,
  miss: 0,
};

export const BASE_NOTE_SCORE: Record<NoteKind, number> = {
  tap: 1_000,
  hold: 520,
  bonus: 1_450,
  bomb: 0,
};

export const FEVER_GAIN: Record<Exclude<NoteKind, 'bomb'>, number> = {
  tap: 14,
  hold: 18,
  bonus: 26,
};

export const APPROACH_MS: Record<NoteKind, number> = {
  tap: 1_700,
  hold: 1_900,
  bonus: 1_120,
  bomb: 1_500,
};

export const LANE_COLORS: Record<LaneIndex, number> = {
  0: 0x5ef2ff,
  1: 0xffe66a,
  2: 0xff6a95,
};

export const NOTE_COLORS: Record<NoteKind, number> = {
  tap: 0xc0fff7,
  hold: 0x8cfb93,
  bonus: 0xffda58,
  bomb: 0xff5770,
};

export function laneCenterX(lane: LaneIndex): number {
  return PLAYFIELD_LEFT + lane * (LANE_WIDTH + LANE_GAP) + LANE_WIDTH / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export function judgmentFromDelta(deltaMs: number): Judgement {
  const absDelta = Math.abs(deltaMs);

  if (absDelta <= JUDGEMENT_WINDOWS.perfect) {
    return 'perfect';
  }

  if (absDelta <= JUDGEMENT_WINDOWS.great) {
    return 'great';
  }

  if (absDelta <= JUDGEMENT_WINDOWS.good) {
    return 'good';
  }

  return 'miss';
}
