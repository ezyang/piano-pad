// Experiments: self-contained screens that can come and go. Each is one file
// under screens/ plus one entry here; the home screen shows a card for each
// enabled one, and the grown-ups menu can hide any of them. To remove an
// experiment, delete its entry and its screen file.
import { getState } from './store.js';
import { world } from './screens/world.js';
import { echo } from './screens/echo.js';
import { texture, bandSprite, BAND } from './pixels.js';

export const EXPERIMENTS = [
  {
    id: 'world', title: 'Build!', screen: world,
    card: () => ({ icon: '⛏️', style: `background-image:url(${texture('grass')})` }),
  },
  {
    id: 'echo', title: 'Copy me!', screen: echo,
    card: () => ({ img: bandSprite(BAND.find((m) => m.id === 'slime')), style: 'background:linear-gradient(#27366e,#5a4fa3)' }),
  },
];

export const enabledExperiments = () => EXPERIMENTS.filter((e) => getState().experiments?.[e.id] !== false);

export function setExperimentEnabled(id, on) {
  const st = getState();
  st.experiments = { ...(st.experiments ?? {}), [id]: on };
}
