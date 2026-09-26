// The piano profile (src/piano-profile.json) as the app applies it, for the
// offline tools, so replays match what runs on the iPad.
//   --no-profile       plain detector, as in the synth bench
//   --profile-onsets   also onsets from the profile's templates (the
//                      grown-ups menu's experimental 'profile' detector)
import { readFileSync } from 'node:fs';

export const profile = JSON.parse(readFileSync(new URL('../src/piano-profile.json', import.meta.url), 'utf8'));

export function profileOptions(args) {
  if (args.includes('--no-profile')) return {};
  return {
    octaveDown: profile.octaveDown,
    ...(args.includes('--profile-onsets') ? { onsets: 'templates', templates: profile.templates } : {}),
  };
}
