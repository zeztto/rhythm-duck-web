import {
  APPROACH_MS,
  BASE_NOTE_SCORE,
  BOMB_DAMAGE,
  FEVER_DURATION_MS,
  FEVER_GAIN,
  FEVER_THRESHOLD,
  HOLD_BREAK_DAMAGE,
  HOLD_TICK_MS,
  JUDGEMENT_SCORE_MULTIPLIER,
  LANE_COLORS,
  LANE_KEYS,
  MAX_HP,
  MISS_DAMAGE,
  RESULT_DELAY_MS,
  clamp,
  judgmentFromDelta,
} from './config';
import type {
  FeedbackEvent,
  GameSnapshot,
  GameSummary,
  InputResult,
  Judgement,
  LaneIndex,
  RuntimeNote,
  SongChart,
} from './types';

const laneAccentHex: Record<LaneIndex, string> = {
  0: '#5ef2ff',
  1: '#ffe66a',
  2: '#ff6a95',
};

export class RhythmSimulation {
  private readonly chart;
  private notes: RuntimeNote[] = [];
  private feedback: FeedbackEvent[] = [];
  private feedbackId = 0;
  private summary: GameSummary | null = null;
  private songTimeMs = 0;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private hp = MAX_HP;
  private feverMeter = 0;
  private feverEndsAtMs = 0;
  private resultQueuedAtMs: number | null = null;
  private mode: GameSnapshot['mode'] = 'intro';
  private latencyOffsetMs = 0;
  private laneHeld: [boolean, boolean, boolean] = [false, false, false];
  private lanePulseUntilMs: number[] = [0, 0, 0];
  private laneRecentLabel = ['', '', ''];
  private laneRecentAccent = ['#5ef2ff', '#ffe66a', '#ff6a95'];
  private judgments: Record<Judgement, number> = {
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
  };

  constructor(chart: SongChart) {
    this.chart = chart;
    this.reset('intro');
  }

  setLatencyOffsetMs(value: number): void {
    this.latencyOffsetMs = Math.round(clamp(value, -150, 150));
  }

  getLatencyOffsetMs(): number {
    return this.latencyOffsetMs;
  }

  reset(mode: GameSnapshot['mode'] = 'intro'): void {
    this.notes = this.chart.notes.map((note) => ({
      ...note,
      status: 'pending',
      holdTicks: 0,
    }));
    this.feedback = [];
    this.feedbackId = 0;
    this.summary = null;
    this.songTimeMs = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hp = MAX_HP;
    this.feverMeter = 0;
    this.feverEndsAtMs = 0;
    this.resultQueuedAtMs = null;
    this.mode = mode;
    this.lanePulseUntilMs = [0, 0, 0];
    this.laneRecentLabel = ['', '', ''];
    this.laneRecentAccent = ['#5ef2ff', '#ffe66a', '#ff6a95'];
    this.judgments = {
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0,
    };
    this.setLaneHeld(0, false);
    this.setLaneHeld(1, false);
    this.setLaneHeld(2, false);

    if (mode === 'intro') {
      this.pushSystemFeedback('시작 버튼을 누르세요', '#5ef2ff', 0, 1_600);
    }
  }

  beginRun(): void {
    this.reset('playing');
    this.pushSystemFeedback('박자에 맞춰 시작', '#ffe66a', 0, 1_100);
  }

  update(songTimeMs: number): void {
    if (!Number.isFinite(songTimeMs) || this.mode === 'ended') return;
    const previousTimeMs = this.songTimeMs;
    this.songTimeMs = Math.max(songTimeMs, this.songTimeMs, 0);
    const elapsedMs = this.songTimeMs - previousTimeMs;
    this.feedback = this.feedback.filter(
      (event) => event.expiresAtMs > this.songTimeMs,
    );

    if (this.mode !== 'playing') {
      return;
    }

    if (this.resultQueuedAtMs !== null) {
      if (this.songTimeMs >= this.resultQueuedAtMs + RESULT_DELAY_MS) this.finishRun();
      return;
    }

    for (const note of this.notes) {
      if (this.resultQueuedAtMs !== null) break;
      if (note.status === 'pending') {
        const delta = this.songTimeMs - note.timeMs;

        if (note.kind === 'bomb') {
          if (delta > APPROACH_MS.bomb * 0.12) {
            note.status = 'dodged';
            note.resolvedAtMs = this.songTimeMs;
          }
          continue;
        }

        if (delta > 140) {
          this.registerMiss(note, this.songTimeMs, '놓침');
        }
      }

      if (note.status === 'holding') {
        this.updateHoldingNote(note);
      }
    }

    if (!this.isFeverActive() && this.feverMeter < FEVER_THRESHOLD) {
      this.feverMeter = clamp(this.feverMeter - elapsedMs * 0.00096, 0, FEVER_THRESHOLD);
    }

    if (this.hp <= 0 && !this.summary) {
      this.queueResult(false);
    }

    const lastNote = this.notes.at(-1);
    if (
      lastNote &&
      this.songTimeMs >
        lastNote.timeMs + (lastNote.durationMs ?? 0) + RESULT_DELAY_MS &&
      !this.summary &&
      this.notes.every((note) =>
        ['hit', 'completed', 'missed', 'dodged', 'bombed'].includes(note.status),
      )
    ) {
      this.queueResult(true);
    }

    if (
      this.resultQueuedAtMs !== null &&
      this.songTimeMs >= this.resultQueuedAtMs + RESULT_DELAY_MS &&
      !this.summary
    ) {
      this.finishRun();
    }
  }

