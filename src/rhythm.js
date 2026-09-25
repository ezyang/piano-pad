// Piano Safari-style rhythm syllables -> note events.
//   ta = 1 beat, ta-a = 2, ta-a-a = 3, ta-a-a-a = 4, titi / ti-ti = two half beats,
//   ti = half beat, sh / rest = 1 beat of silence.

export function parseRhythm(str) {
  const out = [];
  for (const tok of str.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    if (tok === 'titi' || tok === 'ti-ti') out.push({ beats: 0.5 }, { beats: 0.5 });
    else if (tok === 'ti') out.push({ beats: 0.5 });
    else if (tok === 'sh' || tok === 'rest') out.push({ beats: 1, rest: true });
    else if (/^ta(-a)*$/.test(tok)) out.push({ beats: tok.split('-').length });
    else throw new Error(`unknown rhythm syllable: ${tok}`);
  }
  return out;
}

// pitches: a single midi number or an array cycled over the sounding notes.
export function rhythmToEvents(rhythm, { bpm = 90, pitches = 67, start = 0.5, legato = 0.95, vel = 0.7 } = {}) {
  const beat = 60 / bpm;
  const ps = Array.isArray(pitches) ? pitches : [pitches];
  const events = [];
  let t = start;
  let k = 0;
  for (const r of rhythm) {
    const len = r.beats * beat;
    if (!r.rest) events.push({ time: t, midi: ps[k++ % ps.length], dur: len * legato, vel });
    t += len;
  }
  return events;
}
