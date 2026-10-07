"""Prototype: a tiny causal onset network trained on her own recordings, with
Kong reference transcriptions as labels (same piano, mic and room as the app).

Input: the last CTX log-frequency frames (the same front end as the template
detector). Output: per key, the probability that it was struck in the newest
frame. One hidden layer, so it can run in plain JS in the worklet.

    python tools/nn/onset_mlp.py <logs dir> [folds=4] [key=value ...]

Cross-validates by recording (K folds) and prints the same scores as
nmf_proto.py, over a sweep of detection thresholds.
"""
import glob, os, sys
import numpy as np
import torch

sys.argv, _args = sys.argv[:2], sys.argv[2:]
import nmf_proto as nm  # front end, decoding and scoring
sys.argv += _args

P = dict(folds=4, ctx=4, hidden=128, epochs=30, lr=2e-3, minvel=20, posw=20.0, seed=0, shift=0, refr=0.1, keys_lo=45, keys_hi=97)
for a in _args:
    k, v = a.split('=')
    if k in P: P[k] = type(P[k])(v)
    elif k in nm.P: nm.P[k] = type(nm.P[k])(v)
KEYS = np.arange(P['keys_lo'], P['keys_hi'])
CTX = P['ctx']


def features(V):
    """log-compressed frames, relative to a slowly decaying peak level."""
    tot = V.sum(axis=0)
    ref = np.empty_like(tot); r = 1e-9
    for t in range(len(tot)):
        r = max(tot[t], r * 0.995); ref[t] = r
    X = np.log1p(1000 * V / (ref[None, :] + 1e-9)).astype(np.float32)  # (bins, T)
    # stack CTX frames ending at t (causal); pad the start
    Xp = np.concatenate([np.repeat(X[:, :1], CTX - 1, axis=1), X], axis=1)
    return np.stack([Xp[:, i:i + X.shape[1]] for i in range(CTX)], axis=0).transpose(2, 0, 1)  # (T, CTX, bins)


def labels(V, ref):
    T = V.shape[1]
    Y = np.zeros((T, len(KEYS)), np.float32)
    center = (np.arange(T) * nm.HOP + nm.N / 2) / nm.SR
    for r in ref:
        if r['vel'] < P['minvel'] or not (KEYS[0] <= r['midi'] <= KEYS[-1]):
            continue
        # the frame whose center is nearest the onset, and the next (causal detection)
        t = int(np.argmin(np.abs(center - r['t'])))
        for dt in (0, 1):
            if t + dt < T: Y[t + dt, r['midi'] - KEYS[0]] = 1
    return Y


class Net(torch.nn.Module):
    def __init__(self, bins):
        super().__init__()
        self.f = torch.nn.Sequential(
            torch.nn.Flatten(), torch.nn.Linear(CTX * bins, P['hidden']), torch.nn.ReLU(),
            torch.nn.Linear(P['hidden'], len(KEYS)))

    def forward(self, x):
        return self.f(x)


def train(items):
    X = np.concatenate([it['X'] for it in items]); Y = np.concatenate([it['Y'] for it in items])
    torch.manual_seed(P['seed'])
    net = Net(X.shape[2])
    opt = torch.optim.Adam(net.parameters(), lr=P['lr'], weight_decay=1e-5)
    lossf = torch.nn.BCEWithLogitsLoss(pos_weight=torch.full((len(KEYS),), P['posw']))
    Xt, Yt = torch.from_numpy(X), torch.from_numpy(Y)
    n = len(Xt)
    for ep in range(P['epochs']):
        perm = torch.randperm(n)
        for i in range(0, n, 512):
            b = perm[i:i + 512]
            # augmentation: random gain (shift in log domain is not exact; scale inputs)
            xb = Xt[b] * (1 + 0.2 * (torch.rand(len(b), 1, 1) - 0.5)); yb = Yt[b]
            if P['shift']:
                # transpose the batch by k semitones: roll bins by k*BPS, keys by k
                k = int(torch.randint(-P['shift'], P['shift'] + 1, (1,)))
                if k:
                    xb = torch.roll(xb, k * nm.BPS, dims=2); yb = torch.roll(yb, k, dims=1)
                    if k > 0: xb[:, :, :k * nm.BPS] = 0; yb[:, :k] = 0
                    else: xb[:, :, k * nm.BPS:] = 0; yb[:, k:] = 0
            loss = lossf(net(xb), yb)
            opt.zero_grad(); loss.backward(); opt.step()
    net.eval()
    return net


