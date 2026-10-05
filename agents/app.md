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

As of 2026-10-05:
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
  The band lives in memory only (`src/app/adventure.js`).
  COSTUME TIME (2026-10-05, pedagogy + parent: the drawing she loves as the
  reward for homework, `src/app/costume.js`): after each piece's finish
  (jingle, her cheer) an overlay lets her draw one costume part in the
  editor's style: 🦓 → hat 🎩, 🚂 → something to hold 🎈, 🎶 → cape 🦸
  (`PART_OF`). One layer per part on an 18x20 outfit canvas (her 10x14
  character at 3,4), painted only in the part's zone; the cape goes BEHIND
  her (her pixels can't be painted). Big ✓ → on (map/pick, or Blobby's
  welcome → party). Then she wears it on the map lineup, the homework page,
  the party and the home card (`outfitImg`: cropped, centred, CSS `scale`
  keeps her pixels the size of the plain sprite). The promise up front
  (parent): a dashed slot under each map stop (ghost outline, gold-framed
  with her drawing once done), and unearned parts as faint ghost outlines
  on her sprite (map lineup, homework page). Homework page: her sprite on
  a grass block BELOW the page with "🦓 ➜ [slot]"; she hops when a bar
  passes (bar grain, rhythm pieces, and at bar ends in the note grain;
  never per note, never on the staff; nothing in the piece grain) and
  cheers at the end. Costumes are memory-only in the adventure
  (`a.costume`), like the band; `pianopad.character` is never written.
  Logs (adventure session): step events with `step: 'costume'`: start
  { part, after }, finish { part, after, ms, pixels, strokes, before? }
  (before = pixels already there on a replayed piece), quit (same fields)
  if she leaves mid-drawing; the session also carries `costume: { part:
  pixels }`.
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
- Build! blueprints (2026-09-29, she'd memorised the six): silhouette only,
  the first block's letter as the one clue, no "next" column, no staff
  letters, no ✋; 🎲 comes first and "🎲 New shape" follows a finished one.
- Hidden for now (files kept, routes still work): her songs, "New song", the
  editor, play and band screens, the ⚙︎ "Add homework song", and the 💾 save
  buttons in Build!/Copy me.
- Experiments: "Build!" (`world.js`: melody contour → building, blueprints)
  and "Copy me!" (`echo.js`: call-and-response, copy/answer modes).
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
  --use-file-for-fake-audio-capture=<silent.wav>`. Scratchpads don't
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
