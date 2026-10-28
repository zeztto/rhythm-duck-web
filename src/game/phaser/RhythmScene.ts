import Phaser from 'phaser';
import {
  APPROACH_MS,
  GAME_HEIGHT,
  GAME_WIDTH,
  JUDGE_LINE_Y,
  LANE_COLORS,
  LANE_GAP,
  LANE_WIDTH,
  NOTE_COLORS,
  PLAYFIELD_BOTTOM,
  PLAYFIELD_LEFT,
  PLAYFIELD_TOP,
  clamp,
  laneCenterX,
} from '../config';
import type { RhythmController } from '../controller';
import type { FeedbackEvent, GameSnapshot, RuntimeNote } from '../types';

export class RhythmScene extends Phaser.Scene {
  private readonly controller;
  private graphics!: Phaser.GameObjects.Graphics;
  private feedbackPool: Phaser.GameObjects.Text[] = [];

  constructor(controller: RhythmController) {
    super('rhythm-scene');
    this.controller = controller;
  }

  create(): void {
    this.graphics = this.add.graphics();

    for (let index = 0; index < 18; index += 1) {
      const text = this.add.text(0, 0, '', {
        fontFamily: 'Arial, "Apple SD Gothic Neo", sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        align: 'center',
        stroke: '#09101b',
        strokeThickness: 6,
      });
      text.setOrigin(0.5);
      text.setVisible(false);
      this.feedbackPool.push(text);
    }
  }

  update(): void {
    const snapshot = this.controller.step();
    this.draw(snapshot);
  }

  redrawFromController(): void {
    this.draw(this.controller.getSnapshot());
  }

  private draw(snapshot: GameSnapshot): void {
    const graphics = this.graphics;
    graphics.clear();

    this.drawBackdrop(snapshot);
    this.drawLanes(snapshot);
    this.drawJudgeLine(snapshot);
    this.drawNotes(snapshot);
    this.drawFeedback(snapshot.feedback, snapshot.songTimeMs);
  }

