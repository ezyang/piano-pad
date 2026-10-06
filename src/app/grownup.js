// The grown-up's quiet controls, for when the detector misses what she
// played: a TWO-FINGER TAP (→ on a computer) steps on, a TWO-FINGER SWIPE
// RIGHT (←) steps back. Same gestures as homework (screens/adventure.js).
// ignore: a selector for where two fingers are hers, not a grown-up's
// (e.g. a drawing board). Returns a function that removes the listeners.
export function grownupGestures(el, { step, back, ignore }) {
  let swipe = null;
  const xs = (e) => [...e.touches].reduce((s, t) => s + t.clientX, 0) / e.touches.length;
  const onTouch = (e) => { if (e.touches.length === 2 && !(ignore && e.target.closest?.(ignore))) { e.preventDefault(); swipe = { x0: xs(e), x: xs(e) }; } };
  const onMove = (e) => { if (swipe && e.touches.length === 2) swipe.x = xs(e); };
  const onEnd = () => {
    if (!swipe) return;
    const dx = swipe.x - swipe.x0;
    swipe = null;
    if (dx > 60) back?.(); else if (dx > -60) step?.();
  };
  const onCancel = () => { swipe = null; };
  const onKey = (e) => { if (e.key === 'ArrowRight') step?.(); else if (e.key === 'ArrowLeft') back?.(); };
  el.addEventListener('touchstart', onTouch, { passive: false });
  el.addEventListener('touchmove', onMove);
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onCancel);
  addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('touchstart', onTouch);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    removeEventListener('keydown', onKey);
  };
}
