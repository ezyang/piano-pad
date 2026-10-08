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

As of 2026-10-08 (bunny house before Zebra; Copy me grown-up step = one note; mic switch):
- **Today's adventure** leads the home screen. It's LINEAR (parent: "choose
  your own adventure is bad, we want to do all the material"), this week's
  homework in a fixed order (since 2026-10-07): Zebra → Sea → Ode → party
  (2026-09-30..10-07 it was Zebra → Train → Ode; Train is now with the
  earlier homework, in the party's buttons),
  each unlocking the next (`#/adventure/piece/<id>`, `#/adventure/party`).
  Finishing Zebra and Sea each gives a "Who joins your band?" pick
  (Froggy / Beep Bot / Buzzy); Ode brings the SURPRISE GUEST (below). The
  party plays Ode first;
  buttons switch to any piece (the earlier Train / G / Stairs / Up and Down too),
  then free Build! / Copy me. New homework = new PIECES + adventure.js STEPS.
  Pieces (parent: she'd become dependent on prompts, so the app is a bridge
  to the paper book): drawn like her book, pre-staff (`book.js`: letter in
  the head, RH row above LH, whole notes counted "(2 - 3 - 4)") or a real
  staff (staff.js: `sharps` key signature, `repeat` sign = played twice,
  finger numbers above as printed, label rows); `twice` = played twice with
  no sign drawn (Train and Ode since 2026-10-04, Sea 2026-10-07; logs
  `repeat: true, twice: true`).
  BUNNY HOUSE (2026-10-08, pedagogy: the teacher's Zebra goal this week
  is hand shape, a "tall round bunny house": curved fingers, high
  knuckle, room underneath). A reminder ritual, never a check: pieces
  with `bunny: true` (only Zebra) open with `bunny.js` over the page
  BEFORE the mic/session starts: "Make a bunny house!", a pixel scene
  (pixels.js `bunnyHouseUrl`: side view of an arched hand, two
  fingertips on the keys, high knuckle; `bunnyUrl` bunny waiting on the
  keys beside it; positions in `BUNNY_HOUSE`) and a big ✓. Any tap on
  the panel → the bunny hops under the hand (CSS `bunny-hop`),
  `renderBunnyHop` (two boings + bell sparkle), sparkles, and after
  1.5 s the piece's normal begin(). No timer, no failure. Shown every
  time the Zebra page opens (leave and come back = again; replays too).
  A grown-up step skips it at once. Logs (adventure session step
  events, adventure.js `bunny()`): start { step: 'bunny', before }, finish
  { before, ms (shown → tap), by?: 'grownup' }, or quit { before, ms }
  if she leaves first. Drop `bunny` from Zebra when the goal moves on.
  SEA (2026-10-07, pedagogy): pre-staff, LH line then RH line, NOT C
  position: left THUMB on C3 walking down (C3=1 B2=2 A2=3 G2=4 F2=5), right
  thumb on middle C. Pieces may carry `position: { R: {midi: f}, L: {...} }`
  (default `C_POSITION` in labels.js); `fingerFor/handFor(m, pos)`,
  `labelFor(..., pos)`, staff.js (song.position), book.js (fingers not
  printed, first-note fingers) and play.js's ✋ all use it. book.js hangs
  notes below a hand's C under its row (`dip`). New ⚙︎ Homework labels
  option 'fingers': letters + every note's finger (pre-staff; a staff page
  treats it as 'book'). NO LYRICS: pedagogy asked for the book's words under
  the notes; not added (repo rule: no book titles or lyrics in this public
  repo), sent back to pedagogy/parent. Detection of F2–B2: no hard limit in
  the app (outOfRange is ±12 around the piece); the detector sends notes
  below A3 (lowDspBelow 57) through the dsp path (minF0 60 Hz; the first
  1024-sample pitch window can't see F2's 87 Hz, the 2048 one can); the
  onset net's keys start at A2 (45), so F2/G2 have no key of their own
  (lowNetMin is 0, so that gate is off). Synthetic F2..C3 lines: 100%
  recall, one F2→E2 at far mic. No real recordings of her piano that low
  yet: watch the logs. Staff notes with `hand: 'R'|'L'`
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
  SURPRISE GUEST (2026-10-06, pedagogy: she asked "why is it always
  Blobby at the end?"). The headliner is drawn per adventure from
  adventure.js `GUESTS` = slime (Blobby, chip), cat (Kitty, `meow`: sung,
  slides up into each note), dragon (Sparky, `horn`: toy trumpet), penguin
  (Waddles, `xylo`), never the last one she met (`pianopad.lastGuest`,
  set when the guest joins; losing it is fine). Sprites/names/`hi` lines
  in pixels.js `GUESTS` (kept out of `BAND` so the hidden band/play screens
  and Copy me's dancers don't change; look members up with `bandMember`).
  The three voices are in instruments.js (`guestNote`, GAIN matched to
  about the others' solo level). Map: the 4th slot is a bobbing ⭐ box (no
  silhouette) until it joins. Reveal (`welcome` in screens/adventure.js,
  after Ode's jewel turn, or on the map if she left early): "Who's
  coming?" over a wiggling ⭐ with a drum roll (`renderDrumroll`), at 1.8 s
  (or her tap) the guest pops in, "<Name> is here!" + its hello line, a
  ta-da and C-E-G-C on its own instrument, then 🎉 Party!. Logs: adventure
  session `guest`, `open { guest }`, and the Ode `finish` that brings it
  has `joined: <id>`; logs.mjs shows "guest <id> (came)".
  JEWELS IN PAIRS (2026-10-06, pedagogy + parent). After each homework
  piece's finish (jingle, her cheer), a JEWEL TURN (`jewels.js`, overlay
  on the page, ~10 s) gives TWO gems of the piece's kind (`PAIR = 2`;
  parent: three single gems couldn't go symmetrically on her 10-wide
  grid, and symmetry matters to her; nothing is auto-mirrored, she
  chooses). Her character big on its grid, the two gems waiting at the top
  (the next one bobs, placed ones dim); she taps a cell, the first pops in
  with sparkles, then taps again for the second. Tapping one of the new
  gems picks it up (gold pulsing outline), the next empty cell she taps
  moves it there; with both placed, tapping an empty cell moves the last
  one placed. REMOVING OLDER GEMS (2026-10-07, pedagogy: she asked to
  delete gems, had replayed a piece to fix one): tapping a jewel from an
  earlier turn poofs it off (`.gem-poof` float + grey sparkle), the cell
  is its plain character pixel again and free for a new gem. Undo: the
  freed cell keeps a dashed outline in the old gem's colour (`.gem-ghost`)
  until her next tap elsewhere; tapping it then brings the same gem back.
  Only once per cell per turn (remove → back → remove → the next tap puts
  a new gem there), so she can't loop. Removals are optional, don't count
  toward the pair, and are saved with the placements (at ✓/quit). Big ✓ (dim
  and shakes the waiting gem until both are placed), or a grown-up step
  (places any unplaced ones on random free cells of her). Every finish
  earns a pair, replays too (the replay loop is wanted). New gems are
  final once the turn ends (no undo of a finished turn; she can remove
  them on a later turn).
  GEMS (2026-10-06, parent: block
  colours read as planks/stone, not jewels): each piece earns a real gem,
  `gem:` on the piece in homework.js: Zebra gold, Train ruby, Ode diamond,
  Sea sapphire;
  a piece without one gets GEM_NAMES[its index in PIECES % 6] (gold, ruby,
  diamond, emerald, amethyst, sapphire), `pieceGem` in pixels.js. GEMS
  holds 5 tones per gem (table c, facets l top / s left / m right / d
  bottom+rim). Every jewel shines: in the CSS (`.gem`: conic-gradient
  facets + centre table + white fleck, a sweeping shine and a twinkle) and
  on her sprite: with jewels,
  `characterUrl(grid, jewels)` returns an animated SVG (crisp rects, the
  same facets, SMIL shimmer + glint; plays inside <img>), so the jewels show everywhere she
  appears (map lineup, homework buddy, party, home, Build, Copy me, Me).
  Use `meUrl()` from store.js for her image. Storage: `pianopad.jewels` =
  [{ i: cell, m: gem name }], treated like the character (own key,
  kept across clean slates and "Reset all data", mirrored into the blob
  as `jewels`). Saves from 9041ed3 hold Build block names: kept as saved
  and drawn as gems via `gemName` (planks → ruby, stone → diamond, grass →
  emerald, brick → ruby, unknown → gold); any string `m` is valid. Painting a jewel's cell in charedit (Me, any colour or
  the eraser) removes that jewel; the Me screen's 👑/🧽
  wipes keep jewels.
  NO DRAWING TURN in the adventure any more (2026-10-06, parent: the one
  before the party felt unnecessary): `drawturn.js` is gone, the guest's
  welcome says "🎉 Party!" and the party autoplays at once. Drawing is the
  Me screen (`me.js` + `charedit.js`). Older logs have `step: 'draw'`
  (7754c61..01cd9d0 after every piece, 9041ed3..fc9c0ab once before the
  party) and `drawn` in the session.
  Map: under each piece a jewel badge in its colour with the PAIR (dashed
  ring until earned this adventure, then the shining pair, ×n = turns
  earned, "🔁 ➜ 💎💎"). Stops 19vw again. Homework page: "🦓 ➜ [💎💎]"
  under the page beside her ("🔁 ➜" on a replay), ring goes solid once
  earned.
  Her sprite sits on a grass block below the homework page and hops when
  a bar passes (bar grain, rhythm pieces, and at bar ends in the note
  grain; never per note), cheers at the end. No costume layers or ghost
  outlines anywhere (costume time was replaced 2026-10-05; old logs have
  `step: 'costume'`). Counts are memory-only (`a.jewels` gems, `a.pairs`
  turns that earned any).
  Logs (adventure session, step events): `step: 'jewel'` start { after,
  color, turn }, finish { after, color, turn, cells: [first, second], ms,
  moves, removed: [{ i, m }] (earlier jewels taken off and not put back;
  since 2026-10-07), by?: 'grownup' }, quit (same; a null in cells = not placed, not
  kept; placed ones are kept). Before 2026-10-06 one `cell` instead of
  `cells`. color is the gem name (9041ed3 logs: the Build block name).
  The session carries `jewels: { piece: gems }` (two per turn now);
  logs.mjs shows it.
  PARTY PLAY BUTTON (2026-10-05, pedagogy + parent: kids, a 2-year-old
  sibling too, thought nothing happened and mashed it; the room missed the
  sound). The delay was the band's whole-piece render, synchronous on the
  main thread (~2-3 s on a laptop for Ode with 4 members, the piano/bass
  partials in synth.js), so not even the pressed state could paint. Now:
  `band-render.js` renders in a module worker (`band-worker.js`; falls back
  to the main thread) and caches by song+band+sr; the party asks for its
  first piece at the guest's welcome (`warmParty`) and for the rest one at a
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
  PARTY HARMONY (2026-10-08, parent: the band should play harmony, not all
  the tune): the party's renders pass `{ boost, arrange: true }` and the
  band plays an arrangement from `arrange.js`: piano and the guest (chip /
  meow / horn / xylo) keep the tune on top (the kids sing along with the
  note names); Froggy's bass plays chord roots (beat 1; a chord held a bar
  plays root then fifth on beat 3), C2..B2 and always under the tune;
  Buzzy's music box plays a smooth line of diatonic thirds/sixths under
  the tune (a chord tone when the tune is on one), -3 dB, an octave up
  when the guest sings up there (chip/meow/xylo), resting below A2; drums
  unchanged. Chords: `pickChords` picks I / IV / V / V7 per half bar
  (2 beats; pieces are 4/4, no pickups) in `keyOf(song)` (song.key, else G
  for an F♯ key signature or F♯ notes, else C), scoring how long each
  chord tone sounds (half-bar downbeat counts double), a lean to I and to
  staying put, ending on I from V. Per-piece override: `chords: ['I', 'V7',
  ...]` on the piece (one per half bar; band-render passes sharps/key/
  chords to the worker). `test/arrange.mjs` pins Ode's and Zebra's charts
  (run by npm test). Other renderBand uses (the model bar, hellos, Build,
  hidden band screen) stay unison. Render ~1.6-2.3 s per piece on a laptop
  (no slower than before); party RMS about -11 dB as before.
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
- MIC SWITCH (2026-10-08, parent: a 2-year-old sibling plinks on the piano
  or a second instrument while she practices, and those notes were judged
  as hers). `src/app/mic-off.js` (imported by main.js): a small round 🎤
  button, BOTTOM RIGHT (top right has screens' buttons, e.g. Copy me's ⏭),
  shown whenever `engine.listening` except on calibrate. A DOUBLE TAP
  (2 pointerdowns < 450 ms) toggles; a single tap only flashes a "double
  tap" hint. Off = a dark pill, red border, crossed-out 🎤, "mic off".
  Taps on it don't reach the screen. While off every note is dropped by
  `heard(fn)`, the wrapper all screens now use around their
  `engine.onNote` listener (adventure, echo, world, play, editor; not
  calibrate, audio's), sim/test-keyboard notes included. The mic stays
  connected and the detector runs (reconnecting makes a phantom note);
  nothing in engine.js changed. On: notes whose attack is before the
  switch-on time (same context) are dropped, and `onMicToggle(fn)`
  listeners run: homework rhythm pieces clear the half-heard bar
  (entries, wrong, the unheard-end timer) on either switch. Grown-up
  step/back work as usual. mic-health.js treats off as nobody listening
  (no checks, retries or badge). MEMORY ONLY, ON after a reload: it's for
  one practice, and a mic left off by mistake would look like a broken app
  (or a dead mic) the next day; off does carry across screens until then.
  Logs: `mic` events { off: true|false, at (ms on the detector-event clock),
  by: 'double-tap' } (a session started while off begins with { off: true,
  at: 0, by: 'start' }); onset/pitch/sim events while off carry `micOff:
  true`; the audio recording keeps running (times stay aligned) and the
  off stretches are those marks. logs.mjs shows "MIC OFF <n>s".
- Build! blueprints (2026-09-29, she'd memorised the six): silhouette only,
  the first block's letter as the one clue, no "next" column, no staff
  letters, no ✋; 🎲 comes first and "🎲 New shape" follows a finished one.
- MAKE A SONG (2026-10-08, she asked to make her own song): home shows a
  "🎵 Make a song" card (newSong('me') → editor, logged as a `make-song`
  record) and her own songs (by: 'me', newest first) after the experiments.
  Hidden still (files kept, routes work): homework songs on home, the ⚙︎
  "Add homework song", and the 💾 save buttons in Build!/Copy me.
- Experiments: "Build!" (`world.js`: melody contour → building, blueprints)
  and "Copy me!" (`echo.js`: call-and-response, copy/answer modes).
  Copy me GROWN-UP STEP (2026-10-05, pedagogy: the mic missed phrases she
  played and ⏭ dropped her a level): the homework gestures, now shared in
  `grownup.js` (`grownupGestures(el, { step, back })`; adventure.js still
  has its own copy). ONE NOTE PER STEP (2026-10-08, parent: a tap that
  filled the whole phrase handed her unearned 💎): on her turn a two-finger
  tap / → counts only the CURRENT note as heard (`advance()`, the same path
  as a heard note: block drops in, staff marker and ✋ move on), and wins
  the round only if it was the last note. Ignored during the call and
  between rounds, and for a touch that BEGAN before her turn (grownup.js
  passes `{ since }` = finger-down time; echo ignores since < round.turnAt;
  before this, two fingers held through the call fired on lift and won the
  round). A replay clears the round's grown-up fills. Swipe/← does nothing
  there. Logs each fill as `judge { k, want, grade: 'grownup', by:
  'grownup' }`; a win with any grown-up fill logs `round { ok: true, level,
  by: 'grownup', helped: [k...], heard: <notes the mic got> }` (before
  2026-10-08 `heard` = notes before the one tap that won). Answer me: a step ends her
  answer now if she's played anything (else ignored), logs `answer-end {
  heard, by: 'grownup' }`.
  Copy me FINISH LINE (2026-10-05, pedagogy + parent: 💎 piled up forever
  and the parent had to say "there's nothing left"): `GOAL = 8` 💎, shown
  from the start as 8 dashed slots (top left) that fill gold. Grown-up
  steps count. The 8th 💎 → `ending()`: a fixed full-screen layer goes up
  at once and swallows every tap (header too; mic notes and grown-up
  steps are ignored since the round is 'done', and setMode/partner/⏭/🔁
  check `ended`). Then dim, "🎉 The end!", the 8 💎 popping in, her
  `characterUrl` sprite (plain, no costume) in the middle with the
  partner and the other band members dancing, confetti and sparkles,
  renderJingle / renderYay / renderJingle (~4 s of sound). At `ENDING_MS`
  (6.5 s) a big 🏠 and "▶ again" appear (live 0.5 s later). ▶ again
  restarts at her current level (no warm-up notch) with empty slots and
  a fresh session. Answer me: no slots. Logs: the session carries `goal`;
  `end` { gems, level, ms since session start }, `again` { level } (in
  the finished session, which ends with `aborted: false`).
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
  data", mirrored into the blob for old versions. Her jewels likewise
  (`pianopad.jewels`, 2026-10-06). The editor (`me.js`)
  saves after every stroke and on leaving; wipes (👑, 🧽) take two taps.
