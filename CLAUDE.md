# piano-pad

An iPad web app that listens (mic) to an acoustic piano and makes practice fun
for a 5-year-old. Vanilla JS modules, no build step. Hosted on GitHub Pages at
https://piano.ezyang.com from `main` (repo is **public**: never commit secrets
or anything about the child beyond what the app itself shows).

## Agents

The project is run by three long-lived Claude sessions. The human (the parent)
gives high-level direction, usually by texting one agent over Remote Control.

| Agent            | Where it runs                   | Owns |
|------------------|---------------------------------|------|
| `piano-audio`    | `~/Dev/piano-pad-audio` (worktree, branch `audio`) | turning mic audio into note events — see `agents/audio.md` |
| `piano-app`      | `~/Dev/piano-pad` (branch `main`) | the app: screens, exercises, UI, telemetry, visuals — see `agents/app.md` |
| `piano-pedagogy` | `~/Dev/piano-pedagogy` (private, not in this repo) | tracking her learning, deciding what to build next; owns no code |

**Your role is the one whose directory you are running in.** Read your charter
(`agents/<role>.md`) at the start of a session and again after your context is
summarized. The charter, not your conversation history, is the durable record:
when you learn something the next instance of you needs (a decision, a finding,
a current priority), write it into your charter's "Current state" section.

### Talking to each other

- Send messages with `SendMessage` to `piano-audio`, `piano-app`, or
  `piano-pedagogy` (check names with `ListAgents`). Make each message
  self-contained: the receiver may have lost context.
- Message the owner instead of editing their files. Small, obviously-right
  fixes in someone else's file are OK if you tell them afterwards.
- Changing the contract between audio and app (see below) needs a heads-up to
  the other agent *before* it's pushed.
- Requests from `piano-pedagogy` are tracked in
  `~/Dev/piano-pedagogy/requests.md`. When you finish or decline one, message
  pedagogy so it can update the list.
- Escalate to the human (don't just decide among yourselves) for: anything that
  changes what she sees in a big way, removing an experiment she uses, new
  data collection, or disagreements between agents.

### The audio ↔ app contract

`src/app/engine.js` is the seam. It is owned by `piano-audio`; the header
comment documents what the app can rely on (`onNote`, `onRaw`, `configure`,
`simulate`, `play`, `now`, `listen`, level stats). The app codes against that
interface and doesn't reach into the detector directly.

## Shipping (push to `main` = deploy)

A push goes live on her iPad within ~10 minutes, so:

1. Work on your branch/checkout; commit in small pieces.
2. `git fetch && git rebase origin/main`.
3. `npm test` must pass. Audio changes: also `npm run bench` and replays of
   real recordings (`node tools/replay.mjs`) no worse than before.
4. Load the app (`npm run serve`) and check the screens you touched still work.
5. `git push origin HEAD:main`. If the push is rejected, go back to step 2.

Never force-push `main`. If you break production, revert first, debug second.

## Shared facts

- Practice logs (and opt-in audio) upload to autobox: `ssh autobox`, files in
  `~/piano-logs/<YYYY-MM-DD>/<id>.json` / `.mp4`. Read a log with
  `node tools/logs.mjs <file> [index|id]`; re-run the detector on a recording
  with `node tools/replay.mjs <file.mp4>`.
- Session kinds in the logs tell you what she did (e.g. `build`, `echo`,
  `calibration`); `sim` events are test-keyboard presses, not real notes.
- A service worker (`sw.js`, network-first) keeps home-screen installs current.
