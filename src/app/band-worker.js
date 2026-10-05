// Renders the band off the main thread (see band-render.js).
import { renderBand } from './instruments.js';

onmessage = ({ data: { key, song, members, sr, opts } }) => {
  const { audio, lead } = renderBand(song, members, sr, opts);
  postMessage({ key, audio, lead }, [audio.buffer]);
};
