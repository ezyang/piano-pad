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

As of 2026-09-30:
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
  finger numbers above as printed, label rows); ✋ only as the set-up banner
  (one or two hands); ⚙︎ "Homework feedback" (st.feedback: note | bar |
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