  pressLane(lane: LaneIndex, songTimeMs: number): InputResult {
    if (!Number.isFinite(songTimeMs) || ![0, 1, 2].includes(lane)) return { type: 'empty', lane };
    this.update(songTimeMs);
    this.setLaneHeld(lane, true);
    this.bumpLane(lane, '', laneAccentHex[lane], 100);

    if (this.mode !== 'playing' || this.resultQueuedAtMs !== null) {
      return { type: 'empty', lane };
    }

    this.update(this.songTimeMs);

    const candidate = this.notes.find((note) => {
      if (note.lane !== lane || note.status !== 'pending') {
        return false;
      }

      return Math.abs(this.songTimeMs - note.timeMs) <= 140;
    });

    if (!candidate) {
      return { type: 'empty', lane };
    }

    const deltaMs = this.songTimeMs - candidate.timeMs;
    const judgement = judgmentFromDelta(deltaMs);

    if (judgement === 'miss') {
      return { type: 'empty', lane };
    }

    if (candidate.kind === 'bomb') {
      candidate.status = 'bombed';
      candidate.resolvedAtMs = this.songTimeMs;
      candidate.deltaMs = deltaMs;
      candidate.judgement = 'miss';
      this.judgments.miss += 1;
      this.combo = 0;
      this.hp = clamp(this.hp - BOMB_DAMAGE, 0, MAX_HP);
      this.feverMeter = clamp(this.feverMeter - 26, 0, FEVER_THRESHOLD);
      this.pushFeedback(lane, '폭탄', '#ff5770', this.songTimeMs, 420);
      this.bumpLane(lane, '폭탄', '#ff5770', 200);

      if (this.hp <= 0) {
        this.queueResult(false);
      }

      return {
        type: 'bomb',
        lane,
        kind: 'bomb',
      };
    }

    if (candidate.kind === 'hold') {
      candidate.status = 'holding';
      candidate.startedAtMs = this.songTimeMs;
      candidate.lastHoldTickAtMs = Math.max(candidate.timeMs, this.songTimeMs);
      candidate.deltaMs = deltaMs;
      candidate.judgement = judgement;

      const feverTriggered = this.registerSuccessfulHit(
        candidate,
        lane,
        judgement,
        BASE_NOTE_SCORE.hold,
      );

      return {
        type: 'hold',
        lane,
        kind: 'hold',
        judgement,
        deltaMs,
        feverTriggered,
      };
    }

    candidate.status = 'hit';
    candidate.resolvedAtMs = this.songTimeMs;
    candidate.deltaMs = deltaMs;
    candidate.judgement = judgement;

    const baseScore =
      candidate.kind === 'bonus' ? BASE_NOTE_SCORE.bonus : BASE_NOTE_SCORE.tap;
    const feverTriggered = this.registerSuccessfulHit(
      candidate,
      lane,
      judgement,
      baseScore,
    );

    return {
      type: 'hit',
      lane,
      kind: candidate.kind,
      judgement,
      deltaMs,
      feverTriggered,
    };
  }

  releaseLane(lane: LaneIndex, songTimeMs: number): void {
    if (!Number.isFinite(songTimeMs) || ![0, 1, 2].includes(lane)) return;
    this.update(songTimeMs);
    this.setLaneHeld(lane, false);

    if (this.mode !== 'playing') {
      return;
    }

    const holdingNote = this.notes.find(
      (note) => note.lane === lane && note.status === 'holding',
    );

    if (!holdingNote) {
      return;
    }

    const endTime = holdingNote.timeMs + (holdingNote.durationMs ?? 0);
    const graceWindowMs = 72;

    if (this.songTimeMs + graceWindowMs >= endTime) {
      this.completeHold(holdingNote, endTime);
      return;
    }

    holdingNote.status = 'missed';
    holdingNote.judgement = 'miss';
    this.judgments.miss += 1;
    holdingNote.resolvedAtMs = this.songTimeMs;
    this.combo = 0;
    this.hp = clamp(this.hp - HOLD_BREAK_DAMAGE, 0, MAX_HP);
    this.feverMeter = clamp(this.feverMeter - 8, 0, FEVER_THRESHOLD);
    this.pushFeedback(lane, '홀드 중단', '#ff9c73', this.songTimeMs, 360);
    this.bumpLane(lane, '홀드 중단', '#ff9c73', 180);

    if (this.hp <= 0) {
      this.queueResult(false);
    }
  }

