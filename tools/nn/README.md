# Reference transcriptions and the piano profile

Offline tools (Python) for judging the real-time detector and for learning
`src/piano-profile.json`: how the family piano sounds through her iPad.
None of this runs in the app.

## Setup (once)

Recordings and everything derived from them stay out of git, in
`~/Dev/piano-audio-data`:

```sh
mkdir -p ~/Dev/piano-audio-data && cd ~/Dev/piano-audio-data
rsync -a autobox:piano-logs/ logs/
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python torch piano_transcription_inference librosa audioread mido
# Kong et al.'s checkpoint (the package's own download is flaky):
mkdir -p ~/piano_transcription_inference_data
curl -L -o ~/piano_transcription_inference_data/'note_F1=0.9677_pedal_F1=0.9186.pth' \
  'https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1'
```

## Reference transcriptions

`kong.py` runs Kong et al.'s high-resolution piano transcription (offline,
bidirectional, 20M parameters) and writes `<rec>.kong.json` next to each
recording. Takes ~7 s per recording on an M4 Pro (MPS).

```sh
.venv/bin/python ~/Dev/piano-pad-audio/tools/nn/kong.py logs/*/*.mp4
node ~/Dev/piano-pad-audio/tools/ref-audit.mjs logs/*/*.mp4 --confusion
```

It isn't ground truth. Through the iPad mic it adds quiet overtone
"ghost" notes and transcribes some speech, so `ref-audit.mjs` groups notes
into attacks and scores against the loudest note of each.

## The piano profile

`src/piano-profile.json` holds:
- `octaveDown`: keys this piano/mic reads an octave high (from
  `ref-audit.mjs --confusion`; C4 read as C5 on 2026-09-26).
- `templates`: one log-frequency spectrum per key (A2-C7) plus four
  background spectra, for the experimental template onsets
  (`onsets: 'templates'` in `src/detector.js`). Learned from Kong-labeled,
  isolated notes; keys with no examples are copied from the nearest learned
  key, shifted.

Regenerate after new recordings (or a tuned or moved piano):

```sh
EXPORT=templates-all.json .venv/bin/python ~/Dev/piano-pad-audio/tools/nn/nmf_proto.py logs split=all
# then copy templates-all.json into the "templates" field of src/piano-profile.json
```

`nmf_proto.py logs` (without EXPORT) is the Python prototype: it learns on
half the recordings and sweeps thresholds on the other half.
`split=foldI/K` learns on all files whose index % K != I, for
cross-validation with `ref-audit.mjs --templates=<file> --opt onsets=templates`.
