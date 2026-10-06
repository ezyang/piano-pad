# piano-app

You own the app: screens, exercises and experiments, UI, visuals and delight,
telemetry, and the log server. You turn `piano-pedagogy`'s requests and the
parent's direction into things she wants to open.

## You own

- Everything under `src/app/` **except** `engine.js` and `screens/calibrate.js`
  (those belong to `piano-audio`)
- `index.html`, `app.css`, `sw.js`, `manifest.json`, icons
- `src/app/telemetry.js`, `tools/logs.mjs`, `server/`
- `test/scoring.mjs`

## Working with others

- Get notes only through `engine.js` (`onNote`, `onRaw`, `simulate`, ...), as
  its header describes. If you need something it doesn't provide (e.g. note
  loudness, note-off), ask `piano-audio`; don't add it yourself.
- The log format is yours, but `piano-audio` and `piano-pedagogy` both read
  the logs. Add fields freely; don't rename or remove any without telling them.
- Requests from `piano-pedagogy` are your main queue, but the parent's
  direction comes first. If you think a request is a bad idea, say so to
  pedagogy.
- You run in `~/Dev/piano-pad` on `main`. Ship per the rules in `CLAUDE.md`.

## Design principles (from watching her use it)

- She's 5, uses the iPad in portrait on the music stand, and taps big targets
  only. Small buttons failed.
- She loves authorship and choice, and resists being told what to do. She
  loves Minecraft-style blocks, the night sky, and the band (Blobby).
- She doesn't explore on her own, but eagerly tries new things a parent
  introduces. So make lots of cheap experiments and toss the ones that fail.
  Experiments live in `src/app/experiments.js` (one screen file and one entry
  each; the grown-ups menu can hide them).
- Her teacher is starting notation this year, so favor scores and notation
  over free-form animation.
- Judge experiments by her usage in the logs (session kinds).

## Current state

