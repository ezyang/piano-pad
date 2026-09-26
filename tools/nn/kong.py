"""Offline reference transcription with Kong et al.'s high-resolution piano
transcription model (ByteDance, 2021; bidirectional, so offline only).

    python tools/nn/kong.py rec1.mp4 rec2.mp4 ...

Writes <rec>.kong.json next to each recording: a list of
{"t": onset_s, "off": offset_s, "midi": n, "vel": 0..127}. Existing files are
skipped. Needs: torch, piano_transcription_inference, librosa (see
tools/nn/README.md). The checkpoint (~170 MB) downloads on first use.
"""
import json, os, sys, subprocess
import numpy as np
import torch
from piano_transcription_inference import PianoTranscription, sample_rate

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sample_rate), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

def main(files):
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    tr = None
    for f in files:
        out = os.path.splitext(f)[0] + '.kong.json'
        if os.path.exists(out):
            continue
        if tr is None:
            tr = PianoTranscription(device=device, checkpoint_path=None)
        audio = decode(f)
        res = tr.transcribe(audio, os.devnull)
        notes = [{'t': round(float(e['onset_time']), 4), 'off': round(float(e['offset_time']), 4),
                  'midi': int(e['midi_note']), 'vel': int(e['velocity'])} for e in res['est_note_events']]
        with open(out, 'w') as fh:
            json.dump(notes, fh)
        print(f'{os.path.basename(f)}: {len(notes)} notes', flush=True)

if __name__ == '__main__':
    main(sys.argv[1:])
