import { BPM } from './config';
import type { ChartNote, LaneIndex, NoteKind, SongChart } from './types';

const beatMs = 60_000 / BPM;
const leadInBeats = 4;
const leadInMs = Math.round(leadInBeats * beatMs);

interface ChartEvent {
  lane: LaneIndex;
  beat: number;
  kind?: NoteKind;
  durationBeats?: number;
}

function createNote(event: ChartEvent, index: number): ChartNote {
  return {
    id: `duck-${index + 1}`,
    lane: event.lane,
    timeMs: leadInMs + Math.round(event.beat * beatMs),
    kind: event.kind ?? 'tap',
    durationMs:
      event.kind === 'hold' && event.durationBeats
        ? Math.round(event.durationBeats * beatMs)
        : undefined,
  };
}

const events: ChartEvent[] = [
  { beat: 0, lane: 0 },
  { beat: 1, lane: 1 },
  { beat: 2, lane: 2 },
  { beat: 3, lane: 1 },

  { beat: 4, lane: 0 },
  { beat: 4.5, lane: 2 },
  { beat: 6, lane: 1, kind: 'hold', durationBeats: 2 },
  { beat: 7.5, lane: 2 },

  { beat: 8, lane: 2 },
  { beat: 9, lane: 1 },
  { beat: 10, lane: 0, kind: 'bonus' },
  { beat: 11, lane: 2 },

  { beat: 12, lane: 1 },
  { beat: 13, lane: 0, kind: 'bomb' },
  { beat: 14, lane: 2 },
  { beat: 15, lane: 1 },

  { beat: 16, lane: 0 },
  { beat: 16.5, lane: 1 },
  { beat: 17, lane: 2 },
  { beat: 18, lane: 1, kind: 'hold', durationBeats: 1.5 },
  { beat: 19.5, lane: 0 },

  { beat: 20, lane: 2 },
  { beat: 20.5, lane: 0 },
  { beat: 21, lane: 1 },
  { beat: 21.5, lane: 2 },
  { beat: 22, lane: 1, kind: 'bonus' },
  { beat: 23, lane: 0 },

  { beat: 24, lane: 0 },
  { beat: 25, lane: 1 },
  { beat: 25.5, lane: 2 },
  { beat: 26.5, lane: 0, kind: 'bomb' },
  { beat: 27, lane: 2 },
  { beat: 27.5, lane: 1 },

  { beat: 28, lane: 0, kind: 'hold', durationBeats: 2 },
  { beat: 28.5, lane: 2 },
  { beat: 30, lane: 1 },
  { beat: 31, lane: 2, kind: 'bonus' },

  { beat: 32, lane: 1 },
  { beat: 32.5, lane: 0 },
  { beat: 33, lane: 2 },
  { beat: 33.5, lane: 1 },
  { beat: 34, lane: 0 },
  { beat: 35, lane: 2, kind: 'hold', durationBeats: 1.5 },

  { beat: 36, lane: 1 },
  { beat: 36.5, lane: 0 },
  { beat: 37, lane: 2 },
  { beat: 37.5, lane: 1 },
  { beat: 38, lane: 2, kind: 'bomb' },
  { beat: 39, lane: 0 },

  { beat: 40, lane: 0, kind: 'bonus' },
  { beat: 41, lane: 1 },
  { beat: 42, lane: 2 },
  { beat: 43, lane: 1 },

  { beat: 44, lane: 0 },
  { beat: 44.5, lane: 2 },
  { beat: 45, lane: 1, kind: 'hold', durationBeats: 1.5 },
  { beat: 47, lane: 2, kind: 'bonus' },

  { beat: 48, lane: 1 },
  { beat: 48.5, lane: 0 },
  { beat: 49, lane: 2 },
  { beat: 49.5, lane: 1 },
  { beat: 50, lane: 0 },
  { beat: 50.5, lane: 2 },
  { beat: 51, lane: 1 },
  { beat: 51.5, lane: 0, kind: 'bomb' },

  { beat: 52, lane: 2 },
  { beat: 53, lane: 1 },
  { beat: 54, lane: 0, kind: 'bonus' },
  { beat: 55, lane: 2 },

  { beat: 56, lane: 0 },
  { beat: 56.5, lane: 1 },
  { beat: 57, lane: 2 },
  { beat: 57.5, lane: 1 },
  { beat: 58, lane: 0 },
  { beat: 58.5, lane: 2 },
  { beat: 59, lane: 1, kind: 'hold', durationBeats: 1.5 },
  { beat: 60.5, lane: 2, kind: 'bonus' },
  { beat: 61.5, lane: 0 },
  { beat: 62, lane: 1 },
  { beat: 63, lane: 2 },
];

const notes = events.map(createNote).sort((a, b) => a.timeMs - b.timeMs);
const lastNote = notes.at(-1);
const totalLengthMs =
  (lastNote?.timeMs ?? 0) + (lastNote?.durationMs ?? 0) + Math.round(beatMs * 6);

export const rhythmChart: SongChart = {
  id: 'rhythm-duck-one',
  title: '오리의 박자',
  artist: '직접 작성한 WebAudio 합성 패턴',
  bpm: BPM,
  leadInMs,
  notes,
  totalLengthMs,
};