  private drawBackdrop(snapshot: GameSnapshot): void {
    const graphics = this.graphics;
    graphics.fillStyle(snapshot.feverActive ? 0x242012 : 0x101722, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    graphics.fillStyle(0x0b1222, 0.74);
    graphics.fillRoundedRect(54, 32, 852, 576, 34);

    graphics.lineStyle(2, snapshot.feverActive ? 0xff9f43 : 0x5ef2ff, 0.36);
    graphics.strokeRoundedRect(54, 32, 852, 576, 34);

    graphics.lineStyle(1, 0xffffff, 0.06);
    for (let y = PLAYFIELD_TOP; y <= PLAYFIELD_BOTTOM; y += 42) {
      graphics.beginPath();
      graphics.moveTo(72, y);
      graphics.lineTo(888, y);
      graphics.strokePath();
    }
  }

  private drawLanes(snapshot: GameSnapshot): void {
    const graphics = this.graphics;

    for (let lane = 0; lane < 3; lane += 1) {
      const x = PLAYFIELD_LEFT + lane * (LANE_WIDTH + LANE_GAP);
      const laneColor = LANE_COLORS[lane as 0 | 1 | 2];
      const pulse = snapshot.lanes[lane].pulse;
      const alpha = snapshot.lanes[lane].pressed ? 0.18 : 0.07 + pulse * 0.18;

      graphics.fillStyle(laneColor, alpha);
      graphics.fillRoundedRect(
        x,
        PLAYFIELD_TOP,
        LANE_WIDTH,
        PLAYFIELD_BOTTOM - PLAYFIELD_TOP,
        26,
      );

      graphics.lineStyle(2, laneColor, 0.3 + pulse * 0.34);
      graphics.strokeRoundedRect(
        x,
        PLAYFIELD_TOP,
        LANE_WIDTH,
        PLAYFIELD_BOTTOM - PLAYFIELD_TOP,
        26,
      );

      graphics.fillStyle(0xffffff, 0.08);
      graphics.fillRoundedRect(
        x + 18,
        PLAYFIELD_TOP + 18,
        LANE_WIDTH - 36,
        32,
        16,
      );
    }
  }

  private drawJudgeLine(snapshot: GameSnapshot): void {
    const graphics = this.graphics;
    graphics.lineStyle(4, snapshot.feverActive ? 0xff9f43 : 0xffffff, 0.92);
    graphics.beginPath();
    graphics.moveTo(76, JUDGE_LINE_Y);
    graphics.lineTo(884, JUDGE_LINE_Y);
    graphics.strokePath();

    graphics.fillStyle(snapshot.feverActive ? 0xff9f43 : 0x5ef2ff, 0.22);
    graphics.fillRoundedRect(76, JUDGE_LINE_Y - 13, 808, 26, 14);

    for (let lane = 0; lane < 3; lane += 1) {
      const centerX = laneCenterX(lane as 0 | 1 | 2);
      const lanePulse = snapshot.lanes[lane].pulse;
      const accent =
        lane === 0 ? 0x5ef2ff : lane === 1 ? 0xffe66a : 0xff6a95;

      graphics.fillStyle(accent, 0.14 + lanePulse * 0.24);
      graphics.fillRoundedRect(centerX - 42, JUDGE_LINE_Y - 36, 84, 72, 18);

      graphics.lineStyle(2, accent, 0.44 + lanePulse * 0.3);
      graphics.strokeRoundedRect(centerX - 42, JUDGE_LINE_Y - 36, 84, 72, 18);
    }
  }

  private drawNotes(snapshot: GameSnapshot): void {
    const notes = snapshot.chart.filter((note) => {
      if (note.status === 'holding') {
        return true;
      }

      if (note.status === 'pending') {
        return note.timeMs - snapshot.songTimeMs < APPROACH_MS[note.kind] + 360;
      }

      return (
        typeof note.resolvedAtMs === 'number' &&
        snapshot.songTimeMs - note.resolvedAtMs < 260
      );
    });

    for (const note of notes) {
      this.drawSingleNote(note, snapshot.songTimeMs, snapshot.feverActive);
    }
  }

  private drawSingleNote(
    note: RuntimeNote,
    songTimeMs: number,
    feverActive: boolean,
  ): void {
    const graphics = this.graphics;
    const lane = note.lane;
    const centerX = laneCenterX(lane);
    const baseColor = NOTE_COLORS[note.kind];
    const laneColor = LANE_COLORS[lane];
    const alpha = note.status === 'pending' || note.status === 'holding' ? 1 : 0.42;

    const headY =
      note.status === 'holding'
        ? JUDGE_LINE_Y
        : this.noteYForTime(note.timeMs, songTimeMs, note.kind);

    if (note.kind === 'hold') {
      const tailTime = note.timeMs + (note.durationMs ?? 0);
      const tailY = this.noteYForTime(tailTime, songTimeMs, note.kind);
      const topY = Math.min(headY, tailY);
      const bodyHeight = Math.max(30, Math.abs(headY - tailY));

      graphics.fillStyle(0x7bff94, 0.16);
      graphics.fillRoundedRect(centerX - 26, topY, 52, bodyHeight, 18);
      graphics.lineStyle(2, 0x7bff94, 0.45);
      graphics.strokeRoundedRect(centerX - 26, topY, 52, bodyHeight, 18);
    }

    if (note.kind === 'bomb') {
      graphics.fillStyle(baseColor, 0.94 * alpha);
      graphics.fillCircle(centerX, headY, 22);
      graphics.lineStyle(4, 0xffffff, 0.75 * alpha);
      graphics.beginPath();
      graphics.moveTo(centerX - 14, headY - 14);
      graphics.lineTo(centerX + 14, headY + 14);
      graphics.moveTo(centerX + 14, headY - 14);
      graphics.lineTo(centerX - 14, headY + 14);
      graphics.strokePath();
      return;
    }

    const scale = note.kind === 'bonus' ? 1.08 : 1;
    const bodyWidth = 44 * scale;
    const bodyHeight = 28 * scale;
    const headRadius = 11 * scale;
    const headX = centerX + 15 * scale;
    const headYPos = headY - 11 * scale;

    graphics.fillStyle(baseColor, 0.22 * alpha);
    graphics.fillCircle(centerX, headY, 36 * scale);

    if (note.kind === 'bonus' || feverActive) {
      graphics.lineStyle(2, note.kind === 'bonus' ? 0xffe66a : 0xff9f43, 0.42 * alpha);
      graphics.strokeCircle(centerX, headY, 30 * scale);
    }

    graphics.fillStyle(baseColor, 0.98 * alpha);
    graphics.fillEllipse(centerX - 4 * scale, headY + 1 * scale, bodyWidth, bodyHeight);
    graphics.fillCircle(headX, headYPos, headRadius);

    graphics.fillStyle(0xffb24c, 1 * alpha);
    graphics.fillTriangle(
      headX + 8 * scale,
      headYPos + 1 * scale,
      headX + 22 * scale,
      headYPos - 2 * scale,
      headX + 22 * scale,
      headYPos + 6 * scale,
    );

    graphics.fillStyle(laneColor, 0.86 * alpha);
    graphics.fillCircle(centerX - 18 * scale, headY - 2 * scale, 8 * scale);

    graphics.fillStyle(0x09101b, 0.92 * alpha);
    graphics.fillCircle(headX + 3 * scale, headYPos - 2 * scale, 2.2 * scale);
  }

  private drawFeedback(events: FeedbackEvent[], songTimeMs: number): void {
    let index = 0;
    for (const event of events) {
      const text = this.feedbackPool[index];
      if (!text) {
        break;
      }

      const life = clamp(
        (songTimeMs - event.createdAtMs) / (event.expiresAtMs - event.createdAtMs),
        0,
        1,
      );
      const yOffset = life * 42;
      const x =
        event.lane === null ? GAME_WIDTH / 2 : laneCenterX(event.lane as 0 | 1 | 2);
      const y = event.lane === null ? 118 - yOffset * 0.2 : JUDGE_LINE_Y - 56 - yOffset;

      text.setText(event.label);
      text.setColor(event.accent);
      text.setAlpha(1 - life);
      text.setPosition(x, y);
      text.setScale(event.kind === 'system' ? 1.1 - life * 0.18 : 1 - life * 0.2);
      text.setVisible(true);
      index += 1;
    }

    for (; index < this.feedbackPool.length; index += 1) {
      this.feedbackPool[index].setVisible(false);
    }
  }

  private noteYForTime(timeMs: number, songTimeMs: number, kind: RuntimeNote['kind']): number {
    const approachMs = APPROACH_MS[kind];
    const progress = 1 - (timeMs - songTimeMs) / approachMs;
    return clamp(
      PLAYFIELD_TOP + progress * (JUDGE_LINE_Y - PLAYFIELD_TOP),
      PLAYFIELD_TOP - 40,
      JUDGE_LINE_Y,
    );
  }
}
