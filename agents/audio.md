# piano-audio

You turn what the iPad microphone hears into note events the rest of the app
can use: fast, accurate, and robust to a real room (a quiet mic, a slightly
out-of-tune piano, adults talking, a 2-year-old banging on keys).

## You own

- `src/detector.js`, `src/detector-node.js`, `src/detector-worklet.js`
- `src/app/engine.js` — the contract with the app; keep its header comment true
- `src/synth.js`, `src/evaluate.js`, `src/scenarios.js`, `src/rhythm.js`
- `jig.html`, `src/jig.js` (the detector test jig)
- `src/app/screens/calibrate.js` (grown-up calibration recordings; uses the
  app's UI helpers, so keep it plain)
- `test/bench.mjs`, `tools/replay.mjs`, `tools/oracle.mjs`, `tools/onset-audit.mjs`

## You don't own (ask `piano-app`)

- `src/app/telemetry.js` and the log format. If you need a new field logged,
  ask. You're the main consumer of detector events in the logs.
- The detector toggle's UI in `screens/home.js`. The options themselves live in
  `detectorOptions()` in `engine.js`, which is yours.

## How to work

- You run in the worktree `~/Dev/piano-pad-audio` on branch `audio`. Ship per
  the rules in `CLAUDE.md`.
- Tune on **real recordings**, not the synth: the synth bench and real audio
  disagree. Labeled calibration sessions (kind `calibration`, with prompt ids)
  are the closest thing to ground truth; ask the parent for more takes when
  you need them.
- Measure before and after every detector change, and write the numbers in
  your commit message.
- Changing what `onNote` emits, or when it fires, is a contract change: tell
  `piano-app` before pushing.
- `piano-pedagogy` may ask for capabilities (e.g. chords once she plays hands
  together). Treat those as your roadmap.

## Current state

(Keep this section up to date. It's what the next instance of you reads.)

As of 2026-09-26:
- The iPad mic hears the piano quietly (notes ~ -30..-40 dBFS, room ~
  -70..-80). Raw spectral flux is ~1 vs ~50-80 on the synth, so thresholds tuned
  on the synth fail. Fixed with `fluxNormalize` + `riseOneSided` (the dampers'
  sharp drops had inflated the adaptive rise threshold, so fast notes were
  missed).
- Piano tuning (measured 2026-09-26 over all 87 recordings, ~1100 notes,
  NSDF on 4096 samples 100 ms into the sustain): about +5..+13 cents sharp
  everywhere (C4 +9, D4 +6, E4 +3, F4 +13 but spread 0..+18, G4 +6, A4 +12,
  B4 +13, C5 +10). Nowhere near the ±50-cent rounding edge. The older
  "F4 +35, G4 -9" note was wrong. A per-key tuning table changes 1 of 1123
  notes, so we don't use one. Where the detector picks a different key than
  the sustained pitch (~2%), its onset-window estimate is off by 70+ cents,
  usually with the previous note still ringing. That's a pitch-window/overlap
  problem, not tuning.
- Adult voices show up as ~120-180 Hz "notes". The parent finds this charming;
  the app ignores speech in tasks.
- A rare iOS mic freeze replays identical audio (there's a watchdog).
  Reconnecting the mic after silence caused phantom first notes, so the mic
  now stays connected.
- Audit (oracle + onset-audit, oracle cached as `*.oracle.json` beside
  recordings): the live detector matches ~63% of oracle attacks in her range
  (A3+): ~80% of firm notes, ~50% of medium-soft, ~19% of very soft. Lowering
  thresholds trades ~1 recovered note for 2-3 false ones, so this needs
  labeled data, not blind tuning. Most strong "misses" are loud attacks with
  no clear pitch (clusters or bangs, often the 2-year-old).
- The overlap-aware detector is off by default (suspected real-piano
  regression). Tune it with replays before turning it back on.
- The detector is monophonic. Chords aren't needed yet.
- Every commit stays live at `/v/<sha>/` (see CLAUDE.md), and logs carry
  `app.version`/`app.path`. When live and replay disagree, check which version
  made the recording (`replay.mjs` prints it) before blaming the current
  detector. On-device storage is disposable (CLAUDE.md): if the detector ever
  stores anything (calibration, tuning) and its shape changes, use a new key
  and start empty. Nothing should depend on it lasting; the durable record
  is the logs on autobox.
- Session names for all three agents are in `~/Dev/piano-sessions.md` (local).
  Update the piano-audio line when a session restarts (`ListAgents` prints
  this session's name).
- Research on neural real-time piano transcription and web vs native is in
  `agents/audio-research.md` (2026-09-26). Direction: stay on the web; next
  steps are a stronger offline oracle, logging the mic's track settings, and
  timing a Mobile-AMT-sized model in ORT-web on her iPad.
- New session kinds (app 96597e3): `homework` (whole piece, RH C4-G4 then
  LH C3-G3; `judge` grades hit/other/ignored) and `adventure` (bookkeeping,
  no detector events). **LH C3-G3 is untested with her playing**: check
  detection there once recordings arrive. Speech (~B2-F#3) now falls inside
  the task range. Told piano-app on 2026-09-26 (suggested: in LH, advance only
  on hits; shipped in 0f70294).
- `voice` flag (2026-09-26): below C4 the detector tracks pitch over the
  first ~45 ms (5 NSDF windows of 1024, 256 apart) and sets `voice` if it
  moves > 40 cents (`voiceBelow`, `voiceCents`). onNote carries it. Over the
  recordings: 158/290 low detections flagged; real C3-G3 piano 0/16; synth
  G2-B3 0/52. Steady vowels get through, so it catches about half of speech.
  The app drops voice notes everywhere (08a744e, judge `why: 'voice'`), and
  pitch events in the logs carry `voice`. Next: check it on real LH homework
  recordings, looking for real notes wrongly flagged.
- Reference transcriptions (2026-09-26): Kong et al.'s offline model over
  all recordings (`tools/nn/kong.py`, README in tools/nn). Recordings, refs and
  the Python venv live in ~/Dev/piano-audio-data (not in git).
  `tools/ref-audit.mjs` scores the detector against them. Baseline then: 63%
  of reference attacks (firm 86%, medium 68%, soft 26%), 290 false notes
  in 25 min, right letter 96%.
- Piano profile, `src/piano-profile.json`, loaded by engine.js and by the
  tools (`tools/profile.mjs`; `--no-profile` for the plain detector). The
  synth bench runs without it.
  - `octaveDown: [72]`: C4's fundamental is ~15 dB below its 2nd harmonic
    here, so C4 read as C5 (191 of ~290 wrong notes). Exact note 81.5% ->
    92.6%. It needs real energy at the lower fundamental. Without that, a
    perfectly periodic synth C5 flipped.
  - `templates`: per-key NMF templates for experimental template onsets
    (`onsets: 'templates'`; grown-up detector setting 'profile'). 4-fold CV:
    at tplRise .2 firm 94% / medium+ 85% / 392 false, vs DSP default
    86% / 75% / 290 and DSP K4 R4 92% / 83% / 562. Pitch exact ~87%. No
    better than DSP at the default operating point. A judgment call on more
    notes vs more false ones, so it's opt-in until the parent tries it.
  - Energy-only onset features (HF band, longer rise spans) don't beat the
    current full-band rise on this mic. Pitch drift doesn't separate false
    notes from real ones above C4.
- **Onset network = default (2026-09-26).** tools/nn/onset_mlp.py trains a
  tiny MLP (4 log-spectrum frames x 216 bins -> 128 ReLU -> 52 keys A2..C7,
  int8 weights in the profile's `net`) on Kong labels of her recordings.
  NetOnsets in detector.js; 'net' mode keeps the classic detector for notes
  below A3 (`lowDspBelow: 57`) and dedupes. 4-fold CV, all notes: firm
  86.3% -> 94.7%, medium+firm 74.9% -> 84.3%, false 323 -> 132, letter 96.4%.
  Weak spot: C3-G#3 (few training notes; the net alone did firm 76% vs
  classic 94%), hence the split. Transposition augmentation hurt. **Retrain
  as recordings accumulate**, especially once LH homework recordings exist:
  rsync logs, kong.py on the new ones, EXPORT=... onset_mlp.py split=all,
  put it in the profile's `net`, check with the fold CV (tools/nn/README.md).
  Engine setting 'classic' = old detector alone (asked piano-app for a menu
  entry).
- Onsets & Velocities: running its cloned repo code was blocked by the
  permission classifier; needs the parent's OK.
- **Audio package** (e4aa751): src/detector.js, detector-worklet.js,
  detector-node.js and piano-profile.json are self-contained; detector-node
  loads the profile. The parent wants better detectors backported to old app
  versions (/v/<sha>/). Proposed to piano-app on 2026-09-26: build-site
  overlays HEAD's package into every version and stamps an audio version.
  So **keep the package backward compatible**: createDetectorNode(ctx, opts)
  with the options old engines pass ({debug}, {debug, overlapAware}), the
  'config' message, and the onset/pitch/frames events. Every engine back to
  2df4d27 uses exactly that.
- **Calibration takes (2026-09-26, 14 takes, app 649461e, network default)**
  are the best ground truth there is: `node tools/cal-report.mjs
  <logs>/pmuj0*.json` (asked vs live vs replay vs Kong). Keep them OUT of
  network training so they stay a clean test set. Live: 64/70 right on the
  ten normal-speed takes, 3 wrong. After the low-note gate (lowNetMin),
  replay: 68/70, 0 wrong. Remaining: legato E4 under a held C4 (net sees
  nothing), pedal F4 (net fires on C4/C5, sympathetic strings?), a fast
  scale at ~10 notes/s (adult speed; misses + pitch errors), one adult-
  speech E3. Legato/pedal need training examples. Mic: iOS Safari reports
  only echoCancellation (false) as settable; no AGC/noise-suppression
  constraints exist there.
- Two-stage notes ("a note happened", then the pitch) measured 2026-09-26,
  not built. The first onset signal comes ~3 ms after the key, but 38% of
  those never become notes (~50/min in practice, ~90/min while people talk).
  Re-reading the pitch 60-100 ms later fixes about as many notes as it
  breaks (44 vs 47). Notes already arrive at ~27 ms (~45 below C4). Revisit
  only if the app wants a subtle "heard something" cue that tolerates false
  signals.
- **Tuning, corrected 2026-09-27.** Rounding must use the pitch the detector
  reads at the attack (~25 ms), not the steady pitch. My 2026-09-26 "no table
  needed" (steady +13 cents) was wrong for F4: it read +25..+50 at the attack
  on Sep 26 and +50..+75 on Sep 27 (drifting, or struck harder), so it came
  out F#4. Hotfix aa02741: profile "tuning" {65: 60}; rounding centers on it.
  TODO: a full table from `node tools/tuning.mjs <recs> --by-day` (B4 ~+23,
  A4 ~-9, A#4 ~-18 at the attack). Re-measure regularly: the logs carry f0
  for every note even without audio, so drift shows up there first.
- **2026-09-27 lessons (read before changing defaults).**
  - Evaluation: the Kong reference misses quick re-strikes/mashing, and the
    song target isn't ground truth (she and the parent play other things).
    CV against Kong approved two changes that hurt her real homework (the
    low-note gate; the network default, which missed repeated D4s: 16/74
    loud D4s today vs classic 60/74). The ONLY true labels are the parent's
    calibration takes (`cal-report.mjs --summary [--expect] [--net]`), and
    they're clean adult playing. Don't flip defaults on Kong-only evidence;
    get labeled messy takes (asked the parent) or labels for disagreements.
  - State: classic is the default (0f9b37f), with the profile's tuning
    (F4 +60, aa02741) and C4 octave fix. engine.expect (f8ef96d): expected
    letter skips the voice filter, accepted at clarity > 0.4.
  - Calibration takes (right/missed/extra): classic 59/25/25; +expect
    62/22/25; classic+pitch retry 67/17/36; network 72/12/9 (fell apart on
    her repeated D4s); network+fallback 0.85: 73/11/21, and D4s today
    55/74. Classic's big weakness here: onsets fire on finger/key noise
    ~30 ms before the string sounds, so the pitch window has no tone yet.
- **Parent labels (2026-09-27).** tools/label/: 60 disputed moments from
  Sep 27 sessions (15 each: classic-only, net-only, ref-only, pitch), served
  on autobox at http://192.168.86.239:8770/ (`~/piano-labels`, started by
  hand; stop it when done; this Mac's firewall blocks LAN). Answers:
  autobox:piano-labels/labels-1/labels.jsonl. Score them with
  `node tools/label/score.mjs <dir> [--rows]` after copying them back. The
  parent won't label endlessly, so pick clips by what the decision needs.
- **Parent labels, batch 1 (32 of 60 answered, Sep 27 sessions).** Notes
  only the classic detector heard: 0/8 real. Only the network (+fallback):
  1/8. Only the reference: 3/8 (both detectors missed D4 twice, C3 once).
  Pitch disagreements: 5 real, network right 4, classic 1 (2 splats).
  Blind spot fixed in batch 2 (labels-2, 28 clips): two sources agree and
  the third is silent (net-miss / classic-miss / ref-miss) plus more pitch.
- **Parent labels, both batches (61 answers).** only-classic 0/8 real;
  only-net 1/8; only-ref 3/8; net+ref with classic silent 7/8 real (+1
  hard); classic+ref with net silent 8/8 real; both detectors without ref
  2/6 real (2 no, 2 splat/unsure); pitch disagreements: network right 6/8,
  classic 3/8. The real notes the network misses are LOUD (-32..-48 dBFS),
  classic's junk quiet (-57..-73), hence the loud fallback (net mode):
  calibration 73/11/11 vs classic 59/25/25; loud-note hits today match or
  beat classic on every key but B3. Recommended as the default; waiting on
  the parent's OK (we flip-flopped once already).
- **Default = network + loud fallback (parent OK'd, 2026-09-27).** 'classic'
  remains in the menu. Keep scoring changes on the calibration takes and on
  new parent labels before touching the default again.
- **Grown-up homework runs 2026-09-28** (iPad on stiff fabric, still on the
  piano; eval-grownup-0928.json, the song is the answer key). Live: G song
  clean; the left hand (classic path) doubled or early notes on finger/key
  noise 100-250 ms before strikes, and a D4 after C4 read as C#4. Replay
  (AAC recording, not the raw live audio): 67/70 right, 6 extra. "Tone rise"
  (the pitch must get louder at the onset) separates extras on clean takes,
  but globally it cost 6 of her 29 labeled real notes; on the classic path
  only (minToneRise 6): takes extras 11 -> 6, labels 22 -> 21 caught.
  Off for now. Pitch events now carry `level` and `toneRise` for analysis.
- **Design review with Astra (2026-09-28, agents/design-review-2026-09-28.md).**
  Adopted top-7 for the next two weeks (pending the parent's OK): (1) PCM
  replay parity: save the exact PCM entering the live detector in
  diagnostic sessions and reproduce live events; (2) audit the 8 re-strikes
  the network missed (Kong DID hear them: check targets/decoding, not "teacher
  blind spot"); (3) independent eval: fully labeled random natural-practice
  excerpts + an untouched later acceptance sample (the disagreement labels
  are diagnostic only, not rates); (4) targeted real recordings (repeats,
  soft/low, overlap, iPad isolation A/B); (5) attack confirmation: a
  precursor opens a candidate, the acoustic onset is confirmed later, and
  NSDF reads pitch there (keep NSDF; the pitch gap was onset timing);
  (6) retrain the tiny model with verified supervision, then one compact
  temporal challenger in a worker+WASM; (7) validate policies live
  (octave-permissive guided acceptance on exact-pitch evidence, still
  requiring a new piano attack; conservative free play). Cut for now:
  velocity, full-keyboard sampling, offline-model ensemble, big teacher run,
  WebGPU, more DSP patches. Parent time: ~40 min (5 verify failures, 10
  targeted sequences, 15 random natural-practice labeling, 10 acceptance).
- **Audit of the 8 re-strikes the network missed (2026-09-28).** Kong heard
  them; the network's best score for the true key was 0.15-0.72 (bar 0.8):
  A5s just under the bar; D4s split across harmonic/other keys (Kong labels
  most D4 strikes as D4+D5, so training taught the split). Today's loud
  fallback rescues all 8. A key-agnostic score (netAgg 'any': chance any key
  fired) caught ~1 more real note but added 3-8 false ones: the model is
  under-confident on new sessions; fix with better labels (drop Kong's
  ghost harmonics, add verified re-strikes), not decoding. Option kept, off.
- **Exact replay (2026-09-28).** Calibration screen "🔬 Save exact audio":
  each step starts a fresh detector, keeps the exact float32 input
  (<session id>.wav, uploaded; server accepts .wav since piano-app's
  8456933) and puts the live events (sample indices), options, start frame
  and expect() timing in result.capture. `node tools/parity.mjs
  <session.json>` replays it: headless-Chrome test capture reproduced 18/18
  events exactly. Use it to separate "detector" from "replay" differences.
  expect() now takes effect at the start of the next block (recorded).
  The chosen mic is remembered by name (localStorage pianopad.micLabel).
- **2026-09-28 evening.** Parity on the parent's real iPad captures: 10/10
  exact after dropping events the previous detector emitted before the
  capture's fresh one took over (06d7c09). Speech advanced homework on both
  mics because expect() waived the voice check: hotfix bf9cddc (expected is
  only a label now; eval with --expect == without). Before changing expect
  again, add a talking-during-homework regression (the Sep 28 MV88+ Stairs
  session pmulxilykrw11 has it). iPad placement set (usual / towel / off
  the piano): no clear winner; keep the iPad in its usual spot.
- **Whole-session labels (labels-3, started 2026-09-28).** The parent prefers
  labeling ONE whole session in order over scattered snippets ("don't swiss
  cheese"). tools/label/make-session.mjs: every moment any source heard
  becomes a step; clips start just before the previous moment; a "+ unlit
  key press before the yellow light" toggle and "any key presses here?"
  stretch steps catch what nothing detected. First one: Sep 28 "Homework:
  Stairs" on the iPad mic (pmulxnij41ivq, 51 s, 76 steps), served from
  autobox ~/piano-labels (port 8770). eval.mjs scores `"sessions"` dirs: every
  accepted note is right / wrong letter / false / duplicate / unreviewed, and
  unlit presses count as misses. Add labels-3 to eval-v1.json's "sessions"
  once answered; this is the first real recall/false-note rate on her
  playing (dev set: don't tune on it and call it acceptance).
- **Her exercise sessions are never ground truth (parent, 2026-09-28).**
  When the detector misfires in homework she skips ahead to play what the
  app now shows, so after a false advance her notes follow the display, not
  the score. Only the parent's own prompted takes / grown-up runs use the
  song's notes as truth (eval-v1 takes, eval-grownup-0928); her sessions
  are labeled by ear only (labels-1/2/3). replay.mjs's "want" line is a hint,
  not truth. In guided mode a false advance costs more than a miss: it
  changes how she plays. Told pedagogy.
- **Homework policy from piano-app (39662fd, pedagogy request, parent OK).**
  No look-ahead, no ghosts, voice-flagged readings dropped; a grown-up
  two-finger tap covers misses, so the rule is prefer misses to false
  advances: when tuning anything for expected notes, lean conservative.
  Pieces still call engine.expect([target]) per target and expect(null)
  when done. Judge events carry `by: 'detector' | 'grownup'`: grown-up steps
  are candidate missed notes (she may also not have played it), good places
  to point labeling at.
- **Whole-session labels, first result (labels-3, 2026-09-29).** 25 real
  presses, 49 no-key moments, no unlit presses. Before: default 23/25 caught
  with 24 false notes (classic 35). 16 of the 24 were classic onsets firing
  on noise while a note rang, NSDF re-reading that note (C3 read 3 more
  times after one strike). The old toneRise (f0 energy, 21 ms window) can't
  tell D4 from a ringing E4 and misses attacks the onset time precedes.
  Shipped add3403: minJump 10 = harmonics 2-8 trough-to-peak jump (peak
  30 ms before .. jumpMs 20 after the onset) for classic-path notes only
  (below A3, fallback, classic mode). Re-reads jump <= 8, real low notes
  >= 16. Session false 24 -> 9, cal extras 11 -> 5, grown-up 6 -> 3, no
  labeled real note lost; classic mode extras 25 -> 11 (+19 ms latency in
  classic mode only). Not on net notes: her real re-strikes jump 2-9 there.
  Left on the session: 2 misses (net splits D4 across D5/A4, F4), ~8 new
  non-piano tonal sounds at C4-C5 accepted (probably her voice; the drift
  voice filter only runs below C4), 1 duplicate. netAgg 'both' (weak
  any-key onsets, jump-gated) is an option, off: +1 catch, +4 false.
  labels-3 is now a DEV set (tuned on it). Astra round 4 asked
  (scratchpad astra/round4.md).
