// Build the deployed site: today's app at the root, plus a frozen copy of
// every earlier version, so any past app is one URL away without a redeploy.
//
//   /                 the app at HEAD
//   /v/               list of every version (newest first)
//   /v/<sha>/         the app as of that commit (7-char sha)
//   /v/<YYYY-MM-DD>/  the last version of that day (redirects to /v/<sha>/)
//
// Each copy is `git archive` of its commit, so old versions are rebuilt
// identically on every deploy. index.html gets <meta name="piano-version">
// (read by telemetry and the ⚙︎ menu); old copies are also retitled so a
// home-screen install of one is distinguishable from today's.
//
// All versions share one origin, so they share localStorage (her songs and
// character carry over). Keep store.js readable by older versions.
//
//   node tools/build-site.mjs [outDir=_site]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? '_site';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

// Oldest first; keep only commits that have the app.
const commits = git('log', '--first-parent', '--reverse', '--format=%h%x09%H%x09%cI%x09%s', 'HEAD')
  .trim().split('\n').map((line) => {
    const [sha, full, date, subject] = line.split('\t');
    return { sha, full, date, day: date.slice(0, 10), subject };
  })
  .filter((c) => git('ls-tree', '--name-only', c.full, 'index.html').trim());
const head = commits.at(-1);

const escape = (s) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const shortDate = (c) => new Date(c.day + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function extract(c, dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('tar', ['-x', '-C', dir], { input: execFileSync('git', ['archive', c.full], { maxBuffer: 1 << 28 }) });
  const file = join(dir, 'index.html');
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<head>/i, `<head>\n<meta name="piano-version" content="${c.sha} ${c.date}">`);
  if (c !== head) {
    const label = `Piano Pad ${shortDate(c)}`;
    html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escape(label)} (${c.sha})</title>`)
      .replace(/(name="apple-mobile-web-app-title" content=")[^"]*/i, `$1${escape(label)}`);
  }
  writeFileSync(file, html);
}

rmSync(out, { recursive: true, force: true });
extract(head, out);
for (const c of commits) extract(c, join(out, 'v', c.sha));

// Day aliases: the last commit of each day wins.
const lastOfDay = new Map(commits.map((c) => [c.day, c]));
for (const [day, c] of lastOfDay) {
  const dir = join(out, 'v', day);
  if (existsSync(dir)) throw new Error(`${day} collides with a sha`);
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=../${c.sha}/">
<script>location.replace('../${c.sha}/' + location.hash);</script>
<a href="../${c.sha}/">${c.sha}</a>\n`);
}

const rows = [];
let day = null;
for (const c of [...commits].reverse()) {
  if (c.day !== day) {
    day = c.day;
    rows.push(`<h2><a href="${day}/">${new Date(day + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</a></h2>`);
  }
  const time = c.date.slice(11, 16);
  rows.push(`<a class="v" href="${c.sha}/"><span class="t">${time}</span> <code>${c.sha}</code> ${escape(c.subject)}${c === head ? ' <b>(today’s app)</b>' : ''}</a>`);
}
writeFileSync(join(out, 'v', 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Piano Pad versions</title>
<style>
  :root { color-scheme: light dark; --bg: #fdfaf5; --ink: #222; --dim: #777; --line: #e4ddd2; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1d1a17; --ink: #eee; --dim: #999; --line: #3a342d; } }
  body { background: var(--bg); color: var(--ink); font: 17px/1.4 -apple-system, system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 26px; margin: 8px 0; }
  h2 { font-size: 17px; margin: 28px 0 6px; }
  a { color: inherit; }
  .v { display: block; padding: 12px 4px; border-top: 1px solid var(--line); text-decoration: none; }
  .t, p { color: var(--dim); }
  .now { display: inline-block; margin: 8px 0; padding: 12px 18px; border: 2px solid currentColor; border-radius: 10px; font-weight: 700; text-decoration: none; }
</style></head><body>
<h1>Piano Pad versions</h1>
<a class="now" href="../">← Today’s app</a>
<p>Every version of the app stays here. Songs and her character are shared by
all of them. The home-screen app has no back button, so open old versions in
Safari. To keep one for a while, open it and use Share → Add to Home Screen.
A version’s address is <code>piano.ezyang.com/v/&lt;code&gt;/</code>, or
<code>/v/&lt;date&gt;/</code> for the last version of a day.</p>
${rows.join('\n')}
</body></html>\n`);

console.log(`${out}: ${head.sha} at /, ${commits.length} versions under /v/`);
