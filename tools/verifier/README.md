# The verifier

A small learned check at the end of the detector: for each candidate note
(from the classic onsets or the network), "is there a new piano strike of
this pitch here?" It rejects re-reads of ringing notes and voices (her
talking, grown-ups, background speech), which the onset paths let through.

- Input (`PianoDetector._vfeat`): the network's log-frequency spectrum from
  200 ms before to `vPostMs` (15) after the onset, as 49 channels x frames
  (harmonics 1-8 of the note, octave below, neighbouring keys, 36 bands,
  total, flux) in dB relative to the running peak, plus 8 scalars.
- Model (`Verifier` in src/detector.js, trained by train.py): three dilated
  1-D convolutions (24 channels) -> 32 hidden -> [strike, strike of this
  pitch]. ~25k weights, well under 1 ms per candidate. Ensembles average.
- Used as a final gate (`verifier`, `verifierThr` 0.5): it can reject any
  candidate; `verifierRescue` lists rejection reasons it may overrule (none
  by default: rescuing made things worse).

Workflow (data in ~/Dev/piano-audio-data, never in git):

    node tools/verifier/dump.mjs verifier/cands-post15 logs/*/*.mp4   # VPOST=15
    .venv/bin/python ~/Dev/piano-pad-audio/tools/verifier/train.py . verifier/vA.json \
        --hold verifier/foldA.txt --cands verifier/cands-post15 [--seed n]
    node tools/eval.mjs eval-v1.json --verifier verifier/vA.json --opt vPostMs=15

Labels (train.py): whole-session parent labels > parent-labeled moments >
prompted takes (Kong onsets matched to the prompt) > Kong (weak). Evaluate
with session folds (foldA: the Sep 28 Stairs session + Sep 29 grown-up
runs; foldB: calibration takes, labels-1/2 sessions, Sep 28 grown-up runs).
