import {
  BPM,
  DEFAULT_LATENCY_OFFSET_MS,
  DEFAULT_MASTER_VOLUME,
  LANE_CODES,
  STORAGE_KEY,
  clamp,
} from './config';
import { rhythmChart } from './chart';
import { RhythmAudioManager } from './audio';
import { RhythmSimulation } from './simulation';
import type {
  CalibrationStatus,
  GameSnapshot,
  InputResult,
  LaneIndex,
  StoredSettings,
} from './types';

interface CalibrationSession {
  startAtMs: number;
  beatMs: number;
  beats: number;
  samples: number[];
}

function decodeStoredSettings(raw: string): StoredSettings | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const fields = Object.keys(value);
    if (fields.length !== 3 || !fields.every(key => ['latencyOffsetMs', 'masterVolume', 'bestScore'].includes(key))) return null;
    const parsed = value as Partial<StoredSettings>;
    if (typeof parsed.latencyOffsetMs !== 'number' || !Number.isFinite(parsed.latencyOffsetMs) || Math.abs(parsed.latencyOffsetMs) > 150 ||
        typeof parsed.masterVolume !== 'number' || !Number.isFinite(parsed.masterVolume) || parsed.masterVolume < 0 || parsed.masterVolume > 1 ||
        typeof parsed.bestScore !== 'number' || !Number.isSafeInteger(parsed.bestScore) || parsed.bestScore < 0) return null;
    return { latencyOffsetMs: parsed.latencyOffsetMs, masterVolume: parsed.masterVolume, bestScore: parsed.bestScore };
  } catch { return null; }
}

export class RhythmController {
  private readonly chart = rhythmChart;
  private readonly simulation = new RhythmSimulation(this.chart);
  private readonly audio = new RhythmAudioManager();
  // These flags must initialize before loadSettings can block a write.
  private storageBlocked = false;
  private statusMessage = '';
  private settings = this.loadSettings();
  private latestSnapshot: GameSnapshot;
  private starting: Promise<void> | null = null;
  private calibrationStarting = false;
  private calibration: CalibrationSession | null = null;
  private laneDown = [false, false, false];
  private cachedMode: GameSnapshot['mode'] = 'intro';

