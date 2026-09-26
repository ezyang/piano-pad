"""Prototype: piano-specific NMF note detector, scored against Kong references.

Learns one spectral template per key from Kong-labeled, isolated notes in the
training recordings (this piano, this mic, this room), then explains every
frame of the test recordings as a non-negative mix of key templates plus a few
background templates. A note onset is a jump in its key's activation.

    python tools/nn/nmf_proto.py <logs dir> [key=value ...]
"""
import glob, json, os, subprocess, sys
import numpy as np

SR, N, HOP = 48000, 2048, 256
BPS = 3                      # log-frequency bins per semitone
LO, HI = 40, 112             # log-frequency range (MIDI)
KEYS = np.arange(45, 97)     # A2..C7
P = dict(split='train', warm=0, iters=30, bg=4, rise_frames=3, thr=0.25, share=0.3, floor_db=-70, refr=0.06, tol=0.07, minvel=30, minkey=57, maxkey=127)
for a in sys.argv[2:]:
    k, v = a.split('='); P[k] = type(P[k])(v)


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def logfreq_matrix():
    freqs = np.arange(N // 2 + 1) * SR / N
    centers = 440 * 2 ** ((np.arange(LO * BPS, HI * BPS) / BPS - 69) / 12)
    M = np.zeros((len(centers), len(freqs)))
    for i, c in enumerate(centers):
        lo, hi = c * 2 ** (-1 / (12 * BPS)), c * 2 ** (1 / (12 * BPS))
        w = np.maximum(0, 1 - np.abs(np.log2(freqs / c + 1e-12)) / np.log2(hi / c))
        if w.sum() == 0:  # narrower than a linear bin: interpolate
            j = np.searchsorted(freqs, c); t = (c - freqs[j - 1]) / (freqs[j] - freqs[j - 1])
            w[j - 1], w[j] = 1 - t, t
        M[i] = w / w.sum()
    return M


LF = logfreq_matrix()
WIN = np.hanning(N)


def spectrogram(x):
    nf = (len(x) - N) // HOP
    idx = np.arange(N)[None, :] + HOP * np.arange(nf)[:, None]
    S = np.abs(np.fft.rfft(x[idx] * WIN, axis=1))
    return (S @ LF.T).T  # (bins, frames); frame t covers samples [t*HOP, t*HOP+N)


def frame_time(t):
    return (t * HOP + N) / SR  # when the frame is complete (causal)


def load(files):
    out = []
    for f in files:
        ref = json.load(open(f[:-4] + '.kong.json'))
        out.append((f, spectrogram(decode(f)), ref))
    return out


def learn_templates(data):
    ex = {k: [] for k in KEYS}
    bgframes = []
    for f, V, ref in data:
        on = np.array(sorted(r['t'] for r in ref))
        for r in ref:
            if r['vel'] < 40 or r['midi'] not in ex:
                continue
            others = on[(on > r['t'] - 0.3) & (on < r['t'] + 0.15) & (np.abs(on - r['t']) > 0.02)]
            if len(others):
                continue
            ts = [t for t in range(V.shape[1]) if r['t'] + 0.03 <= frame_time(t) - N / SR / 2 <= r['t'] + 0.12]
            if not ts:
                continue
            s = V[:, ts].mean(axis=1)
            ex[r['midi']].append(s / s.sum())
        far = np.array([np.min(np.abs(on - frame_time(t))) > 0.6 if len(on) else True for t in range(V.shape[1])])
        bgframes.append(V[:, far][:, ::5])
    W = np.zeros((LF.shape[0], len(KEYS)))
    have = [i for i, k in enumerate(KEYS) if len(ex[k]) >= 2]
    for i in have:
        W[:, i] = np.median(np.array(ex[KEYS[i]]), axis=0)
    for i, k in enumerate(KEYS):  # fill gaps by shifting the nearest learned key
        if i in have:
            continue
        j = min(have, key=lambda h: abs(h - i)); d = (i - j) * BPS
        W[:, i] = np.roll(W[:, j], d)
        if d > 0: W[:d, i] = 0
        elif d < 0: W[d:, i] = 0
    W /= W.sum(axis=0, keepdims=True)
    # background: small KL-NMF on far-from-note frames
    B = np.concatenate(bgframes, axis=1)
    B = B[:, B.sum(axis=0) > np.percentile(B.sum(axis=0), 20)]
    rng = np.random.default_rng(0)
    Wb = rng.random((LF.shape[0], P['bg'])) + 0.1; Hb = rng.random((P['bg'], B.shape[1])) + 0.1
    for _ in range(100):
        R = B / (Wb @ Hb + 1e-12); Hb *= (Wb.T @ R) / Wb.sum(axis=0)[:, None]
        R = B / (Wb @ Hb + 1e-12); Wb *= (R @ Hb.T) / Hb.sum(axis=1)[None, :]
        Wb /= Wb.sum(axis=0, keepdims=True)
    print(f'templates: learned {len(have)}/{len(KEYS)} keys ({", ".join(str(KEYS[i]) for i in have)})', file=sys.stderr)
    return np.concatenate([W, Wb], axis=1)


def activations(V, W):
    if P.get('warm', 0):
        # Real-time style: frame by frame, warm-started from the previous frame.
        H = np.zeros((W.shape[1], V.shape[1])); h = np.full(W.shape[1], 1e-6)
        for t in range(V.shape[1]):
            v = V[:, t]; h = np.maximum(h, v.sum() / W.shape[1] * 1e-3)
            for _ in range(P['iters']):
                h *= W.T @ (v / (W @ h + 1e-12))
            H[:, t] = h
        return H
    H = np.full((W.shape[1], V.shape[1]), V.sum(axis=0).mean() / W.shape[1] + 1e-9)
    for _ in range(P['iters']):
        R = V / (W @ H + 1e-12)
        H *= (W.T @ R)  # W columns sum to 1
    return H


_HCACHE = {}


def detect(V, W):
    key = id(V)
    if key not in _HCACHE:
        _HCACHE[key] = activations(V, W)
    H = _HCACHE[key]
    K = len(KEYS)
    A = H[:K]
    tot = H.sum(axis=0) + 1e-12
    loud = 20 * np.log10(V.sum(axis=0) + 1e-12)
    L = P['rise_frames']
    notes, last = [], -1
    prevA = np.concatenate([np.zeros((K, L)), A[:, :-L]], axis=1)
    # Normalize rises by a slowly decaying peak of total activation (like fluxRef).
    ref = np.zeros_like(tot); r = 1e-9
    for t in range(len(tot)):
        r = max(tot[t], r * 0.995); ref[t] = r
    rise = (A - prevA) / ref
    for t in range(1, A.shape[1] - 1):
        k = int(np.argmax(rise[:, t]))
        v = rise[k, t]
        if v < P['thr'] or loud[t] < P['floor_db']:
            continue
        if not (v >= rise[k, t - 1] and v >= rise[k, t + 1]):  # local peak (1 frame lookahead)
            continue
        if A[k, t] < P['share'] * A[:, t].sum():
            continue
        tt = frame_time(t) - N / SR / 2
        if notes and tt - notes[-1][0] < P['refr']:
            continue
        notes.append((tt, int(KEYS[k])))
    return notes


def score(data, W):
    return fmt(score_raw(data, W))


def fmt(c):
    pct = lambda a, b: f'{100 * a / max(b, 1):.1f}%'
    return (f"firm {pct(c['h70'], c['n70'])}  med+firm {pct(c['h50'], c['n50'])}  all {pct(c['h30'], c['n30'])}  "
            f"letter {pct(c['letter'], c['hits'])}  exact {pct(c['exact'], c['hits'])}  notes {c['det']}  false {c['extra']}")


def score_raw(data, W):
    n = {30: 0, 50: 0, 70: 0}; h = {30: 0, 50: 0, 70: 0}; letter = exact = hits = det = extra = 0
    for f, V, ref in data:
        got = detect(V, W)
        att = []
        for r in sorted(ref, key=lambda r: r['t']):
            if att and r['t'] - att[-1]['t'] < 0.04: att[-1]['notes'].append(r)
            else: att.append({'t': r['t'], 'notes': [r]})
        used = set()
        for a in att:
            a['vel'] = max(r['vel'] for r in a['notes']); a['main'] = max(a['notes'], key=lambda r: r['vel'])['midi']
            if a['vel'] < P['minvel'] or not (P['minkey'] <= a['main'] <= P['maxkey']):
                continue
            cand = [j for j, g in enumerate(got) if j not in used and abs(g[0] - a['t']) < P['tol']]
            for b in (30, 50, 70):
                if a['vel'] >= b: n[b] += 1
            if cand:
                j = min(cand, key=lambda j: abs(got[j][0] - a['t'])); used.add(j)
                for b in (30, 50, 70):
                    if a['vel'] >= b: h[b] += 1
                hits += 1
                if any(r['midi'] % 12 == got[j][1] % 12 for r in a['notes']): letter += 1
                if got[j][1] == a['main']: exact += 1
        for g in got:
            if not (P['minkey'] <= g[1] <= P['maxkey']): continue
            det += 1
            if not any(abs(a['t'] - g[0]) < P['tol'] for a in att): extra += 1
    return {'n30': n[30], 'n50': n[50], 'n70': n[70], 'h30': h[30], 'h50': h[50], 'h70': h[70],
            'letter': letter, 'exact': exact, 'hits': hits, 'det': det, 'extra': extra}


def export(W, path):
    """Templates as JSON for src/detector.js (log-frequency domain, any sample rate)."""
    cols = [[float(f'{v:.4g}') for v in W[:, i]] for i in range(W.shape[1])]
    json.dump({'lo': LO, 'hi': HI, 'bps': BPS, 'n': N, 'hop': HOP, 'keys': [int(k) for k in KEYS],
               'bg': P['bg'], 'W': cols}, open(path, 'w'), separators=(',', ':'))


if __name__ == '__main__' and os.environ.get('EXPORT'):
    # EXPORT=out.json python nmf_proto.py <logs> [split=train|all]
    files = sorted(f for f in glob.glob(os.path.join(sys.argv[1], '*', '*.mp4')) if os.path.exists(f[:-4] + '.kong.json'))
    if P['split'].startswith('fold'):  # foldI/K: train on files whose index % K != I
        i, k = map(int, P['split'][4:].split('/'))
        use = [f for j, f in enumerate(files) if j % k != i]
    else:
        use = {'train': files[0::2], 'test': files[1::2]}.get(P['split'], files)
    export(learn_templates(load(use)), os.environ['EXPORT'])
    sys.exit(0)

if __name__ == '__main__':
    files = sorted(f for f in glob.glob(os.path.join(sys.argv[1], '*', '*.mp4')) if os.path.exists(f[:-4] + '.kong.json'))
    train, test = files[0::2], files[1::2]
    W = learn_templates(load(train))
    np.save(os.path.join(sys.argv[1], 'nmf_W.npy'), W)
    te = load(test)
    for thr in (0.15, 0.2, 0.25):
        for share in (0.15, 0.3):
            P['thr'], P['share'] = thr, share
            print(f'thr={thr} share={share}'.ljust(22), score(te, W), flush=True)
    print('files', ' '.join(os.path.basename(f) for f in test), file=sys.stderr)
