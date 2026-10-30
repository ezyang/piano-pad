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

As of 2026-10-29 (the sleeping lion before Bell: firm notes relative to her own attack level wake Roary, who joins the band on timpani; engine.attackLevel), 2026-10-26 (a heard black key shows its ♯: staff ghosts, free Build columns, Answer me blocks), 2026-10-23 (new homework, 3/4 time: Dot → Bell → party; Reading, Sea, Cats to the party; a dead mic is remembered across loads: grown-up note on home and map, reopen only by tap, MediaRecorder chunk counts in logs), 2026-10-15 (new homework: Reading → Sea → Cats → party, `times: 3`, bunny house before Reading, LH-only pre-staff with `fingersOnly`; Zebra and Ode to the party), 2026-10-13 (her picture: undo history, safer wipes, backup in logs, ⚙︎ restore; grown-up step does nothing outside the piece: jewel turn, bunny house, reveal; jewel ✓ any time; song editor bars are real 4/4 with ties; rhythm bars pass on a pause; bunny house before Zebra; Copy me grown-up step = one note; mic switch):
- **Today's adventure** leads the home screen. It's LINEAR (parent: "choose
  your own adventure is bad, we want to do all the material"), this week's
  homework in a fixed order (since 2026-10-23): Dot → Bell → party
  (2026-09-30..10-07 Zebra → Train → Ode; 10-07..14 Zebra → Sea → Ode;
  10-15..22 Reading → Sea → Cats; all of those are now earlier homework,
  in the party's buttons, keeping their gems),
  each unlocking the next (`#/adventure/piece/<id>`, `#/adventure/party`).
  Finishing a PICKING piece (adventure.js; now only Dot, with two pieces)
  gives a "Who joins your band?" pick (Froggy / Beep Bot / Buzzy); the
  map's lineup has one slot per PICKING piece (so her, one pick, the
  guest this week); the last piece
  (STEPS.at(-2), now Bell) brings the SURPRISE GUEST (below); the sleeping
  lion before Bell adds Roary (below). The
  party plays the last piece first;
  buttons (screens/adventure.js PARTY: this week's in map order, then
  Reading / Sea / Cats / Zebra / Ode / Train / G / Stairs / Up and Down;
  11 buttons wrap to two rows) switch to any piece,
  then free Build! / Copy me. New homework = new PIECES + adventure.js
  STEPS/PICKING + STOPS/PARTY in screens/adventure.js + home.js's mini map.
  3/4 TIME (2026-10-23, pedagogy: the lesson brought 3/4 and the dotted
  half, counted "1-2-3", and the teacher wants a steady 1-2-3). A piece
  with `beats: 3` (default 4; music.js `meter(song)`): bar lines every 3
  beats in book.js and staff.js (music.js `pieces/bars(laid, bar)`), the
  adventure's bar grain too (screens/adventure.js `perBar`). A dotted
  half (d: 3) draws as an open head + dot (staff.js already had the dot);
  in book.js it also gets a small "2 - 3" after it, like the whole
  note's "(2 - 3 - 4)", in every label mode (the teacher pencils it in).
  book.js now draws a printed `repeat` (two dots per row before the final
  double bar); grand pieces with `twice` still have no sign. No time
  signature is drawn anywhere. PARTY WALTZ: arrange.js picks one chord
  per BAR in 3/4 (song.chords: one per bar), the bass plays the root on
  beat 1 only (1 beat long), and `arrange().waltz` is the PIANO's
  oom-pah-pah (her slot, always in the band): root on 1 (vel 0.55), a
  closed triad on 2 and 3 (vel 0.35, short), just under the tune when the
  bar's tune is from A3 up, else just above it. Drums in 3/4: kick on 1,
  lighter snare on 2 and 3. 4/4 pieces are unchanged (waltz is empty).
  band-render passes `beats` to the worker. Not done: rhythm-gating in
  3/4 (rhythm-bars.js is 4/4-agnostic but untested there; no 3/4 piece is
  rhythm-gated); the song editor and track.js stay 4/4. `dyn` on a note
  ('mf', 'f'): the printed dynamic, data only (Bell has them).
  DOT (2026-10-23): pre-staff, 3/4, `repeat`. LH line then RH line. LH as
  in Sea (thumb on C3, C3=1 B2=2 A2=3 G2=4): C3 B2 A2 | G2. | G2 A2 B2 |
  C3.; RH thumb on middle C: C D E | F G F | E-half D | C. Book fingers
  LH 1 on the first C, 4 on the first G (the teacher's pencil), RH 1 on
  its first C (note 8). Set-ups at 0 (LH thumb on the C below middle C)
  and 8 (RH thumb on middle C). `bunny` (the bunny house moved here from
  Reading). Party chords pinned: I V V I I V7 I I (the picker put IV
  under C B A). Gem topaz (orange).
  BELL (2026-10-23): pre-staff, 3/4, `repeat`, thumbs-are-neighbours as in
  Cats (LH G3=3 A3=2 B3=1). RH G F E | F E D | E D C | D. ; LH G3. | G3. |
  G3 A3 B3; RH C. Book fingers RH 5/4/3 (notes 0, 3, 6), LH 3 (10), RH 1
  (15). Set-ups at 0 (RH finger 5 on G) and 10 (LH finger 3 on G).
  `dyn`: mf on note 0, f on note 10. Picker chords: I V7 I V I I V I.
  Gem rose (pink).
  READING (2026-10-15, pedagogy; party only since 10-23): a left-hand-only reading exercise, 2
  bars (G3 G3 A3 A3 | F3 A3 F3-half), finger 3 on G3 (`position` L
  F3=4 G3=3 A3=2, R empty). The book prints ONLY finger numbers (no
  letters, no staff): pre-staff with `fingersOnly`, so under 'book'
  labels the heads are blank and every note shows its printed finger
  (3 3 2 2 | 4 2 4); the other label modes show letters as usual.
  book.js: a hand with no notes gets no row, and a piece shorter than a
  line spreads its bars over the width. Rhythm-gated + pitched like
  Zebra (bar grain). `times: 3` (the book: "play three times"). Party
  chords in F (`key: 5`: it ends on F; in C the picker can't end on I).
  CATS (2026-10-15): pre-staff, hands take turns, thumbs next-door
  neighbours (LH G3=3 A3=2 B3=1, RH C4..F4 = 1..4), book fingers RH 1 at
  each line's start (notes 0, 14) and LH 3 on the first G (7); set-up
  banners: both thumbs at 0, LH finger 3 on G at 7. `twice`. Its party
  chords are pinned (`chords`: V under the LH's G G A B; the picker put
  IV under A B).
  Pieces (parent: she'd become dependent on prompts, so the app is a bridge
  to the paper book): drawn like her book, pre-staff (`book.js`: letter in
  the head, RH row above LH, whole notes counted "(2 - 3 - 4)") or a real
  staff (staff.js: `sharps` key signature, `repeat` sign = played twice,
  finger numbers above as printed, label rows); `twice` = played twice with
  no sign drawn (Train and Ode since 2026-10-04, Sea 2026-10-07, Cats; logs
  `repeat: true, twice: true`); `times: n` = played n times (Reading, 3;
  logs `repeat: true, times: 3`).
  SLEEPING LION (2026-10-29, pedagogy: the teacher keeps asking for a
  "heavy lion paw", arm weight into the key for a firm, full sound; her
  soft pokes are also the notes the detector misses; Bell is marked mf /
  f). `lion.js`, before LION_BEFORE (adventure.js; Bell) every time it
  opens (the bunny stays on Dot): Roary (pixels.js `LION`, `lionUrl
  ('asleep' | 'awake' | 'roar')`, kept out of BAND/GUESTS) asleep,
  breathing, "Z z z" floating; "Wake the lion with a heavy lion paw!" /
  "Drop your arm into the key." and three 🐾 slots. The mic listens from
  the moment it opens (notes before that never count; a chord or bounce
  within 150 ms is one strike; voice notes ignored). FIRM = attack level
  ≥ her typical + 5 dB (`FIRM_DB`): the paw fills, "Yes! A lion paw!";
  soft: the lion stirs, "A bit heavier!" (no sound while listening: the
  mic would hear it). Any loudness above the line counts once (no "too
  loud" message: no banging in the logs to calibrate it). 3 firm → the
  roar sprite, "ROAR!", `renderRoar` (~1.6 s synthesized growl), sparkles,
  then (first time this adventure) "Roary joined your band!" and the
  piece begins (~4 s; a replay's wake goes straight on). TYPICAL: median
  of her last 60 homework notes' attack levels, `pianopad.attackLevels`
  (scrap paper; not while ⚙︎ a grown-up is playing; lion notes excluded),
  -32 dB until 8 notes. Evidence (2026-10-29, her recordings 10/26-10/28,
  105 judged notes re-run offline, peak frame dB in 100 ms after the
  onset): session medians -35..-28 dB (so only relative works), Bell's
  LH f line +4.7 / +6.0 dB over its RH mf line, 15% of ordinary notes ≥
  median + 5, max +12. Live headless replay of 10/28's Bell read ~3 dB
  lower overall but the same +7 between the lines. MIC OFF / DEAD
  (mic switch, mic-health's `pianopad.micDead`, or listen() not running
  in 1.5 s; also if it goes off/dead midway): "Tap the lion to wake it
  up!" and a tap (primary finger) wakes it. Grown-up two-finger tap / →
  wakes it (a touch that began before it opened is ignored). The band:
  a.band = her, picks, 'lion', guest (adventure.js `lion('finish')`
  inserts it); the map's lineup has a Roary slot (dim asleep sprite,
  "Zzz") between the pick and the ⭐. In the party Roary plays
  `timpani` (instruments.js `boom`: tuned kettle drum on the bass line's
  chord roots, G2..F♯3; unarranged: a boom per bar) and hops on the beat
  like the drums. ATTACK LEVEL: engine.js `attackLevel(note, ms=100)` →
  Promise<dB> = the loudest detector frame `db` from the attack to 100 ms
  later (engine keeps ~3 s of frames), and `simulate(midi, { level })`
  for tests (piano-audio's file: an additive change, tell them). Homework
  judge events get `lvl` (dB) filled in ~0.1 s later (hit and other;
  rhythm pieces only feed the typical). Logs (adventure session, step
  'lion'): start { before, typical, typicalN, thr, mode: mic | tap |
  none, why? mic-off | mic-dead | no-mic }, finish { by: notes | tap |
  grownup, ms, notes: [{ ms, midi, db, thr, firm }], firm, typical,
  typicalN, thr, mode, why?, joined? }, quit (same, no by). logs.mjs:
  "lion notes 3/5 firm +4.1dB" (her lion notes' median over typical:
  watch it for firmer notes over time). Drop the lion when the teacher
  moves on (LION_BEFORE).
  BUNNY HOUSE (2026-10-08, pedagogy: the teacher's goal is hand shape,
  a "tall round bunny house": curved fingers, high knuckle, room
  underneath). A reminder ritual, never a check: pieces with `bunny:
  true` (Zebra 2026-10-08..14; Reading 10-15..22; since 2026-10-23 only
  Dot, the first piece) open with `bunny.js` over the page
  BEFORE the mic/session starts: "Make a bunny house!", a pixel scene
  (pixels.js `bunnyHouseUrl`: side view of an arched hand, two
  fingertips on the keys, high knuckle; `bunnyUrl` bunny waiting on the
  keys beside it; positions in `BUNNY_HOUSE`) and a big ✓. Any tap on
  the panel → the bunny hops under the hand (CSS `bunny-hop`),
  `renderBunnyHop` (two boings + bell sparkle), sparkles, and after
  1.5 s the piece's normal begin(). No timer, no failure. Shown every
  time the piece's page opens (leave and come back = again; replays too).
  A grown-up step (→) does nothing there (2026-10-13; it used to skip
  it); a two-finger touch on the panel is a normal tap (pointerdown,
  primary finger). Logs (adventure session step
  events, adventure.js `bunny()`): start { step: 'bunny', before }, finish
  { before, ms (shown → tap); older logs may have by: 'grownup' }, or quit { before, ms }
  if she leaves first. Drop `bunny` from Dot when the goal moves on.
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
  The step/back work only while the piece is on (`session`): before it
  (bunny house) and after it (jewel turn, guest reveal, Party button) they
  do nothing (2026-10-13, parent: a two-finger tap took her out of placing
  her gems). Two fingers on those panels act as one normal tap at most
  (bunny, reveal) or nothing (jewel board, Party, band pick buttons).
  The right letter (any octave) advances; no look-ahead, no ghosts, voice
  readings dropped (prefer misses to false advances).
  RHYTHM pieces (`rhythm`; Zebra is also `pitched`) go bar by bar, gated by
  scoring.js `barRhythm` at her own tempo (ta-a ≥ 1.4× ta, ti ≤ 0.8× ta, same
  lengths within 2×), judged as the next bar's first note times the last,
  OR (2026-10-12) if she stops at the bar line, all m notes heard and no
  onset for 1.5× the last note's length at her tempo (≥ 700 ms, ≤ 3 s:
  ≈ 1 s after a ta, ≈ 2 s after a ta-a), on the m-1 intervals she played
  (`why: 'paused'`). Before this, every bar sat after her last note until
  the next bar's first; on 10/12 the grown-up tapped every bar and turned
  the mic off ("not hearing her"). The judging is `src/app/rhythm-bars.js`
  (pure; `test/rhythm-bars.mjs` replays that session bar by bar, no taps).
  Each note turns green as it's heard (cleared when the band models).
  Pitched: a wrong letter fails the bar ('wrong-note'; a wrong letter then
  a 3 s stop → model), except before the bar's first note (`why:
  'before-bar'`) or the letter just heard again (`why: 'echo'`: a ringing
  B4 came back as B3). An off bar → the band plays it with the rhythm
  words lit, she tries again. A missed note passes as 'unheard' (next note
  is the one after it, or `missedNote` timing); one short then a 3 s stop
  passes ('unheard-end' at the end of a time through, 'unheard-paused'
  mid-piece). Logs (kind `homework`): `grain`, `labels`, `rhythm`,
  `pitched`, `repeat`; judge `by: detector | grownup`; `bar` events
  (`iois` ms, `ok`, `why`, `unheard`, `paused`, `by`); `model` events.
  BETWEEN THE TIMES (2026-10-05, parent via pedagogy: going straight
  into "2nd time" felt harsh): a piece played more than once (`repeat`/
  `twice`/`times`) pauses after each time but the last for a small
  celebration (smaller than the end): a gold-framed panel over the page
  with her character cheering, a star filling (⭐☆, ⭐☆☆ / ⭐⭐☆ for
  three), a two-note ta-da (`renderYay`), "Yay! One more time!" (or
  "Yay! 2 more times!"); 2.6 s (`BETWEEN_MS`) or her tap, then the next
  time (`session.cheered` counts the times celebrated). Notes are ignored
  meanwhile (judge `why: 'between'`); a grown-up step skips it, a back
  cancels it (it plays again when that time ends again). Header
  stars: ☆☆ → ⭐☆ "2nd time" → ⭐⭐ at the end (☆☆☆ ... "3rd time" for three). Rhythm pieces judge the
  first time's last bar like the piece's last bar (no waiting for the
  next note). At the piece grain a grown-up step goes to the end of the
  current time through. Logs a `between` event { pass, of } (pass = times
  done so far).
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
  after the last piece's jewel turn (Cats; Ode until 2026-10-14), or on
  the map if she left early): "Who's
  coming?" over a wiggling ⭐ with a drum roll (`renderDrumroll`), at 1.8 s
  (or her tap) the guest pops in, "<Name> is here!" + its hello line, a
  ta-da and C-E-G-C on its own instrument, then 🎉 Party!. Logs: adventure
  session `guest`, `open { guest }`, and the last piece's `finish` (Ode until 10-14, Cats since) that brings it
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
  toward the pair, and are saved with the placements (at ✓/quit). Big ✓ ends
  it ANY TIME (2026-10-13, parent): with 0 or 1 placed the rest are just
  not placed, no scolding; the waiting gem keeps bobbing as the hint, and
  the ✓ bobs (`.ready`) once both are on. A grown-up step (two-finger tap,
  →) does nothing in the turn (it used to place the rest and end it). A
  board tap is ONE finger: jewels.js tracks pointers on window, picks the
  cell on pointerdown and acts on pointerup, and any second finger down
  meanwhile cancels it (no place, no remove); fingers down before the turn
  opened count for nothing. Every finish
  earns a pair, replays too (the replay loop is wanted). New gems are
  final once the turn ends (no undo of a finished turn; she can remove
  them on a later turn).
  GEMS (2026-10-06, parent: block
  colours read as planks/stone, not jewels): each piece earns a real gem,
  `gem:` on the piece in homework.js: Zebra gold, Train ruby, Ode diamond,
  Sea sapphire, Reading emerald, Cats amethyst, Dot topaz (orange), Bell
  rose (pink) (2026-10-23; the next new piece needs a new gem or a
  repeat);
  a piece without one gets GEM_NAMES[its index in PIECES % 8] (gold, ruby,
  diamond, emerald, amethyst, sapphire, topaz, rose), `pieceGem` in
  pixels.js (with Dot and Bell first in PIECES, Up and Down / Stairs / G
  still come out gold / ruby / diamond). Older app versions don't know
  topaz/rose and draw them as gold (gemName's fallback). GEMS
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
  color, turn }, finish { after, color, turn, cells: the ones placed (first,
  second; 0-2 entries), unplaced: n, ms,
  moves, removed: [{ i, m }] (earlier jewels taken off and not put back;
  since 2026-10-07) }, quit (same; placed ones are kept). Before
  2026-10-13 cells was always two long with null = not placed, no
  `unplaced`, and by: 'grownup' meant a grown-up's step auto-placed them. Before 2026-10-06 one `cell` instead of
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
  chords to the worker). `test/arrange.mjs` pins Ode's, Zebra's,
  Reading's (F: V I I I) and Cats' (pinned on the piece) charts, and
  Dot's/Bell's 3/4 charts and oom-pah-pah (run by npm test). Other renderBand uses (the model bar, hellos, Build,
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
  muted, or level exactly -120 (or not moving at all: no frames) for 3 s.
  Then: resume (suspended ctx, first try only), else `engine.restartMic()`
  (new getUserMedia + input node). `engine.reopen()` (new context +
  detector + mic, like a reload) ONLY from a grown-up's tap on the badge
  (2026-10-23: automatic reopens failed on iOS nearly every time, ctx
  suspended / "no stream", ~10 s lost). After 2 failed tries a grey
  grown-up badge top right, two lines: "🎤✕ The microphone isn't hearing
  anything. Close the app fully (swipe it away) or restart the iPad. Tap
  here to try again."; quiet reacquire retries continue (15 s, then every
  60 s). It hides when sound comes back or nobody is listening; never blocks.
  DEAD MIC REMEMBERED (2026-10-23, pedagogy: 10/16-10/19, 27 homework
  sessions over 5 loads were silent from the first second, no
  MediaRecorder frames; the grown-up never noticed, the badge got 1 tap;
  only a force-quit/restart fixes it). Giving up (the badge) sets
  localStorage `pianopad.micDead` = ISO time (kept if already set).
  While set: the home screen (fixed, bottom above the grass) and the
  adventure map (under the header) show a cream grown-up note in system
  sans, "🎤 Grown-ups: the microphone hasn't heard anything <today | since
  yesterday | since Friday | since Oct 16>. Close the app fully (swipe it
  away) or restart the iPad." (`.mic-warn`, pointer-events none, drawn by
  mic-health.js from the hash: '' and 'adventure' only, no home.js /
  adventure.js changes); in a piece the badge comes up at the first
  failed try. On home/map the first tap also opens the mic
  (`engine.restartMic()` if no stream yet) just to check it. Real input
  (level above -120 and changing on two ticks, listening or not) clears
  the flag and the note turns green "🎤 The microphone is hearing again."
  for 4 s. Logs: `mic` { action: 'gave-up', since } / { action:
  'cleared', since } and sessions started while set carry
  `micDeadSince` (logs.mjs: "MIC WARNING (dead since ...)").
  Logs: `mic` events { state: ended|suspended|muted|silent|ok, muted,
  readyState, ctxState, action: detected|resume|reacquire|reopen|none, ok,
  by: auto|tap, n, err? }; session `recorder` { chunks, empty, bytes,
  errors?, failed?, state } = the MediaRecorder copy's data chunks (0 =
  the track sent no frames; chunks + -120 dB = frames of zeros; the last
  chunk lands after the session is stored), `rec-error` events from its
  onerror; logs.mjs shows "rec <n>ch <KB>" (NO FRAMES / REC ERRORS /
  REC FAILED); session `audio.track` also has muted,
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
- HEARD SHARPS LOOK SHARP (2026-10-26, pedagogy: the family piano's F4 has
  gone sharp, the detector hears F♯, and a blueprint's wrong-note ghost sat
  on F's line with no ♯, so it looked like an F being refused). Wherever a
  note she played is shown, a black key carries a ♯: staff.js `ghost()`
  draws a ♯ before the ghost head (ghost style: red, grey in homework;
  every label mode, blueprints too; the ghost sits a bit further right to
  make room) and its letter row already read F♯; free Build's columns (F♯
  is as tall as F) get a small ♯ on top (`.w-sharp`, free mode only);
  Answer me's blocks show ♯ with labels off. Unchanged: free Build's and
  Copy me's staffs (heard notes are their song, drawn with ♯ already),
  homework (no ghosts), play screen (uses `ghost()`), what counts as right.
  A ghost on a key-signature staff still always shows ♯ (as the piece's
  own F♯ notes do there), never a ♮ for a natural.
- Build! blueprints (2026-09-29, she'd memorised the six): silhouette only,
  the first block's letter as the one clue, no "next" column, no staff
  letters, no ✋; 🎲 comes first and "🎲 New shape" follows a finished one.
- MAKE A SONG (2026-10-08, she asked to make her own song): home shows a
  "🎵 Make a song" card (newSong('me') → editor, logged as a `make-song`
  record) and her own songs (by: 'me', newest first) after the experiments.
  Hidden still (files kept, routes work): homework songs on home, the ⚙︎
  "Add homework song", and the 💾 save buttons in Build!/Copy me.
  BARS ARE REAL 4/4 (2026-10-12, parent: "bars aren't grouped
  correctly" in the song editor). Before, staff.js put each note in the
  bar it STARTED in (a ta-a on beat 4 made a 5-beat bar and a 3-beat one
  after it), the editor's rhythm line drew bar lines through such notes,
  and quantize let a lone ti (or a rushed note) shift everything after it
  off the beat. Now: music.js `pieces()`/`bars()` split a note that
  crosses a bar line into TIED pieces (display only: stored notes,
  playback and scoring still see one note; the first piece is note i, so
  mark/show/burst/span work as before). Every bar = 4 beats (last may be
  short). Editor rhythm line: "ta" ⌒ "a" for a tied ta-a (continuation
  syllables a / a-a / a-a-a); the pitch blocks still run across the line.
  staff.js draws tied heads + tie arcs (across a line break: an arc out to
  the line's end / in from its start). ti-ti pairs only beam on the beat,
  so they never straddle a bar. quantize(played, offset): starts snap to
  the grid, a ti stays a ti only in an on-beat pair (a lone ti → ta), the
  last note fills its bar (was always ta-a); the editor passes the beats
  already in the song as `offset`. Homework pieces have no crossings
  (test/music.mjs checks). Build!'s staff is all ta's (unchanged).
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
  (Node's WebSocket), fake silent mic, and `__engine.simulate(midi, { level })` (level: dB for attackLevel, e.g. the lion; goes
  straight to onNote listeners, bypassing the detector, since 9d268ae).
  Chrome flags: `--headless=new --remote-debugging-port=9333
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream
  --use-file-for-fake-audio-capture=<file.wav>
  --disable-features=AudioServiceOutOfProcess,AudioServiceSandbox`
  (add `--disable-audio-output` when timing matters, e.g. Play to write:
  without it the AudioContext clock barely moves in headless Chrome, so
  every simulated note gets the same time)
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
  saves after every stroke and on leaving.
- HER PICTURE IS RECOVERABLE (2026-10-13, pedagogy: she wiped a picture
  she'd drawn over many sessions, through the "Clear?" confirm, and
  nothing could bring it back). store.js keeps a history,
  `pianopad.characterHistory` = [{ t, grid: text, jewels }], oldest first,
  the last 40 DISTINCT versions (a repeat moves to the end), kept like the
  character (not touched by resets). Remembered when Me opens, before
  every wipe, at a ↩️ from the newest, and when she leaves Me (also by the
  ⚙︎ restore, before and after). Me's ↩️ (header, next to the title; dim
  when there's nothing earlier, shakes) steps back through this visit's
  strokes and wipes, then the history, so it undoes a 👑/🧽 even after a
  reload. Lossless: a stroke after going back appends (emacs-style), it
  never truncates. Undo restores the grid; jewels in the old version come
  back if their cell is free, current jewels stay. No redo button (↩️
  further reaches the newer ones after any new stroke).
  WIPES moved off the header (they sat beside ✓) to under the preview
  (portrait: right of the palette, under the preview), and the confirming
  tap counts only 0.8 s after arming (`ARM_MS`; a quick double tap does
  nothing; armed for 4 s).
  TEXT FORMAT (store.js `charText`/`parseCharacter`): CHAR_H=14 rows of
  CHAR_W=10 chars, top row first, each a CHAR_PALETTE index in base 36
  (0-9, a-f today) or '.' = clear, rows joined by '/' (pasting: newlines,
  spaces or commas also fine). parseCharacter also takes a JSON array of
  140 indices or a log's `character` object. Palette (pixels.js): 0
  #000000 black, 1 #ffffff white, 2 #f2c79b light skin, 3 #c68857 tan,
  4 #7a4a2a brown, 5 #3b2415 dark brown, 6 #e8433a red, 7 #ff8fb3 pink,
  8 #ffd84a yellow, 9 #5fc24a green, a #2f7de1 blue, b #9a5cc6 purple,
  c #8a8a8a grey, d #55e0d6 aqua, e #ff9a2e orange, f #2b2b2b near-black.
  OFF-DEVICE BACKUP: the adventure session record carries `character` =
  { grid: <text>, jewels: [{ i, m }] } (store.js `characterSnapshot`),
  refreshed at every adventure event (so it's her picture as of the last
  one). Leaving Me after any stroke/wipe/undo records a `me` session
  { strokes, pixels, jewelsGone?, wipes: ['clear'|'default'], undos,
  duration, character } (logs.mjs shows strokes/wipes/undos).
  RESTORE (grown-ups): ⚙︎ → "🖼 Restore her picture": a textarea filled
  with her current picture in the text format; paste a grid (or a log's
  whole `"character": {...}` value, which restores its jewels too; a bare
  grid keeps her jewels) → Restore. The old one goes to the history
  (↩️ on Me brings it back).