  constructor() {
    this.simulation.setLatencyOffsetMs(this.settings.latencyOffsetMs);
    this.audio.setMasterVolume(this.settings.masterVolume);
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  getSnapshot(): GameSnapshot {
    return this.latestSnapshot;
  }

  step(): GameSnapshot {
    const songTimeMs =
      this.latestSnapshot.mode === 'ended'
        ? this.latestSnapshot.songTimeMs
        : this.getSongTimeMs();
    const previousMode = this.cachedMode;
    this.simulation.update(songTimeMs);
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
    this.cachedMode = this.latestSnapshot.mode;

    if (this.latestSnapshot.mode === 'ended' && previousMode !== 'ended') {
      this.audio.stopSong();
      if (this.latestSnapshot.summary) {
        this.settings.bestScore = Math.max(
          this.settings.bestScore,
          this.latestSnapshot.summary.finalScore,
        );
        this.persistSettings();
        this.latestSnapshot = this.simulation.getSnapshot(
          this.settings.masterVolume,
          this.settings.bestScore,
          this.getCalibrationStatus(),
        );
      }
    }

    if (this.calibration) {
      const calibrationEnd =
        this.calibration.startAtMs +
        this.calibration.beatMs * this.calibration.beats +
        600;

      if (this.audio.getCurrentContextMs() > calibrationEnd) {
        this.finishCalibration();
      }
    }

    return this.latestSnapshot;
  }

  startRun(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.calibrationStarting) return Promise.resolve();
    this.calibration = null;
    this.starting = (async () => {
      await this.audio.startSong(this.chart.totalLengthMs, this.chart.bpm);
      this.laneDown = [false, false, false];
      this.simulation.setLatencyOffsetMs(this.settings.latencyOffsetMs);
      this.simulation.beginRun();
      this.cachedMode = 'playing';
      this.latestSnapshot = this.simulation.getSnapshot(
        this.settings.masterVolume, this.settings.bestScore, this.getCalibrationStatus(),
      );
      this.step();
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  isBusy(): boolean { return this.starting !== null || this.calibrationStarting; }
  getStatusMessage(): string { return this.statusMessage; }

  async restartRun(): Promise<void> {
    await this.startRun();
  }

  async handleKeyDown(code: string): Promise<void> {
    if (this.isBusy()) return;
    if (code === 'Enter' && this.latestSnapshot.mode === 'ended') {
      await this.restartRun();
      return;
    }

    const lane = this.resolveLane(code);
    if (lane === null) {
      if (this.latestSnapshot.mode === 'intro' && ['Enter', 'Space'].includes(code)) {
        await this.startRun();
      }
      return;
    }

    if (this.laneDown[lane]) {
      return;
    }
    this.laneDown[lane] = true;

    if (this.calibration) {
      this.captureCalibrationTap();
      return;
    }

    if (this.latestSnapshot.mode === 'intro') {
      await this.startRun();
      return;
    }

    if (this.latestSnapshot.mode !== 'playing') {
      return;
    }

    const result = this.simulation.pressLane(lane, this.getInputSongTimeMs());
    this.handleAudioResult(result);
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  handleKeyUp(code: string): void {
    const lane = this.resolveLane(code);
    if (lane === null) {
      return;
    }

    this.laneDown[lane] = false;

    if (this.calibration) {
      return;
    }

    this.simulation.releaseLane(lane, this.getInputSongTimeMs());
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  setLatencyOffsetMs(value: number): void {
    this.settings.latencyOffsetMs = Math.round(clamp(value, -150, 150));
    this.simulation.setLatencyOffsetMs(this.settings.latencyOffsetMs);
    this.persistSettings();
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  setMasterVolume(value: number): void {
    this.settings.masterVolume = clamp(value, 0, 1);
    this.audio.setMasterVolume(this.settings.masterVolume);
    this.persistSettings();
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  async startCalibration(): Promise<void> {
    if (this.latestSnapshot.mode === 'playing' || this.isBusy() || this.calibration) return;
    this.calibrationStarting = true;
    let calibration;
    try { calibration = await this.audio.startCalibrationTrack(8, BPM); }
    finally { this.calibrationStarting = false; }
    this.calibration = {
      ...calibration,
      samples: [],
    };
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  private handleAudioResult(result: InputResult): void {
    if (result.type === 'bomb') {
      this.audio.playBomb();
      return;
    }

    if (result.type === 'empty') {
      return;
    }

    if (result.judgement) {
      this.audio.playShot(
        result.lane,
        result.kind ?? 'tap',
        result.judgement,
      );
    } else {
      this.audio.playMiss();
    }

    if (result.type === 'hold') {
      this.audio.playHoldTick(result.lane);
    }

    if (result.feverTriggered) {
      this.audio.playFeverStart();
    }
  }

  private captureCalibrationTap(): void {
    if (!this.calibration) {
      return;
    }

    const relativeMs = this.audio.getCurrentContextMs() - this.calibration.startAtMs;
    if (relativeMs < -100) {
      return;
    }

    const beatIndex = Math.round(relativeMs / this.calibration.beatMs);
    if (beatIndex < 0 || beatIndex >= this.calibration.beats) {
      return;
    }

    const nearestBeatMs = beatIndex * this.calibration.beatMs;
    const sample = relativeMs - nearestBeatMs;
    this.calibration.samples.push(sample);

    if (this.calibration.samples.length >= 4) {
      const average =
        this.calibration.samples.reduce((sum, value) => sum + value, 0) /
        this.calibration.samples.length;
      this.setLatencyOffsetMs(-average);
    }
  }

  private finishCalibration(): void {
    if (!this.calibration) {
      return;
    }

    if (this.calibration.samples.length >= 2) {
      const average =
        this.calibration.samples.reduce((sum, value) => sum + value, 0) /
        this.calibration.samples.length;
      this.setLatencyOffsetMs(-average);
    }

    this.calibration = null;
    this.latestSnapshot = this.simulation.getSnapshot(
      this.settings.masterVolume,
      this.settings.bestScore,
      this.getCalibrationStatus(),
    );
  }

  private getCalibrationStatus(): CalibrationStatus {
    if (!this.calibration) {
      return {
        active: false,
        samples: 0,
        previewOffsetMs: null,
      };
    }

    const previewOffset =
      this.calibration.samples.length > 0
        ? -(
            this.calibration.samples.reduce((sum, value) => sum + value, 0) /
            this.calibration.samples.length
          )
        : null;

    return {
      active: true,
      samples: this.calibration.samples.length,
      previewOffsetMs: previewOffset === null ? null : Math.round(previewOffset),
    };
  }

  private resolveLane(code: string): LaneIndex | null {
    const normalizedCode =
      code === 'ArrowLeft'
        ? 'KeyQ'
        : code === 'ArrowDown'
          ? 'KeyW'
          : code === 'ArrowRight'
            ? 'KeyE'
            : code;
    const lane = LANE_CODES.indexOf(normalizedCode as (typeof LANE_CODES)[number]);
    return lane === -1 ? null : (lane as LaneIndex);
  }

  private getSongTimeMs(): number {
    return this.audio.getSongTimeMs() + this.settings.latencyOffsetMs;
  }

  private getInputSongTimeMs(): number {
    if (this.latestSnapshot.mode === 'ended') {
      return this.latestSnapshot.songTimeMs;
    }

    return this.getSongTimeMs();
  }

  private loadSettings(): StoredSettings {
    const fallback: StoredSettings = {
      latencyOffsetMs: DEFAULT_LATENCY_OFFSET_MS,
      masterVolume: DEFAULT_MASTER_VOLUME,
      bestScore: 0,
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return fallback;
      const parsed = decodeStoredSettings(raw);
      if (parsed !== null) return parsed;
      this.blockStorage();
    } catch { this.blockStorage(); }
    return fallback;
  }

  private blockStorage(): void {
    this.storageBlocked = true;
    this.statusMessage = '저장 내용을 확인할 수 없어 원문을 보존합니다. 설정과 기록은 이번 실행에만 유지됩니다.';
  }

  private persistSettings(): void {
    if (this.storageBlocked) return;
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== null && decodeStoredSettings(current) === null) {
        this.blockStorage();
        return;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      this.statusMessage = '';
    } catch { this.blockStorage(); }
  }
}
