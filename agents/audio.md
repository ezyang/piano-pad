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
- **Astra round 4 (2026-09-29, design-review-2026-09-28.md).** Main course
  change: stop letting each onset source emit notes on its own. All sources
  propose candidates (permissively, incl. low net peaks); one learned
  verifier decides "new piano strike, and is the proposed pitch supported by
  it" (small causal temporal CNN, ~250-400 ms history, spectral change +
  pitch-relative harmonic trajectories, 50-80 ms post-attack; verified false
  events as hard negatives, Kong as weak labels). Keep NSDF for pitch. Train
  a real strike head (not 1-prod(1-p)). Don't blanket-drop Kong's octave
  labels: audit D4/F4 and similar cases first. Voice: confirm what the
  sounds are; timbre/temporal features, not another pitch rule; train speech
  over ringing piano. Next labeling: one UNTOUCHED slow homework session
  (low+high, repeated letters, different day, picked before looking at
  outputs), labeled by listening first; freeze it as acceptance. Score
  acoustic events and homework false advances separately. The jump gate is
  provisional (10 dB is not physical); doubleMs 100 shipped for the
  near-duplicate it let through. PCM parity (Astra's #1) is already done.
- **Grown-up homework runs 2026-09-29 (app e9e5986, eval-grownup-0929).**
  Replay 70/70 right, 2 extras: G4 read over a ringing G3 from a network
  onset (net key G#3, NSDF G4, jump ~0; Kong: nothing). Live, one D3 read as
  D#3 (f0 155.6) that replay reads as D3 (Kong: D3): live onset ~18 ms
  earlier, likely on action noise; pitch read before the string settled.
  Real G3 at 8.51 s in Stairs: classic fired 50 ms early (jump window
  missed the attack) while the net fired on it with the right key but is
  barred below A3. Tried and reverted (not clean wins): jump-gating net
  notes whose key != pitch (-3 real of 140 grown-up notes), letting jump-
  verified net notes below A3 through (+2-3 extras). Stop patching; build
  Astra's verifier. labels-3what (served on 8770): the parent says what
  made the non-piano sounds in the Stairs session.
- **The non-piano false notes are voices (parent, 2026-09-29, labels-3what).**
  Stairs session: 3-11 s her voice; 28-29 s indistinct background talking;
  32-36 s her voice + an adult; 43-47 s an adult voice. So the net path
  (C4-C5) accepts speech from her AND adults, incl. background talk: the
  drift voice filter only runs below C4. Training data for the verifier:
  talk / talk-kid / talk-and-play calibration takes, messy m-talk-near,
  voice-flagged events in her sessions; include speech over ringing piano.
  (Page lesson: mark the real notes as landmarks and ask about one flash
  at a time; the parent couldn't tell which interval was meant.)
- **The verifier (branch `verifier`, NOT deployed; parent: "not deploy
  yet", 2026-09-29).** Astra's "one acceptance decision": a small learned
  gate on every candidate note (tools/verifier/README.md). Parent confirmed
  the remaining non-piano false notes were voices (hers, adults', background).
  Held-out (session folds), 3-seed ensemble, vPostMs 15, thr 0.5, gate only:
  Stairs session 23/25 caught, false 9 -> 0; cal takes extra 5 -> 2; labeled
  disputed moments wrongly accepted 7 -> 1, real caught 22 -> 21; grown-up
  Sep 28 extra 3 -> 2; Sep 29 3 false G4s removed (its 2 "misses" are real
  G3s the detector already missed, hidden by letter-matching false G4s).
  Latency: net notes 27 -> 37 ms median (90% unchanged), low unchanged; CPU
  +0-10%. vPostMs 30/60 not better; letting it rescue rejected candidates
  or adding permissive proposals made things worse; it must not overrule the
  voice flag (it did at first: +3 false). Final model trained on all data:
  ~/Dev/piano-audio-data/verifier/final-post15-ens.json (643 KB JSON;
  quantize before shipping). To deploy: profile.verifier + vPostMs 15,
  heads-up to piano-app (latency), parent OK, then check on the untouched
  acceptance session. Still open: D4/F4 misses need a retrained onset net.
- **Verified detector deployed as opt-in (c935e74, 2026-09-29).** Grown-ups
  menu 'verified' -> engine useVerifier; profile.verifier (int8, 98 KB);
  older engines never turn it on. ~0.8 ms per candidate note.
- **Label audit (verifier/oof.jsonl, train.py --oof 5).** Out-of-fold, the
  model strongly contradicts none of the parent's labels (the 3 flags were
  my 60 ms tolerance edges or model errors). Kong: 143 of 12.7k strongly
  contradicted; 98.5% of model-sure strikes agree with Kong's letter; a
  repeated pattern around A4: detector G#4 vs Kong A4 (13), detector A4 vs
  Kong A#4 (17). tools/tuning.mjs: A4/A#4 read -42/-51 cents at the attack
  on Sep 28-29 (iPad mic) vs -9/-18 on Sep 26-27. The parent's c024 (A#4,
  classic read A4) supports Kong. labels-4 (port 8772): 16 which-note clips
  to settle it before touching the tuning table.
- **Sep 29 evening (her Homework G / Stairs / Up and Down, standard
  detector).** G is notated G5; she tried G5 4x (Kong vel 43-68): none heard
  as G5 (net's G5 score ~0.1); her 14 G4s all caught. Grown-ups have played
  it as G4 (cal, Sep 29) and G5 (Sep 28). tools/repeat-report.mjs (vs Kong):
  Stairs + Up and Down soft (vel<50) 36/86 std vs 30/86 verified, medium
  30/34 vs 29/34, false 5.4/min vs 0.9/min; onset timing 90% within 5-11 ms,
  IOI error 90% 4-16 ms (worst 61 std, 17 verified). Told pedagogy (asked
  for soft recall vs false, repeated-note recall/timing) and piano-app
  (rhythm gate on the G piece). UNTOUCHED ACCEPTANCE SETS (never train or
  tune on them): labels-6 = her Stairs Sep 29 (port 8770), labels-5 = her G
  Sep 29 (8771). Next: G5 (targeted takes + retrain the onset net).
- **Soft notes = the main detection goal (pedagogy, 2026-09-29): 86 of her
  120 strikes today were soft (Kong vel < 50). G5 is behind it (the G
  piece moves to G4).** Where lone soft strikes (Kong 35-54, her earlier
  sessions) go: 52% caught, 14% 'double' (an earlier same-pitch trigger
  within 100 ms, likely early timing), 18% no candidate, 10% misread, 4%
  voice flag. "New energy" harmonic-sum pitch was worse than NSDF (drop it).
  Her 20 fold-B sessions, Kong-graded (soft/medium/loud caught of
  375/285/263; false per min): standard 102/224/211, 3.8; verified
  91/222/211, 0.6; verified + netThr 0.6: 99/225/216, 1.0; verified +
  netThr 0.4: 103/229/221, 1.8.
  PRE-REGISTERED for the acceptance sets (labels-5/6, her Sep 29 G and
  Stairs; decide on them once, don't iterate): A = standard, B = verified,
  C = verified + netThr 0.6. Report soft recall and false notes separately
  (pedagogy asked). If B or C wins: ask the parent before making it the
  homework default (pedagogy wants it), coordinate with piano-app, send
  pedagogy the sha.
- **piano-app e863f52 (2026-09-29):** the G piece is written at G4; any G
  from G3 to G5 counts. Missed onsets don't fail a rhythm bar when "one note
  unheard" makes the beat steady: the `bar` event gets why: 'unheard',
  unheard: k, with iois (ms) logged. Bars marked 'unheard' (and
  'unheard-end') point at missed notes, soft ones especially: use them to
  find soft-note misses to label.
- **"A bit stronger!" cue (pedagogy idea, 2026-09-29).** Parent: her misses
  are touch (a louder re-strike always registers). Traces, on her 20 fold-B
  sessions (Kong-graded, provisional): of 120 missed lone soft strikes, 52%
  leave a right-letter trace (41 are weak any-key net onsets, which exist
  only with netAgg 'both'; 10 voice-flagged; 6 'high'). Rejected candidates
  with nothing accepted nearby are real strikes of that letter 62% of the
  time at vp >= 0.3, 10% at 0.1-0.3, 2% below. Told pedagogy: decide after
  the parent-labeled acceptance sets; if needed, give piano-app a rule on
  onRaw events (expected letter + vp band), no contract change.
- **ACCEPTANCE RESULT, labels-6 (her Stairs Sep 29, parent-labeled, 2026-09-29).**
  47 presses / 43 no-key moments. A standard: 32 caught, 2 wrong, 13 missed,
  18 false. B verified: 32/2/13, 3 false. C verified + netThr 0.6: 32/2/13,
  4 false. -> B wins (pre-registered). Soft (Kong vel < 50) 9/24 caught,
  medium 18/23. Misses: 'high' classic readings of quiet notes with vp
  0.69-0.98 (4 soft D4s, a G5), weak any-key onsets with vp 0.76-0.997 (7),
  misreads (4), voice (1), low clarity (1). labels-6 is now DEV (I looked at
  the misses). Next: config D = verified + let the verifier decide 'high'
  and weak onsets; tune on dev/folds, test ONCE on labels-5 (her G, still
  untouched). Asked the parent to OK verified as the homework default.
- **Verified is the DEFAULT (17fac1b, 2026-09-29, parent: "happy to test").**
  engine: useVerifier for 'simple'/unset/'net'/'verified'; 'unverified' =
  the old standard (grown-ups menu). Told piano-app (before) and pedagogy
  (sha). Watch the next sessions' logs (vp, reject: 'verifier') for trouble.
  Sessions log settings.detectorOptions (scalar fields of detectorOptions(),
  piano-app 7de91f7): useVerifier tells which detector ran.
  Labeling guidance given to the parent: "Two keys" = distinct keys together
  (a real press, any of its notes counts); "Splat" = clump/banging/can't tell
  (not scored); when unsure, Splat.
- **Labeling lesson (parent, 2026-09-29):** session clips had too long a
  lead-in and ran into the next note. make-session now: <= 0.7 s lead-in,
  end just before the next light (0.3-0.8 s tail), '+' = unlit press
  anywhere in the clip. labels-5b = her G piece in the new layout (port
  8771; answers carried from labels-5 by moment time; still UNTOUCHED as an
  acceptance set: don't look at its misses before the config-D test).
- **ACCEPTANCE RESULT 2, labels-5b (her G piece Sep 29, parent-labeled).**
  21 presses (18 + 1 two-keys + 2 unlit), 66 no-key moments (fooling
  around), 1 splat. A standard 16/21 caught (2 missed with nothing
  detected), 10 false; B verified 16/21, 3 false; C 16/21, 4 false. Soft
  1/4, medium 14/14, loud 1/1 (same A/B). Both sets: 48/68 caught either
  way, false 28 -> 6; soft 10/28 (36%), medium 32/37 (86%).
  labels-5b is still untouched at the miss level (only totals looked at):
  keep it for the ONE test of config D (verifier decides 'high' + weak
  onsets), developed on dev (labels-6, folds). Eval specs:
  ~/Dev/piano-audio-data/eval-accept-0929.json (Stairs, now dev) and
  eval-accept-0929g.json (G).
- **Config D, chosen on DEV before its test (2026-09-29):** verified +
  dspFallbackMinDb -60 (quiet classic readings above A3 go through the
  fallback path: wait 100 ms for the net, dup check, then the verifier).
  Dev: Stairs Sep 29 caught 32 -> 36/47, false 3 -> 3; fold-held-out sets
  unchanged. Rejected on dev: rescuing 'high' directly (-2 right on cal
  takes, +4 extras across sets); -70 dB (+1 caught, +1 false on Sep 28
  Stairs); weak any-key onsets (little gain). Test ONCE on labels-5b.
  RESULT: D on labels-5b identical to B (16/21, 3 false). Not shipped (no
  evidence it generalizes). Both new acceptance sets are now used. Parent:
  "if we are hill climbing, consider collaborating with Astra" -> round 5
  asked (scratchpad astra/round5.md): soft-note strategy, parent-time use,
  how to decide ~5-note changes.
- **A4/A#4 which-note (labels-4, parent by ear):** 11/11 clear cases sided
  with Kong (detector a semitone low: G#4 for A4 x5, A4 for A#4 x6); 3 two
  keys, 1 hard, 1 no. Tuning table tests (Kong as reference) are mixed
  (+7 A#4 on Sep 29, -3..-11 A4 on Sep 26). Parent: "this may be a labeling
  problem": ear/Kong judge pitch, the app needs the KEY; if the A4 string is
  sharp, all three would call an A4 key "A#4". Added calibration set 'Key
  check' (known keys G#4 A4 A#4 B4, soft A/A#, walk): decide tuning on it.
- **Astra round 5 (design-review file):** timing/arbitration first (the 14%
  'double': early trigger stealing the strike? -> a pending-event stage
  that lets nearby proposals update one event before commit); then retrain
  the onset net for PROPOSAL recall at a bounded candidates/s (oversample
  verified soft attacks; measure before pitch/voice/dedup/verifier); child's
  natural soft playing over parent imitation; paired event accounting per
  change (newly caught / lost / new false / removed false / false
  advancements / delay), decision rule fixed before the test; next
  acceptance = pre-selected fixed-length excerpts across several days, fully
  labeled. Verifier: treat label provenance as uncertainty, add alignment
  jitter, audit running-peak normalization; keep 15 ms. Parent: Astra may
  also write code (own worktree/branch; I review and test before merge).
- **Soft-loss breakdown under the VERIFIED default (her sessions except the
  acceptance ones, Kong 35-54 lone strikes, n=765):** caught 65%, nothing
  proposed 15%, misread 9%, voice flag 4%, 'high' 3%, verifier 2%. The 14%
  'double' seen earlier was the permissive dump config; under the default,
  'double' losses are ~3 in 60 sessions, caused by a voice-flagged or
  low-clarity same-pitch note setting lastNote (the engine ignores those
  notes; small fix: only engine-accepted notes should count for 'double').
- **Astra is coding (2026-09-29):** worktree ~/Dev/piano-pad-astra, branch
  astra-onset: retrain the onset net for proposal recall at bounded
  candidates/s (spec: scratchpad astra/task-onset.md; outputs in
  ~/Dev/piano-audio-data/astra/, report onset-report.md). I review + run the
  end-to-end eval before anything ships; labels-5b stays held out.
- **Astra's retrained onset net (branch astra-onset e8074a0/cb3e8a2; nets in
  ~/Dev/piano-audio-data/astra/soft-{A,B,all}.json; report onset-report.md).**
  Raw proposal recall (before pitch/voice/dedup/verifier) up a lot: right
  letter at 0.8, dev Stairs 22 -> 36/46, fold B 39% -> 60%, ~1.5-2.3
  proposals/s. END TO END (fold-held-out nets + verifiers) the gain mostly
  vanishes: Stairs dev 32 -> 34 caught (+2 wrong, +1 false) at 0.8, 33 at
  0.9; fold sets +-1 note, cal takes +3 extras at 0.8. The downstream stages
  (NSDF pitch, low routing, dedup, a verifier trained on old-net candidates)
  lose the new proposals. Next: integration diagnosis (task 2 for Astra).
  tools: --net <file> in profile.mjs/eval.mjs.
- **Astra task 2, integration (astra/integration-report.md): no config met
  the pre-set rule.** Best: soft nets @0.9 + netPitchDelayMs 10 (read the
  net's pitch 10 ms later): dev 32/2/3 -> 34/0/3 caught/wrong/false, but cal
  takes 73 -> 72 and grown-up Sep 28 67 -> 66. Where new proposals die: NSDF
  pitch/clarity at net onsets; a verifier trained on OLD-net candidates
  (accepts some wrong readings, rejects some right ones); low routing;
  voice. acceptedStateOnly ('double' from engine-accepted notes only) and
  verifierRescue low changed nothing. Experiment left uncommitted in
  ~/Dev/piano-pad-astra (patch in astra/). Next (task 3): retrain the
  verifier on new-net candidates, folds proper, same rule.
- **Astra task 3 (verifier retrained on soft-net candidates): FAILS the
  rule.** Codex session died before its report; I read the finished runs
  (astra/{dev,A}-v*.txt; verifier-{A,B,dev} ensembles in astra/). Dev Stairs
  (current 32/2/3): vsoft8 35/3/3, vsoft9 34/3/2, vdelay8 34/2/3, vdelay9
  34/1/2. But fold A Stairs Sep 28 (current 23/0/0): vsoft8 23/1/3, vsoft9
  24/0/3, vdelay9 24/1/3 -> +3 false everywhere. Fold B runs incomplete
  (moot). Conclusion: the soft-net line doesn't pass yet; the bottleneck is
  verified soft-note data on HER playing (54 verified soft positives total).
  Park it; next soft-note step needs more parent-verified soft strikes.
- **labels-7 (port 8773): 5 excerpts of her playing, 20 s each, drawn by a
  seeded random draw (at least 4 Kong notes in the window) BEFORE looking at
  outputs:** e1 Sep 26 practice pmuik88gh0vda 10.3-30.3; e2 Sep 27
  homework pmujyilg65kdg 71.8-91.8; e3 Sep 27 build pmujxouffdcsn 23.8-43.8;
  e4 Sep 29 build pmun7yim96p2k 10.2-30.2; e5 Sep 29 homework pmulxov0tm5f2
  27.7-47.7. PRE-ASSIGNED: e2, e4 = TEST (their sessions never trained on);
  e1, e3, e5 = training. 223 steps, test excerpts first.
  ~/Dev/piano-audio-data/heldout.txt lists recordings train.py never uses
  (G acceptance, Stairs dev, test excerpts). eval.mjs and train.py handle
  excerpt sets (steps with `win`; only finished excerpts count).
- **Astra task 4 (expected-note + verifier; soft-strike augmentation),
  spec scratchpad astra/task-4.md.** Codex hit its usage limit; a detached
  script (~/Dev/piano-audio-data/astra/run-task4.sh) starts it at 02:00 EDT
  Sep 30. Result: astra/task4-report.md (5-line summary on top). Parent is
  low on Claude usage: lean on Astra, keep my part to review + relay.
- **Oct 3: Astra task 4 = no** (expected-note assistance: no dev catches;
  augmentation: ties dev, +2 fold-A false). astra/task4-report.md.
- **LIVE-ONLY SEMITONE ERRORS (Oct 1 Zebra homework):** firm G4s read live
  as G#4 (f0 411-416 Hz, net and dsp agree) 5x, mostly the first strikes
  after a pause; replay of the recording reads G4 (Kong G4 v66-75). Across
  sessions, firm lone notes read +-1 semitone live: Sep 26 0.2%, Sep 27 2%,
  Sep 29 4%, Oct 1 4% (replay doesn't show it; cf. Sep 29 grown-up D3->D#3).
  Live-vs-recording time offsets also wander (unclear; noisy matching).
  Suspect the live input path (iOS audio session/route changes when the app
  plays sounds?). Asked piano-app. Decisive test: parent's Key check WITH
  "Save exact audio" (exact live PCM vs the AAC recording on known keys).
  Most of Zebra's 62 'other' judgments were her playing other notes or
  mashing; the G#4 misreads were real detector errors on the right note.
- **Oct 3 fixes for the live-only errors (deployed):** 6e08a73 heavyPerBlock
  1 (voice drift, attack jump, each verifier ensemble member: one per hop,
  cached on the job): Oct 1 replay max block 5.5 -> 2.2 ms, 0 blocks over
  2.67 ms, +6 ms median latency, identical eval results. 470a705 engine:
  takeLevelStats() leaked a new 1 s watchdog setInterval on EVERY call (one
  per second of logged practice, for the app's lifetime); fixed. Level
  events now log `lag` (audio clock behind wall clock since context start,
  ms; should stay flat) and `skips` (render quanta skipped). CHECK the next
  sessions' level events: growing lag / skips > 0 would confirm lost input;
  then also re-check the live-vs-Kong semitone error rate (was 2-4%).
  piano-app: model() playback is not the cause (most sharp readings come
  long after a model).
- **Oct 4 LH check (Train + Ode homework, parent: "missed a lot of lower LH
  notes").** Kong vs live, her firm LH strikes (vel >= 40): Train 13/16, Ode
  22/27. Of the 8 misses, 5 were heard at the RIGHT pitch (vp 0.5-0.99) but
  flagged `voice` and ignored by the judge (E3/F3/G3/D3 sit in the adult-voice
  band), 3 rejected (low/verifier). Low notes in Zebra were mashing (B2+C3+B3
  clusters at 71-78 s), and the early vel 20-30 "A2/A#2" in Ode are probably
  speech. Candidate fix: let a strong verifier score (or an expected note in
  guided play) override the voice flag; must re-check labels-3what voices
  first. Health: Zebra #1 lag drifted 493 -> 1421 ms (~6 ms/s, steady) with
  no skips logged; Train/Ode lag flat, skips 1 (startup).
