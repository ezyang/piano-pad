"""Train the verifier: is there a new piano strike of this candidate's pitch
(letter) at its time? See PianoDetector._vfeat / Verifier in src/detector.js.

    .venv/bin/python tools/verifier/train.py <data dir> <out.json> [--hold ids.txt] [--epochs 40] [--cands dir] [--seed n]
    .venv/bin/python tools/verifier/train.py <data dir> - --oof 5 oof.jsonl [--seeds 2] [--cands dir]

<data dir> is ~/Dev/piano-audio-data: verifier/cands/ (tools/verifier/dump.mjs),
logs/ (sessions, recordings, Kong .kong.json), labels-*/ (parent labels).
--hold: recording ids (one per line) to leave out of training (for folds).
<data dir>/heldout.txt: recordings never used at all (acceptance/dev/test).

Targets, strongest source first:
  - whole-session parent labels (label/make-session.mjs): every key press
    known; everything else is not a strike.
  - parent-labeled moments (label/make-clips.mjs): candidates near a moment.
  - prompted takes (calibration, grown-up homework): Kong's onsets matched
    in order to the prompt's letters are strikes; talk-only takes have none.
  - otherwise Kong (weak): same letter within TOL = yes; no Kong onset near
    = no (half weight: the teacher's silence isn't proof).
"""
import glob, json, os, random, sys
import numpy as np
import torch
import torch.nn as nn

TOL = 0.06  # s: a candidate this close to a strike is "at" it
args = sys.argv[1:]
DATA, OUT = args[0], args[1]
hold = set(open(args[args.index('--hold') + 1]).read().split()) if '--hold' in args else set()
# Recordings kept for evaluation only (acceptance/dev/test), never trained on.
_ho = os.path.join(DATA, 'heldout.txt')
HELDOUT = {l.strip() for l in open(_ho) if l.strip() and not l.startswith('#')} if os.path.exists(_ho) else set()
CANDS = args[args.index('--cands') + 1] if '--cands' in args else os.path.join(DATA, 'verifier', 'cands')
EPOCHS = int(args[args.index('--epochs') + 1]) if '--epochs' in args else 40
SEED = int(args[args.index('--seed') + 1]) if '--seed' in args else 0
random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
pc = lambda m: int(m) % 12

# --- parent labels -----------------------------------------------------
def answers(d):
    lab = {}
    p = os.path.join(d, 'labels.jsonl')
    if os.path.exists(p):
        for line in open(p):
            if line.strip():
                r = json.loads(line); lab[r['id']] = r
    return lab

full = {}     # session id -> (strikes [(t, pc or None)], ignore [t])
moments = {}  # session id -> [(t, 'yes'|'no'|..., pc or None)]
for d in sorted(glob.glob(os.path.join(DATA, 'labels-*'))):
    if not os.path.exists(os.path.join(d, 'manifest.json')):
        continue
    man = json.load(open(os.path.join(d, 'manifest.json')))
    lab = answers(d)
    if not man or not lab:
        continue
    if man[0].get('kind') in ('cand', 'gap'):  # whole sessions, or excerpts (steps with `win`)
        groups = {}
        for c in man:
            groups.setdefault((c['session'], tuple(c.get('win') or (-1e9, 1e9))), []).append(c)
        for (sess, win), steps in groups.items():
            if not all(c['id'] in lab for c in steps):
                continue  # only finished excerpts: elsewhere a missing answer isn't a "no"
            strikes, ignore = [], []
            for c in steps:
                l = lab[c['id']]
                if c['kind'] != 'cand':
                    continue
                if l['strike'] == 'yes':
                    strikes.append((c['t'], pc(l['note']) if str(l.get('note', '')).isdigit() else None))
                elif l['strike'] in ('hard', 'mess', 'unsure'):
                    ignore.append(c['t'])
            full.setdefault(sess, []).append((win, strikes, ignore))
    elif 't' in man[0]:  # disputed moments
        for c in man:
            l = lab.get(c['id'])
            if l:
                moments.setdefault(c['session'], []).append((c['t'], l['strike'], pc(l['note']) if str(l.get('note', '')).isdigit() else None))

# --- sessions and Kong ---------------------------------------------------
sessions, kong = {}, {}
for j in glob.glob(os.path.join(DATA, 'logs', '*', '*.json')):
    if j.endswith('.kong.json'):
        kong[os.path.basename(j)[:-10]] = [r for r in json.load(open(j)) if r['vel'] >= 20]
    else:
        try:
            s = json.load(open(j)); sessions[s['id']] = s
        except Exception:
            pass

