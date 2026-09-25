// Tiny DOM helpers.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

// Restart a CSS animation class on an element.
export function flash(el, cls, ms = 600) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
}

// Burst of pixel particles at a point inside `parent`.
export function sparkle(parent, x, y, colors = ['#fff6a8', '#ffd84a', '#ffffff'], n = 10) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + Math.random() * 0.5;
    const d = 30 + Math.random() * 40;
    const p = h('div', { class: 'particle', style: `left:${x}px;top:${y}px;background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 20}px` });
    parent.append(p);
    setTimeout(() => p.remove(), 700);
  }
}
