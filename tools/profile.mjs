// The piano profile (src/piano-profile.json) as the app applies it, for the
// offline tools, so replays match what runs on the iPad (by default: the
// onset network with its classic fallbacks, and the profile's pitch fixes).
//   --no-profile       plain detector, as in the synth bench
//   --profile-onsets   onsets from the profile's templates (the grown-ups
//                      menu's experimental 'profile' detector)
//   --classic          the classic onset detector (default: the profile's network)
import { readFileSync } from 'node:fs';
import { decodeNet } from '../src/detector.js';

export const profile = JSON.parse(readFileSync(new URL('../src/piano-profile.json', import.meta.url), 'utf8'));
const net = profile.net && decodeNet(profile.net);

export function profileOptions(args) {
  if (args.includes('--no-profile')) return {};
  const onsets = args.includes('--profile-onsets') ? 'templates' : args.includes('--classic') || !net ? 'dsp' : 'net';
  return { octaveDown: profile.octaveDown, tuning: profile.tuning ?? {}, templates: profile.templates, net, onsets };
}