def prompted(s):
    """Strike times for a take where a grown-up played the prompt: Kong's
    onsets matched in order to the asked letters (LCS). None if not a take."""
    kind = s.get('kind'); player = str(s.get('player', {}).get('name') if isinstance(s.get('player'), dict) else s.get('player'))
    if kind == 'calibration':
        if str(s.get('calibration', '')).startswith('m-'):
            return None  # messy prompts: the parent improvised
        if s.get('calibration') in ('talk', 'talk-kid'):
            return []
    elif not (kind == 'homework' and 'grown' in player):
        return None
    asked = [pc(n['p']) for n in (s.get('song') or {}).get('notes', []) if n.get('p') is not None]
    ks = sorted(kong.get(s['id'], []), key=lambda r: r['t'])
    if not asked or not ks:
        return [] if not asked else None
    n, m = len(asked), len(ks)
    L = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for k in range(m - 1, -1, -1):
            L[i][k] = L[i + 1][k + 1] + 1 if asked[i] == pc(ks[k]['midi']) else max(L[i + 1][k], L[i][k + 1])
    out, i, k = [], 0, 0
    while i < n and k < m:
        if asked[i] == pc(ks[k]['midi']) and L[i][k] == L[i + 1][k + 1] + 1:
            out.append((ks[k]['t'], asked[i])); i += 1; k += 1
        elif L[i + 1][k] >= L[i][k + 1]:
            i += 1
        else:
            k += 1
    return out

def label(sid, cands):
    """-> list of (y_strike, y_pitch, weight, source) per candidate."""
    s = sessions.get(sid, {})
    ks = kong.get(sid, [])
    near = lambda t, xs: [x for x in xs if abs(x[0] - t) < TOL]
    def by_full(c):
        for win, strikes, ignore in full.get(sid, []):
            if not (win[0] <= c['t'] < win[1]):
                continue
            if any(abs(t - c['t']) < TOL for t in ignore):
                return (0, 0, 0.0, 'full')
            ns = near(c['t'], strikes)
            return (int(bool(ns)), int(any(p is None or p == pc(c['midi']) for _, p in ns)), 0.0 if any(p is None for _, p in ns) else 3.0, 'full')
        return None
    pr = prompted(s)
    out = []
    for c in cands:
        f = by_full(c)
        if f:
            out.append(f); continue
        mom = [m for m in moments.get(sid, []) if abs(m[0] - c['t']) < 0.08]
        if mom:
            _, a, p = mom[0]
            if a == 'yes' and p is not None:
                out.append((1, int(p == pc(c['midi'])), 3.0, 'moment')); continue
            if a == 'no':
                out.append((0, 0, 3.0, 'moment')); continue
            out.append((0, 0, 0.0, 'moment')); continue
        if pr is not None:
            ns = near(c['t'], pr)
            if ns:
                out.append((1, int(any(p == pc(c['midi']) for _, p in ns)), 2.0, 'prompt')); continue
            kn = [r for r in ks if abs(r['t'] - c['t']) < TOL]
            out.append((0, 0, 0.0 if kn else 2.0, 'prompt')); continue  # unmatched Kong: ghost or slip
        kn = [r for r in ks if abs(r['t'] - c['t']) < TOL]
        if kn:
            out.append((1, int(any(pc(r['midi']) == pc(c['midi']) for r in kn)), 1.0, 'kong'))
        else:
            far = not any(abs(r['t'] - c['t']) < 0.1 for r in ks)
            out.append((0, 0, 0.5 if far else 0.0, 'kong'))
    return out

# --- load candidates ---------------------------------------------------------
X, S, Y, W, G, SRC, META = [], [], [], [], [], [], []
for j in sorted(glob.glob(os.path.join(CANDS, '*.json'))):
    d = json.load(open(j)); sid = d['id']
    if not d['cands'] or sid in HELDOUT:
        continue
    raw = np.fromfile(j[:-5] + '.f32', dtype=np.float32)
    C, Sn = d['cands'][0]['C'], d['cands'][0]['S']
    raw = raw.reshape(len(d['cands']), C + Sn)
    for c, r, (ys, yp, w, src) in zip(d['cands'], raw, label(sid, d['cands'])):
        X.append(r[:C]); S.append(r[C:]); Y.append((ys, yp)); W.append(w); G.append(sid); SRC.append(src); META.append(c)
X = np.stack(X); S = np.stack(S); Y = np.array(Y, np.float32); W = np.array(W, np.float32); G = np.array(G)
CH, T = 49, X.shape[1] // 49
X = X.reshape(-1, CH, T)
train = np.array([g not in hold for g in G]) & (W > 0)
test = np.array([g in hold for g in G]) & (W > 0)
print(f'candidates {len(X)}: train {train.sum()} (pos {Y[train, 1].sum():.0f}), held out {test.sum()} (pos {Y[test, 1].sum():.0f})')
for src in ('full', 'moment', 'prompt', 'kong'):
    m = np.array([s == src for s in SRC]) & (W > 0)
    print(f'  {src:7s} {m.sum():6d} labeled, strikes {Y[m, 0].sum():.0f}, right-letter {Y[m, 1].sum():.0f}')

# --- model -------------------------------------------------------------
class Net(nn.Module):
    def __init__(self, C, T, Sn, H=24, D=32):
        super().__init__()
        self.convs = nn.ModuleList([nn.Conv1d(C, H, 5, dilation=1), nn.Conv1d(H, H, 5, dilation=2), nn.Conv1d(H, H, 5, dilation=4)])
        To = T - 4 * (1 + 2 + 4)
        self.drop = nn.Dropout(0.2)
        self.fc1 = nn.Linear(H * To + Sn, D); self.fc2 = nn.Linear(D, 2)
    def forward(self, x, s):
        for c in self.convs:
            x = torch.relu(c(x))
        h = torch.cat([x.flatten(1), s], 1)
        return self.fc2(torch.relu(self.fc1(self.drop(h))))

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
bce = nn.BCEWithLogitsLoss(reduction='none')