(Keep this section up to date. It's what the next instance of you reads.)

As of 2026-10-06:
- **Today's adventure** leads the home screen. It's LINEAR (parent: "choose
  your own adventure is bad, we want to do all the material"), this week's
  homework in a fixed order (since 2026-09-30): Zebra → Train → Ode → party,
  each unlocking the next (`#/adventure/piece/<id>`, `#/adventure/party`).
  Finishing Zebra and Train each gives a "Who joins your band?" pick
  (Froggy / Beep Bot / Buzzy); Ode brings Blobby. The party plays Ode first;
  buttons switch to any piece (the earlier G / Stairs / Up and Down too),
  then free Build! / Copy me. New homework = new PIECES + adventure.js STEPS.
  Pieces (parent: she'd become dependent on prompts, so the app is a bridge
  to the paper book): drawn like her book, pre-staff (`book.js`: letter in
  the head, RH row above LH, whole notes counted "(2 - 3 - 4)") or a real
  staff (staff.js: `sharps` key signature, `repeat` sign = played twice,
  finger numbers above as printed, label rows); `twice` = played twice with
  no sign drawn (Train and Ode since 2026-10-04, parent via pedagogy; logs
  `repeat: true, twice: true`). Staff notes with `hand: 'R'|'L'`
  get the book's stems: RH up + fingers above, LH down + fingers below the
  stem, else stems by pitch (Zebra has hands, 2026-10-04, pedagogy). In
  the letters/first label settings each hand's first note shows its finger
  (by `hand` when the notes have it, else the `setup` entries).
  ✋ only as the set-up banner (one or two hands, first pass only); ⚙︎ "Homework feedback" (st.feedback: note | bar |
  piece) for melody pieces; ⚙︎ "Homework labels" (st.bookLabels: book |
  letters | first); a grown-up TWO-FINGER TAP (→ on a computer) steps it on,
  a TWO-FINGER SWIPE RIGHT (←) steps back (2026-10-04, parent asked): to
  the start of a half-played bar, else one step back at the grain; the
  page is redrawn; logs a `back` event { from, to, by: 'grownup' }.
  The right letter (any octave) advances; no look-ahead, no ghosts, voice
  readings dropped (prefer misses to false advances).
  RHYTHM pieces (`rhythm`; Zebra is also `pitched`) go bar by bar, gated by
  scoring.js `barRhythm` at her own tempo (ta-a ≥ 1.4× ta, ti ≤ 0.8× ta, same
  lengths within 2×), judged as the next bar's first note times the last;
  pitched: a wrong letter fails the bar ('wrong-note'). An off bar → the band
  plays it with the rhythm words lit, she tries again. A missed note passes
  as 'unheard' (next note is the one after it, or `missedNote` timing); the
  last bar one short passes after 3 s ('unheard-end'). Logs (kind
  `homework`): `grain`, `labels`, `rhythm`, `pitched`, `repeat`; judge
  `by: detector | grownup`; `bar` events (`iois` ms, `ok`, `why`,
  `unheard`, `by`); `model` events.
  BETWEEN THE TWO TIMES (2026-10-05, parent via pedagogy: going straight
  into "2nd time" felt harsh): a piece played twice (`repeat`/`twice`)
  pauses after the first time for a small celebration (smaller than the
  end): a gold-framed panel over the page with her
  character cheering, the first of two stars filling (⭐☆), a
  two-note ta-da (`renderYay`), "Yay! One more time!"; 2.6 s
  (`BETWEEN_MS`) or her tap, then the second time. Notes are ignored
  meanwhile (judge `why: 'between'`); a grown-up step skips it, a back
  cancels it (it plays again when the first time ends again). Header
  stars: ☆☆ → ⭐☆ "2nd time" → ⭐⭐ at the end. Rhythm pieces judge the
  first time's last bar like the piece's last bar (no waiting for the
  next note). At the piece grain a grown-up step goes to the end of the
  current time through. Logs a `between` event { pass: 1, of: 2 }.
  The band lives in memory only (`src/app/adventure.js`).
  DRAWING TURNS (2026-10-05, replacing costume time, pedagogy + parent:
  drawing took ~8 of 20 min, she didn't get layers, hated the cape's
  ghost "shadow", and replayed pieces to get another go, which we keep on
  purpose): after each piece's finish (jingle, her cheer) she gets a
  drawing turn in the REAL character editor (`charedit.js`, shared with
  me.js: the whole 10x14 grid, full palette, saves to `pianopad.character`
  after every stroke; no 👑/🧽 wipers in the turn) as an overlay
  (`drawturn.js`) with a big sand timer (`DRAW_MS` 90 s; glows the last
  10 s) and a big ✓ to finish early. When the sand runs out her drawing is
  kept and a green "Time to play! 🎹" shows for 2.2 s, then on (map/pick,
  or Blobby's welcome → party). A grown-up step (→ / two-finger tap, not on
  the board or palette) closes the turn, keeping the drawing. Every finish
  earns a turn, replays too. No costume layers or ghost outlines anywhere:
  her character appears as she drew it. Map: under each piece a 🎨 badge
  (dashed ring = promise; gold ✓ once used, with "🔁 ➜ 🎨" = play again,
  draw again); homework page: her sprite on a grass block BELOW the page
  with "🦓 ➜ 🎨" ("🔁 ➜ 🎨" on a replay); she hops when a bar passes (bar
  grain, rhythm pieces, and at bar ends in the note grain; never per note)
  and cheers at the end. Turn counts are memory-only (`a.turns`).
  Logs (adventure session): step events with `step: 'draw'` (was
  'costume'): start { after, turn }, finish { after, turn, ms, strokes,
  pixels, timeout?: true, by?: 'grownup' }, quit (same fields) if she
  leaves mid-turn; turn = 1, 2, ... per piece; pixels = cells of her
  character changed in the turn. The session carries `drawn: { piece:
  turns }` (was `costume`).
  PARTY PLAY BUTTON (2026-10-05, pedagogy + parent: kids, a 2-year-old
  sibling too, thought nothing happened and mashed it; the room missed the
  sound). The delay was the band's whole-piece render, synchronous on the
  main thread (~2-3 s on a laptop for Ode with 4 members, the piano/bass
  partials in synth.js), so not even the pressed state could paint. Now:
  `band-render.js` renders in a module worker (`band-worker.js`; falls back
  to the main thread) and caches by song+band+sr; the party asks for its
  first piece at Blobby's welcome (`warmParty`) and for the rest one at a
  time on open, so a replay starts its sound in ~30 ms. The button reacts
  on pointerdown (`.pressed`), turns gold 🔊 with a glow, the band glows
  and bounces (sparkles, floating ♪) at once, in time once the sound runs.
  Every tap while playing (▶ and the piece buttons) is IGNORED (no stop,
  no restart; the button pops) until the piece ends and ▶ comes back.
  Party level: renderBand `{ boost: 6 }` dB through a clean look-ahead peak
  limiter (`limit`, -1 dBFS) instead of tanh: Ode band RMS about -14 → -10
  dB. Other renders keep the tanh. Logs (adventure session, step events,
  step 'party'): `play` { piece, by: 'tap' | 'auto' }, `played` { piece, by,
  how: 'end' | 'left', soundMs (tap → sound), ignored (count), taps? [[ms
  after the play, 'play' | piece key]] }.
  Pieces are in `src/app/homework.js` (`PIECES`; `f` = the book's printed finger, `setup` = each hand's start).
  Logs: one `adventure` session (start/finish/quit/pick events), plus a
  `homework` session per piece (`step`, `song.id`), tagged `adventure: <id>`.
  Pieces call `engine.expect([target])`; since audio's bf9cddc it only
  labels readings `expected` (no leniency). Agreed policy with audio: fewer
  false advances, even at the cost of misses; `by: 'grownup'` steps are
  labeling candidates, not proof she played the note.
- MIC HEALTH (2026-10-06, pedagogy, urgent): an evening of homework on
  3c53816 logged exact digital silence (-120 dB = all zeros, from the first
  second; the MediaRecorder copy of the raw track was silent too) with a
  live "iPad Microphone" track and running contexts. No code cause found in
  b328dea..3c53816 (nothing touches the mic; the worker only renders band
  audio). Restarting the app (same version) fixed it: iOS device/session
  state. `src/app/mic-health.js` (imported by main.js) checks every 0.5 s
  while `engine.listening`: dead = track ended, ctx not running, track
  muted, or level exactly -120 for 3 s. Then: resume (suspended ctx, first
  try only), `engine.restartMic()` (new getUserMedia + input node), then
  `engine.reopen()` (new context + detector + mic, like a reload; added to
  engine.js with a header line, tell audio). After 2 failed tries a grey
  grown-up badge top right "🎤✕ not hearing · tap to retry" (a tap =
  reopen, in a gesture); quiet retries continue (15 s, then every 60 s).
  It hides when sound comes back or nobody is listening; never blocks.
  Logs: `mic` events { state: ended|suspended|muted|silent|ok, muted,
  readyState, ctxState, action: detected|resume|reacquire|reopen|none, ok,
  by: auto|tap, n, err? }; session `audio.track` also has muted,
  readyState, ctxState; aborted sessions with mic events are kept;
  `tools/logs.mjs` flags "NO MIC INPUT (-120 dB)" and reads single
  uploaded session files. After a reopen the audio clock restarts (later
  detector times in that session are off) and the session's MediaRecorder
  copy stops at the old stream.
- Build! blueprints (2026-09-29, she'd memorised the six): silhouette only,
  the first block's letter as the one clue, no "next" column, no staff
  letters, no ✋; 🎲 comes first and "🎲 New shape" follows a finished one.
- Hidden for now (files kept, routes still work): her songs, "New song", the
  editor, play and band screens, the ⚙︎ "Add homework song", and the 💾 save
  buttons in Build!/Copy me.
- Experiments: "Build!" (`world.js`: melody contour → building, blueprints)
  and "Copy me!" (`echo.js`: call-and-response, copy/answer modes).
  Copy me GROWN-UP STEP (2026-10-05, pedagogy: the mic missed phrases she
  played and ⏭ dropped her a level): the homework gestures, now shared in
  `grownup.js` (`grownupGestures(el, { step, back })`; adventure.js still
  has its own copy). On her turn a two-finger tap / → counts the round as
  a win exactly like playing it (remaining blocks drop in, 💎, streak,
  level-up, same celebration); ignored during the call and between rounds;
  swipe/← does nothing there. Logs `round { ok: true, level, by:
  'grownup', heard: <notes she'd got> }`. Answer me: a step ends her
  answer now if she's played anything (else ignored), logs `answer-end {
  heard, by: 'grownup' }`.
- Other screens: me, calibrate (audio's).
- ⚙︎ "A grown-up is playing" (pedagogy, parent-approved): sessions carry
  `player: 'kid' | 'grownup' | 'mixed'` (every session from this version
  on; absent = older). In memory only: off on reload or after an hour with
  no taps/notes; a badge shows while on (tap to turn off). `player.js`.
- ⚙︎ detector select → `st.detector` (audio owns the options and labels;
  since 2026-09-29 standard includes audio's learned check, 'unverified'
  is the older standard). Logs carry `settings.detectorOptions`, what the
  detector was actually told. Only the root app passes it; old /v/
  versions always run the default (agreed with audio).
- Testing without the Chrome extension: headless Chrome + a small CDP script
  (Node's WebSocket), fake silent mic, and `__engine.simulate(midi)` (goes
  straight to onNote listeners, bypassing the detector, since 9d268ae).
  Chrome flags: `--headless=new --remote-debugging-port=9333
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-audio-capture=<file.wav>
  --disable-features=AudioServiceOutOfProcess,AudioServiceSandbox`
  (without the last flag headless Chrome on the Mac delivers all-zero mic
  input whatever the file, which mic-health.js now reports as a dead mic;
  use a quiet-noise wav for normal tests, an all-zero one to test the
  badge). Scratchpads don't
  survive sessions, so expect to rewrite the ~20-line runner. Adventure
  progress is in memory: unlock a piece in-page with
  `import('./src/app/adventure.js')` → `current().done.add('zebra')`, then
  set `location.hash` (a reload loses it). Grown-up step/back:
  dispatch keydown ArrowRight/ArrowLeft.
- Version permalinks (2026-09-26): every commit is served at `/v/<sha>/`,
  `/v/<date>/`, list at `/v/`; the ⚙︎ menu shows the version and links there.
  The parent may deliberately send her back to an old version (removing
  features to get her out of a rut), so check `app.version`/`app.path` in
  logs before assuming what she saw.
- Storage is disposable (parent's direction, 2026-09-26): no migrations,
  bump the key and start fresh when the shape changes, and prefer features
  that don't need persistence. Existing persistent bits (song library,
  settings) are grandfathered, not a pattern to extend.
- Except her character, which the parent says is special (2026-09-27): own
  key `pianopad.character`, kept across versions/clean slates/"Reset all
  data", mirrored into the blob for old versions. The editor (`me.js`)
  saves after every stroke and on leaving; wipes (👑, 🧽) take two taps.
