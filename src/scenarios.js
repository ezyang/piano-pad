// Test scenarios shared by the Node bench and the browser jig.
import { parseRhythm, rhythmToEvents } from './rhythm.js';
import { mulberry32 } from './synth.js';

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69;

const mary = [E4, D4, C4, D4, E4, E4, E4, D4, D4, D4, E4, G4, G4];
const maryRhythm = 'ta ta ta ta ta ta ta-a ta ta ta-a ta ta ta-a';

export const SCENARIOS = {
  safari: {
    label: 'Piano Safari: G  ta-a ta-a ta ta titi ta',
    make: () => rhythmToEvents(parseRhythm('ta-a ta-a ta ta titi ta'), { bpm: 90, pitches: G4 }),
  },
  repeated: {
    label: 'Repeated C4 eighths, 132 bpm, legato',
    make: () => rhythmToEvents(parseRhythm('titi titi titi titi titi titi titi titi'), { bpm: 132, pitches: C4, legato: 1 }),
  },
  mary: {
    label: 'Mary Had a Little Lamb (legato, overlapping)',
    make: () => rhythmToEvents(parseRhythm(maryRhythm), { bpm: 100, pitches: mary, legato: 1.15 }),
  },
  soft: {
    label: 'Soft playing (pp) C-D-E-F-G',
    make: () => rhythmToEvents(parseRhythm('ta ta ta ta ta-a'), { bpm: 80, pitches: [C4, D4, E4, F4, G4], vel: 0.2 }),
  },
  registers: {
    label: 'Wide register: C2 .. C7',
    make: () => rhythmToEvents(parseRhythm('ta ta ta ta ta ta'), { bpm: 70, pitches: [36, 48, 60, 72, 84, 96] }),
  },
  kid: {
    label: 'Kid-like: uneven timing, velocity, one hesitation',
    make: (seed = 7) => {
      const rng = mulberry32(seed);
      const ev = rhythmToEvents(parseRhythm('ta ta ta ta ta ta ta-a ta ta ta-a ta ta ta-a'), {
        bpm: 90, pitches: [C4, D4, E4, F4, G4, A4, G4, F4, E4, D4, C4, D4, C4],
      });
      let shift = 0;
      return ev.map((e, i) => {
        if (i === 6) shift += 0.7; // hesitation
        return {
          ...e,
          time: e.time + shift + (rng() - 0.5) * 0.08,
          vel: 0.3 + 0.6 * rng(),
          dur: e.dur * (0.5 + 0.5 * rng()),
        };
      });
    },
  },
};
