import { BPM, DEFAULT_MASTER_VOLUME, clamp } from './config';
import type { Judgement, LaneIndex, NoteKind } from './types';

const laneFrequencies: Record<LaneIndex, number> = {
  0: 540,
  1: 680,
  2: 820,
};

export class RhythmAudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private songGain: GainNode | null = null;
  private calibrationGain: GainNode | null = null;
  private songOscillators = new Set<OscillatorNode>();
  private calibrationOscillators = new Set<OscillatorNode>();
  private volume = DEFAULT_MASTER_VOLUME;
  private songStartAtMs = 0;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.context.destination);
    }

    if (this.context.state !== 'running') {
      await this.context.resume();
    }
  }

  setMasterVolume(value: number): void {
    this.volume = clamp(value, 0, 1);

    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(
        this.volume,
        this.context?.currentTime ?? 0,
      );
    }
  }

  getMasterVolume(): number {
    return this.volume;
  }

  getCurrentContextMs(): number {
    return this.context ? this.context.currentTime * 1000 : 0;
  }

  getSongTimeMs(): number {
    if (!this.context || this.songStartAtMs === 0) {
      return 0;
    }

    return this.context.currentTime * 1000 - this.songStartAtMs;
  }

  async startSong(totalLengthMs: number, bpm = BPM): Promise<void> {
    await this.unlock();

    const context = this.context!;
    const masterGain = this.masterGain!;

    this.stopSong();
    this.stopCalibration();

    this.songGain = context.createGain();
    this.songGain.gain.value = 0.52;
    this.songGain.connect(masterGain);

    const startAt = context.currentTime + 0.16;
    this.songStartAtMs = startAt * 1000;
    this.scheduleBackingTrack(startAt, totalLengthMs, bpm, this.songGain);
  }

  stopSong(): void {
    for (const oscillator of this.songOscillators) {
      try { oscillator.stop(); } catch { /* Already ended. */ }
    }
    this.songOscillators.clear();
    this.songGain?.disconnect();
    this.songGain = null;
    this.songStartAtMs = 0;
  }

  private stopCalibration(): void {
    for (const oscillator of this.calibrationOscillators) {
      try { oscillator.stop(); } catch { /* Already ended. */ }
    }
    this.calibrationOscillators.clear();
    this.calibrationGain?.disconnect();
    this.calibrationGain = null;
  }

  async startCalibrationTrack(beats = 8, bpm = BPM): Promise<{
    startAtMs: number;
    beatMs: number;
    beats: number;
  }> {
    await this.unlock();

    this.stopSong();
    this.stopCalibration();
    const context = this.context!;
    this.calibrationGain = context.createGain();
    this.calibrationGain.connect(this.masterGain!);
    const startAt = context.currentTime + 0.48;
    const beatSeconds = 60 / bpm;

    for (let beat = 0; beat < beats; beat += 1) {
      this.scheduleTone({
        when: startAt + beat * beatSeconds,
        duration: 0.09,
        frequency: beat % 4 === 0 ? 1_040 : 760,
        frequencyEnd: 620,
        gain: beat % 4 === 0 ? 0.34 : 0.24,
        type: 'square',
      }, this.calibrationGain);
    }

    return {
      startAtMs: startAt * 1000,
      beatMs: beatSeconds * 1000,
      beats,
    };
  }

  playShot(lane: LaneIndex, kind: NoteKind, judgement: Judgement): void {
    if (!this.context || judgement === 'miss') {
      return;
    }

    const now = this.context.currentTime;
    const base = laneFrequencies[lane];
    const gainBoost =
      judgement === 'perfect' ? 0.25 : judgement === 'great' ? 0.2 : 0.16;
    const bonusBoost = kind === 'bonus' ? 1.12 : 1;

    this.scheduleTone({
      when: now,
      duration: kind === 'hold' ? 0.11 : 0.09,
      frequency: base * bonusBoost,
      frequencyEnd: base * 0.68,
      gain: gainBoost,
      type: kind === 'bonus' ? 'sawtooth' : 'square',
    });

    this.scheduleTone({
      when: now + 0.01,
      duration: 0.06,
      frequency: base * 1.6,
      frequencyEnd: base * 0.82,
      gain: gainBoost * 0.45,
      type: 'triangle',
    });
  }

  playHoldTick(lane: LaneIndex): void {
    if (!this.context) {
      return;
    }

    const base = laneFrequencies[lane] * 0.78;
    this.scheduleTone({
      when: this.context.currentTime,
      duration: 0.05,
      frequency: base,
      frequencyEnd: base * 0.82,
      gain: 0.12,
      type: 'triangle',
    });
  }

  playBomb(): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.scheduleTone({
      when: now,
      duration: 0.18,
      frequency: 160,
      frequencyEnd: 54,
      gain: 0.28,
      type: 'sawtooth',
    });
  }

  playMiss(): void {
    if (!this.context) {
      return;
    }

    this.scheduleTone({
      when: this.context.currentTime,
      duration: 0.12,
      frequency: 320,
      frequencyEnd: 140,
      gain: 0.16,
      type: 'triangle',
    });
  }

  playFeverStart(): void {
    if (!this.context) {
      return;
    }

    const now = this.context.currentTime;
    this.scheduleTone({
      when: now,
      duration: 0.24,
      frequency: 480,
      frequencyEnd: 1_060,
      gain: 0.28,
      type: 'sawtooth',
    });
    this.scheduleTone({
      when: now + 0.06,
      duration: 0.22,
      frequency: 760,
      frequencyEnd: 1_360,
      gain: 0.18,
      type: 'square',
    });
  }

  private scheduleBackingTrack(
    startAt: number,
    totalLengthMs: number,
    bpm: number,
    bus: GainNode,
  ): void {
    const beatSeconds = 60 / bpm;
    const totalBeats = Math.ceil(totalLengthMs / 1000 / beatSeconds) + 4;
    const bassline = [110, 123.47, 146.83, 164.81];

    for (let beat = 0; beat < totalBeats; beat += 1) {
      const when = startAt + beat * beatSeconds;
      const step = beat % 4;

      this.scheduleTone(
        {
          when,
          duration: 0.14,
          frequency: step === 0 ? 96 : 84,
          frequencyEnd: 52,
          gain: 0.11,
          type: 'sine',
        },
        bus,
      );

      if (step === 1 || step === 3) {
        this.scheduleTone(
          {
            when: when + 0.02,
            duration: 0.09,
            frequency: 220,
            frequencyEnd: 130,
            gain: 0.05,
            type: 'triangle',
          },
          bus,
        );
      }

      this.scheduleTone(
        {
          when,
          duration: 0.18,
          frequency: bassline[beat % bassline.length],
          frequencyEnd: bassline[beat % bassline.length] * 0.98,
          gain: 0.045,
          type: 'square',
        },
        bus,
      );

      const hatStart = when;
      for (let tick = 0; tick < 2; tick += 1) {
        this.scheduleTone(
          {
            when: hatStart + tick * beatSeconds * 0.5,
            duration: 0.03,
            frequency: 1_800,
            frequencyEnd: 980,
            gain: 0.025,
            type: 'square',
          },
          bus,
        );
      }
    }
  }

  private scheduleTone(
    options: {
      when: number;
      duration: number;
      frequency: number;
      frequencyEnd: number;
      gain: number;
      type: OscillatorType;
    },
    destination = this.masterGain ?? undefined,
  ): void {
    if (!this.context || !destination) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gainNode = this.context.createGain();
    const filter = this.context.createBiquadFilter();

    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, options.when);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(32, options.frequencyEnd),
      options.when + options.duration,
    );

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2_400, options.when);
    filter.frequency.exponentialRampToValueAtTime(
      260,
      options.when + options.duration,
    );

    gainNode.gain.setValueAtTime(0.0001, options.when);
    gainNode.gain.exponentialRampToValueAtTime(
      options.gain,
      options.when + 0.01,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      options.when + options.duration,
    );

    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(destination);

    const collection = destination === this.songGain ? this.songOscillators
      : destination === this.calibrationGain ? this.calibrationOscillators : null;
    collection?.add(oscillator);
    oscillator.onended = () => {
      collection?.delete(oscillator);
      oscillator.disconnect(); filter.disconnect(); gainNode.disconnect();
    };
    oscillator.start(options.when);
    oscillator.stop(options.when + options.duration + 0.02);
  }
}
