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

As of 2026-09-28:
- **Today's adventure** leads the home screen. Since 2026-09-27 it's LINEAR
  (parent: "choose your own adventure is bad, we want to do all the
  material"): G song → Stairs → Up and Down → party, each unlocking the next
  (`#/adventure/piece/<g|stairs|updown>`, `#/adventure/party`). Finishing
  the G song and Stairs each gives a "Who joins your band?" pick (Froggy /
  Beep Bot / Buzzy, she missed Buzzy); Up and Down brings Blobby. The party
  plays Up and Down (piece buttons switch), then free Build! / Copy me.
  Pieces (2026-09-28, parent: she'd become dependent on the prompts, "press
  the lit finger", so the app is now a bridge to the paper book): drawn like
  her book (`book.js`: pre-staff, letter in the head, RH row above LH,
  finger numbers only where printed; the G song on a treble staff via
  staff.js letters:'book'); ✋ only as each hand's set-up ("thumb on C"),
  then hidden; ⚙︎ "Homework feedback" (st.feedback: note | bar | piece); a
  grown-up TWO-FINGER TAP (→ on a computer) steps one note/bar/piece. The
  right letter (any octave) advances; no look-ahead, no ghosts, voice
  readings dropped (prefer misses to false advances). Logs: session `grain`,
  judge `by: detector | grownup`, `bar` events. The G song is played back
  in rhythm after (skippable).
  ⚙︎ "Homework labels" (st.bookLabels: book | letters | first; book.js):
  scaffolding comes off; 'first' = only each hand's first note labelled.
  The G song is a RHYTHM piece (2026-09-29, her rhythm was "hopeless"):
  bar by bar, gated by scoring.js `barRhythm` (her own tempo; ta-a ≥ 1.4×
  ta, ti ≤ 0.8× ta, same lengths within 2×; a bar is judged when the next
  bar's first note times its last); Piano Safari words under the notes;
  an off bar → the band plays it with the words lit, she tries again. Logs:
  `bar` events with `iois` (ms), `ok`, `why`, `by`; `model` events.
- Build! blueprints (2026-09-29, she'd memorised the six): silhouette only,
  the first block's letter as the one clue, no "next" column, no staff
  letters, no ✋; 🎲 comes first and "🎲 New shape" follows a finished one.
  The band lives in memory only (`src/app/adventure.js`).
  Pieces are in `src/app/homework.js` (`PIECES`; `f` = the book's printed finger, `setup` = each hand's start).
  Logs: one `adventure` session (start/finish/quit/pick events), plus a
  `homework` session per piece (`step`, `song.id`), tagged `adventure: <id>`.
  Pieces call `engine.expect([target])`; since audio's bf9cddc it only
  labels readings `expected` (no leniency). Agreed policy with audio: fewer
  false advances, even at the cost of misses; `by: 'grownup'` steps are
  labeling candidates, not proof she played the note.
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
- ⚙︎ detector select → `st.detector`: simple (standard = audio's onset
  network with a loud-classic fallback, chosen on the parent's labels,
  2026-09-27), classic (the fallback if it misbehaves), overlap, profile
  ('net' is an alias of simple). Only the root app passes it; old /v/
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