  getSnapshot(
    masterVolume: number,
    bestScore: number,
    calibration: GameSnapshot['calibration'],
  ): GameSnapshot {
    return {
      mode: this.mode,
      title: this.chart.title,
      artist: this.chart.artist,
      bpm: this.chart.bpm,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      hp: this.hp,
      feverMeter: this.feverMeter,
      feverActive: this.isFeverActive(),
      feverRemainingMs: this.isFeverActive()
        ? Math.max(0, this.feverEndsAtMs - this.songTimeMs)
        : 0,
      accuracy: this.computeAccuracy(),
      progress: clamp(this.songTimeMs / this.chart.totalLengthMs, 0, 1),
      songTimeMs: this.songTimeMs,
      totalLengthMs: this.chart.totalLengthMs,
      latencyOffsetMs: this.latencyOffsetMs,
      masterVolume,
      bestScore,
      chart: this.notes.map((note) => ({ ...note })),
      feedback: this.feedback.map((event) => ({ ...event })),
      lanes: LANE_KEYS.map((key, lane) => ({
        key,
        pressed: this.laneHeld[lane],
        pulse: clamp((this.lanePulseUntilMs[lane] - this.songTimeMs) / 180, 0, 1),
        holdActive: this.notes.some(
          (note) => note.lane === lane && note.status === 'holding',
        ),
        recentLabel: this.laneRecentLabel[lane],
        recentAccent: this.laneRecentAccent[lane],
      })),
      judgments: { ...this.judgments },
      calibration,
      summary: this.summary,
    };
  }

  private setLaneHeld(lane: LaneIndex, value: boolean): void {
    const mutable = [...this.laneHeld] as [boolean, boolean, boolean];
    mutable[lane] = value;
    this.laneHeld = mutable;
  }

  private updateHoldingNote(note: RuntimeNote): void {
    const lane = note.lane;
    const endTime = note.timeMs + (note.durationMs ?? 0);
    const held = this.laneHeld[lane];

    if (!held && this.songTimeMs < endTime) {
      note.status = 'missed';
      note.judgement = 'miss';
      this.judgments.miss += 1;
      note.resolvedAtMs = this.songTimeMs;
      this.combo = 0;
      this.hp = clamp(this.hp - HOLD_BREAK_DAMAGE, 0, MAX_HP);
      this.feverMeter = clamp(this.feverMeter - 8, 0, FEVER_THRESHOLD);
      this.pushFeedback(lane, '홀드 중단', '#ff9c73', this.songTimeMs, 360);
      this.bumpLane(lane, '홀드 중단', '#ff9c73', 180);
      return;
    }

    let lastTickAtMs = note.lastHoldTickAtMs ?? note.timeMs;
    while (lastTickAtMs + HOLD_TICK_MS <= Math.min(endTime, this.songTimeMs)) {
      lastTickAtMs += HOLD_TICK_MS;
      note.holdTicks += 1;
      note.lastHoldTickAtMs = lastTickAtMs;
      this.score += Math.round(68 * this.getScoreMultiplier());
      this.feverMeter = clamp(this.feverMeter + 2.8, 0, FEVER_THRESHOLD);
      this.bumpLane(lane, '연속', laneAccentHex[lane], 110);
    }

    if (this.songTimeMs >= endTime) {
      this.completeHold(note, endTime);
    }
  }

  private completeHold(note: RuntimeNote, resolvedAtMs: number): void {
    note.status = 'completed';
    note.resolvedAtMs = resolvedAtMs;
    this.score += Math.round(420 * this.getScoreMultiplier());
    this.pushFeedback(note.lane, '홀드 완료', '#8cfb93', resolvedAtMs, 420);
    this.bumpLane(note.lane, '홀드 완료', '#8cfb93', 200);
  }