def fit(mask, quiet=False):
    net = Net(CH, T, S.shape[1]).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-3)
    Xt, St, Yt, Wt = (torch.tensor(a[mask]) for a in (X, S, Y, W))
    idx = np.arange(len(Xt))
    for ep in range(EPOCHS):
        net.train(); np.random.shuffle(idx); tot = 0
        for b in range(0, len(idx), 256):
            k = idx[b:b + 256]
            x = Xt[k].to(dev) + 0.02 * torch.randn_like(Xt[k]).to(dev)
            o = net(x, St[k].to(dev))
            l = (bce(o, Yt[k].to(dev)) * torch.tensor([0.5, 1.0], device=dev)).sum(1)
            loss = (l * Wt[k].to(dev)).sum() / Wt[k].sum()
            opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item() * len(k)
        if not quiet and (ep % 10 == 9 or ep == EPOCHS - 1):
            print(f'epoch {ep + 1}: loss {tot / len(idx):.4f}')
    return net.eval()

def predict(net, mask):
    with torch.no_grad():
        return torch.sigmoid(net(torch.tensor(X[mask]).to(dev), torch.tensor(S[mask]).to(dev))[:, 1]).cpu().numpy()

# --oof K out.jsonl: out-of-fold chances for every labeled candidate (K
# folds by recording; `--seeds n` models per fold), to find labels the
# model keeps contradicting (possible label errors).
if '--oof' in args:
    K, oof = int(args[args.index('--oof') + 1]), args[args.index('--oof') + 2]
    nseeds = int(args[args.index('--seeds') + 1]) if '--seeds' in args else 2
    ids = sorted(set(G)); random.Random(0).shuffle(ids)
    fold = {g: i % K for i, g in enumerate(ids)}
    F = np.array([fold[g] for g in G]); P = np.zeros((len(X), nseeds))
    for f in range(K):
        for sd in range(nseeds):
            torch.manual_seed(100 * f + sd); np.random.seed(100 * f + sd)
            net = fit((F != f) & (W > 0), quiet=True)
            P[F == f, sd] = predict(net, F == f)
        print(f'fold {f + 1}/{K} done')
    with open(oof, 'w') as fh:
        for i in np.where(W > 0)[0]:
            c = META[i]
            fh.write(json.dumps({'id': str(G[i]), 't': c['t'], 'midi': c['midi'], 'via': c['via'], 'reject': c['reject'], 'src': SRC[i], 'w': float(W[i]),
                                 'y': [int(Y[i, 0]), int(Y[i, 1])], 'p': [round(float(v), 4) for v in P[i]]}) + '\n')
    print('wrote', oof)
    sys.exit(0)

net = fit(train)
prob = lambda mask: predict(net, mask)
if test.any():
    p, y = prob(test), Y[test, 1]
    order = np.argsort(-p); tp = np.cumsum(y[order]); fp = np.cumsum(1 - y[order])
    auc = np.trapezoid(tp / max(1, y.sum()), fp / max(1, (1 - y).sum()))
    print(f'held-out AUC {auc:.3f}')
    for thr in (0.3, 0.5, 0.7):
        a = p >= thr
        print(f'  thr {thr}: accept {a.sum()}, right-letter kept {(a & (y == 1)).sum()}/{int(y.sum())}, wrong kept {(a & (y == 0)).sum()}/{int((1 - y).sum())}')

m = {'C': CH, 'T': T, 'S': int(S.shape[1]), 'convs': [], 'hold': sorted(hold), 'epochs': EPOCHS, 'seed': SEED}
for c in net.convs:
    m['convs'].append({'cin': c.in_channels, 'cout': c.out_channels, 'k': c.kernel_size[0], 'dil': c.dilation[0],
                       'w': [round(float(v), 6) for v in c.weight.detach().cpu().flatten()], 'b': [round(float(v), 6) for v in c.bias.detach().cpu()]})
for name in ('fc1', 'fc2'):
    L = getattr(net, name); k = 'W1' if name == 'fc1' else 'W2'; b = 'b1' if name == 'fc1' else 'b2'
    m[k] = [round(float(v), 6) for v in L.weight.detach().cpu().flatten()]; m[b] = [round(float(v), 6) for v in L.bias.detach().cpu()]
json.dump(m, open(OUT, 'w'))
# A few candidates with the model's output, to check the JS port.
chk = [{'i': int(i), 'id': str(G[i]), 't': META[i]['t'], 'p': float(prob(np.isin(np.arange(len(X)), [i]))[0])} for i in np.random.RandomState(1).choice(len(X), 5, replace=False)]
json.dump(chk, open(OUT.replace('.json', '.check.json'), 'w'))
print('wrote', OUT)
