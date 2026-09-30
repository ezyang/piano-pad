// The piano profile (src/piano-profile.json) as the app applies it, for the
// offline tools, so replays match what runs on the iPad (by default: the
// onset network with its classic fallbacks, and the profile's pitch fixes).
//   --no-profile       plain detector, as in the synth bench
//   --profile-onsets   onsets from the profile's templates (the grown-ups
//                      menu's experimental 'profile' detector)
//   --classic          the classic onset detector (default: the profile's network)
//   --verified         turn on the profile's verifier (the grown-ups menu's
//                      'verified' detector)
//   --verifier <m.json> turn on this verifier model (tools/verifier/train.py)
//   --net <net.json>   this onset network instead of the profile's
import { readFileSync } from 'node:fs';
import { decodeNet, decodeVerifier } from '../src/detector.js';

export const profile = JSON.parse(readFileSync(new URL('../src/piano-profile.json', import.meta.url), 'utf8'));
const defaultNet = profile.net && decodeNet(profile.net);

export function profileOptions(args) {
  if (args.includes('--no-profile')) return {};
  const onsets = args.includes('--profile-onsets') ? 'templates' : args.includes('--classic') || !defaultNet ? 'dsp' : 'net';
  const ni = args.indexOf('--net'), net = ni >= 0 ? decodeNet(JSON.parse(readFileSync(args[ni + 1], 'utf8'))) : defaultNet;
  const vi = args.indexOf('--verifier'), vm = vi >= 0 ? JSON.parse(readFileSync(args[vi + 1], 'utf8')) : args.includes('--verified') ? profile.verifier : null;
  return { octaveDown: profile.octaveDown, tuning: profile.tuning ?? {}, templates: profile.templates, net, onsets, ...(vm && onsets === 'net' ? { verifier: decodeVerifier(vm) } : {}) };
}