  private registerSuccessfulHit(
    note: RuntimeNote,
    lane: LaneIndex,
    judgement: Exclude<Judgement, 'miss'>,
    baseScore: number,
  ): boolean {
    this.judgments[judgement] += 1;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += Math.round(
      baseScore *
        JUDGEMENT_SCORE_MULTIPLIER[judgement] *
        this.getScoreMultiplier(),
    );

    const feverGain =
      note.kind === 'bonus'
        ? FEVER_GAIN.bonus
        : note.kind === 'hold'
          ? FEVER_GAIN.hold
          : FEVER_GAIN.tap;

    this.feverMeter = clamp(this.feverMeter + feverGain, 0, FEVER_THRESHOLD);
    this.pushFeedback(
      lane,
      ({ perfect: '정확', great: '좋음', good: '성공' }[judgement]),
      this.feedbackAccentForJudgement(judgement, note.lane),
      this.songTimeMs,
      360,
    );
    this.bumpLane(
      lane,
      ({ perfect: '정확', great: '좋음', good: '성공' }[judgement]),
      this.feedbackAccentForJudgement(judgement, note.lane),
      220,
    );

    if (note.kind === 'bonus') {
      this.pushFeedback(lane, '황금 오리', '#ffe66a', this.songTimeMs, 520);
      this.bumpLane(lane, '황금', '#ffe66a', 240);
    }

    if (
      !this.isFeverActive() &&
      this.combo >= 12 &&
      this.feverMeter >= FEVER_THRESHOLD
    ) {
      this.feverEndsAtMs = this.songTimeMs + FEVER_DURATION_MS;
      this.feverMeter = FEVER_THRESHOLD;
      this.pushSystemFeedback('피버', '#ff9f43', this.songTimeMs, 1_400);
      return true;
    }

    return false;
  }

  private registerMiss(note: RuntimeNote, songTimeMs: number, label: string): void {
    note.status = 'missed';
    note.resolvedAtMs = songTimeMs;
    note.judgement = 'miss';
    this.judgments.miss += 1;
    this.combo = 0;
    this.hp = clamp(this.hp - MISS_DAMAGE, 0, MAX_HP);
    this.feverMeter = clamp(this.feverMeter - 18, 0, FEVER_THRESHOLD);
    this.pushFeedback(note.lane, label, '#ff5470', songTimeMs, 320);
    this.bumpLane(note.lane, label, '#ff5470', 180);

    if (this.hp <= 0) {
      this.queueResult(false);
    }
  }

  private queueResult(cleared: boolean): void {
    if (this.resultQueuedAtMs !== null) {
      return;
    }

    this.resultQueuedAtMs = this.songTimeMs;
    this.pushSystemFeedback(
      cleared ? '곡 완료' : '체력 소진',
      cleared ? '#5ef2ff' : '#ff5770',
      this.songTimeMs,
      1_100,
    );
  }

  private finishRun(): void {
    this.mode = 'ended';
    this.summary = {
      finalScore: this.score,
      accuracy: this.computeAccuracy(),
      maxCombo: this.maxCombo,
      cleared: this.hp > 0,
      perfect: this.judgments.perfect,
      great: this.judgments.great,
      good: this.judgments.good,
      miss: this.judgments.miss,
    };
  }

  private pushFeedback(
    lane: LaneIndex,
    label: string,
    accent: string,
    createdAtMs: number,
    durationMs: number,
  ): void {
    this.feedback.push({
      id: this.feedbackId++,
      lane,
      label,
      accent,
      createdAtMs,
      expiresAtMs: createdAtMs + durationMs,
      kind: 'judgement',
    });
  }

  private pushSystemFeedback(
    label: string,
    accent: string,
    createdAtMs: number,
    durationMs: number,
  ): void {
    this.feedback.push({
      id: this.feedbackId++,
      lane: null,
      label,
      accent,
      createdAtMs,
      expiresAtMs: createdAtMs + durationMs,
      kind: 'system',
    });
  }

  private bumpLane(
    lane: LaneIndex,
    label: string,
    accent: string,
    durationMs: number,
  ): void {
    this.lanePulseUntilMs[lane] = this.songTimeMs + durationMs;
    this.laneRecentLabel[lane] = label;
    this.laneRecentAccent[lane] = accent;
  }

  private feedbackAccentForJudgement(
    judgement: Exclude<Judgement, 'miss'>,
    lane: LaneIndex,
  ): string {
    if (judgement === 'perfect') {
      return '#ffffff';
    }

    if (judgement === 'great') {
      return '#8ef6ff';
    }

    return this.colorToCss(LANE_COLORS[lane]);
  }

  private colorToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  private computeAccuracy(): number {
    const totalJudged =
      this.judgments.perfect +
      this.judgments.great +
      this.judgments.good +
      this.judgments.miss;

    if (totalJudged === 0) {
      return 100;
    }

    const weightedScore =
      this.judgments.perfect * 1 +
      this.judgments.great * 0.7 +
      this.judgments.good * 0.4;

    return Number(((weightedScore / totalJudged) * 100).toFixed(1));
  }

  private getScoreMultiplier(): number {
    return this.isFeverActive() ? 2 : 1;
  }

  private isFeverActive(): boolean {
    return this.songTimeMs < this.feverEndsAtMs;
  }
}