def detect_fn(net, thr):
    def detect(V, _W):
        key = ('mlp', id(V))
        if key not in nm._HCACHE:
            with torch.no_grad():
                nm._HCACHE[key] = torch.sigmoid(net(torch.from_numpy(features(V)))).numpy()  # (T, keys)
        Pr = nm._HCACHE[key]
        loud = 20 * np.log10(V.sum(axis=0) + 1e-12)
        notes = []
        for t in range(1, len(Pr) - 1):
            k = int(np.argmax(Pr[t])); p = Pr[t, k]
            if p < thr or loud[t] < nm.P['floor_db']: continue
            if p < Pr[t - 1, k] or p < Pr[t + 1, k]: continue
            tt = (t * nm.HOP + nm.N / 2) / nm.SR
            if notes and tt - notes[-1][0] < P['refr']: continue
            notes.append((tt, int(KEYS[k])))
        return notes
    return detect


def export(net, path):
    """Weights for src/detector.js: int8 with one scale per output unit, base64."""
    import base64, json
    l1, l2 = net.f[1], net.f[3]
    def q(w):
        w = w.detach().numpy().astype(np.float64)
        s = np.abs(w).max(axis=1) / 127 + 1e-12
        return base64.b64encode(np.round(w / s[:, None]).astype(np.int8).tobytes()).decode(), [float(f'{x:.5g}') for x in s]
    W1, s1 = q(l1.weight); W2, s2 = q(l2.weight)
    rnd = lambda v: [float(f'{x:.5g}') for x in v.detach().numpy()]
    json.dump({'lo': nm.LO, 'hi': nm.HI, 'bps': nm.BPS, 'n': nm.N, 'hop': nm.HOP, 'ctx': CTX, 'keys': [int(k) for k in KEYS],
               'hidden': P['hidden'], 'W1': W1, 's1': s1, 'b1': rnd(l1.bias), 'W2': W2, 's2': s2, 'b2': rnd(l2.bias)},
              open(path, 'w'), separators=(',', ':'))


if __name__ == '__main__' and os.environ.get('EXPORT'):
    # EXPORT=out.json: train on all recordings (or split=foldI/K: those with index % K != I)
    files = sorted(f for f in glob.glob(os.path.join(sys.argv[1], '*', '*.mp4')) if os.path.exists(f[:-4] + '.kong.json'))
    split = nm.P.get('split', 'all')
    if split.startswith('fold'):
        i, k = map(int, split[4:].split('/'))
        files = [f for j, f in enumerate(files) if j % k != i]
    # Never train on the held-out recordings (heldout.txt next to the logs
    # dir, as tools/verifier/train.py), nor on paths containing an EXCLUDE
    # substring (comma-separated, e.g. EXCLUDE=2026-10-06 to keep a day unseen).
    hp = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'heldout.txt')
    held = {l.strip() for l in open(hp) if l.strip() and not l.startswith('#')} if os.path.exists(hp) else set()
    excl = [e for e in os.environ.get('EXCLUDE', '').split(',') if e]
    files = [f for f in files if os.path.basename(f)[:-4] not in held and not any(e in f for e in excl)]
    print(f'training on {len(files)} recordings', file=sys.stderr)
    items =[{'X': features(V), 'Y': labels(V, ref)} for f, V, ref in nm.load(files)]
    export(train(items), os.environ['EXPORT'])
    sys.exit(0)

if __name__ == '__main__':
    files = sorted(f for f in glob.glob(os.path.join(sys.argv[1], '*', '*.mp4')) if os.path.exists(f[:-4] + '.kong.json'))
    data = nm.load(files)
    items = [{'f': f, 'V': V, 'ref': ref, 'X': features(V), 'Y': labels(V, ref)} for f, V, ref in data]
    K = P['folds']
    thrs = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
    results = {t: [] for t in thrs}
    for i in range(K):
        tr = [it for j, it in enumerate(items) if j % K != i]
        te = [(it['f'], it['V'], it['ref']) for j, it in enumerate(items) if j % K == i]
        net = train(tr)
        for t in thrs:
            nm.detect = detect_fn(net, t)
            results[t].append(nm.score_raw(te, None))
        nm._HCACHE.clear()
        print(f'fold {i} done', file=sys.stderr, flush=True)
    for t in thrs:
        tot = {k: sum(r[k] for r in results[t]) for k in results[t][0]}
        print(f'thr={t}'.ljust(9), nm.fmt(tot))
