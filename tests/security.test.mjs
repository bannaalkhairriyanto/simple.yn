import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Only site/ is deployed (README: "Deploy hanya folder site/"). Root HTML files are legacy backups.
// The vendored Supabase client is minified third-party code, pinned and licensed; it is excluded from source rules.
const vendor = join(site, 'js', 'vendor');
const allFiles = files(root).filter((path) => !path.includes(`${join('tests', 'security.test.mjs')}`));
const deployFiles = files(site).filter((path) => !path.startsWith(vendor));
const htmlFiles = deployFiles.filter((path) => extname(path) === '.html');
const jsFiles = deployFiles.filter((path) => extname(path) === '.js');

test('HTML has no inline scripts, styles, handlers, or unsafe blank-target links', () => {
  for (const path of htmlFiles) {
    const html = readFileSync(path, 'utf8');
    assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i, path);
    assert.doesNotMatch(html, /<style\b|\sstyle\s*=|\son[a-z]+\s*=/i, path);
    for (const match of html.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
      assert.match(match[0], /\brel\s*=\s*["'][^"']*\bnoopener\b[^"']*\bnoreferrer\b/i, `${path}: ${match[0]}`);
    }
    assert.doesNotMatch(html, /(?:href|src)\s*=\s*["']\s*(?:javascript:|vbscript:|data:text\/html)/i, path);
  }
});

test('published JavaScript has no HTML/code-evaluation sinks or inline style writes', () => {
  for (const path of jsFiles) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval|Function)\b/, path);
    assert.doesNotMatch(source, /\.style\s*\.|\.style\s*\[|\.setAttribute\s*\(\s*["'](?:style|on[a-z]+)/i, path);
    execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
  }
});

for (const path of allFiles.filter((path) => extname(path) === '.json')) {
  test(`valid JSON: ${path.slice(root.length + 1)}`, () => {
    JSON.parse(readFileSync(path, 'utf8'));
  });
}

test('CSP blocks inline/eval and keeps requests same-origin except Google Fonts', () => {
  const headers = readFileSync(join(site, '_headers'), 'utf8');
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
  for (const directive of [
    /default-src 'self'/, /script-src 'self'/, /script-src-attr 'none'/,
    /style-src-attr 'none'/, /connect-src 'self'/, /object-src 'none'/,
    /frame-ancestors 'none'/, /base-uri 'self'/, /form-action 'self'/,
  ]) assert.match(headers, directive);

  const source = deployFiles.filter((path) => ['.html', '.css', '.js'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  const urls = [...source.matchAll(/https?:\/\/[^\s"'<>;)]+/g)].map((match) => match[0]);
  const allowed = new Set([
    'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
    'https://wa.me', 'http://www.w3.org',
  ]);
  // The project's own Supabase origin is configured per deployment, so any *.supabase.co is accepted.
  const supabase = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
  for (const url of urls) {
    const origin = new URL(url).origin;
    assert.ok(allowed.has(origin) || supabase.test(origin), `Unexpected request origin: ${origin}`);
  }
});

test('Markdown only allows encrypted web links and mail links', () => {
  const source = readFileSync(join(site, 'js', 'markdown.js'), 'utf8');
  assert.match(source, /\['https:', 'mailto:'\]/);
  assert.doesNotMatch(source, /'http:'/);
});

test('dashboard logout is wired to Supabase sign-out', () => {
  const html = readFileSync(join(site, 'app', 'index.html'), 'utf8');
  assert.match(html, /id="logout-button"/);
  assert.match(readFileSync(join(site, 'js', 'auth.js'), 'utf8'), /client\.auth\.signOut\(\)/);
});

test('deployed pages only link to files that actually exist', () => {
  const target = (href) => {
    const path = href.split('#')[0].split('?')[0];
    if (path === '/') return join(site, 'index.html');
    if (path.endsWith('/')) return join(site, path.slice(1), 'index.html');
    return join(site, path.slice(1));
  };
  for (const path of htmlFiles) {
    const html = readFileSync(path, 'utf8');
    for (const match of html.matchAll(/(?:href|src)\s*=\s*"(\/[^"]*)"/g)) {
      assert.ok(existsSync(target(match[1])), `${path.slice(root.length + 1)} links to missing ${match[1]}`);
    }
  }
});

test('every referenced SVG sprite icon exists', () => {
  const sprite = readFileSync(join(site, 'img', 'icons.svg'), 'utf8');
  const ids = new Set([...sprite.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const path of [...htmlFiles, ...jsFiles]) {
    for (const match of readFileSync(path, 'utf8').matchAll(/\/img\/icons\.svg#([\w-]+)/g)) {
      assert.ok(ids.has(match[1]), `${path.slice(root.length + 1)} uses unknown icon #${match[1]}`);
    }
  }
});

test('gated pages start closed so nothing renders before auth resolves', () => {
  const appPages = htmlFiles.filter((path) => path.startsWith(join(site, 'app')));
  assert.ok(appPages.length > 0, 'no gated pages found');
  for (const path of appPages) {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /<html[^>]*\bdata-gate="pending"/, path);
    assert.match(html, /\/js\/auth\.js/, path);
  }
});

test('admin navigation stays hidden until the server confirms the admin role', () => {
  const appPages = htmlFiles.filter((path) => path.startsWith(join(site, 'app')));
  for (const path of appPages) {
    const html = readFileSync(path, 'utf8');
    const links = [...html.matchAll(/<a\b[^>]*href="\/app\/admin\.html"[^>]*>/g)].map((match) => match[0]);
    if (!html.includes('class="side-nav"')) continue;
    assert.ok(links.length > 0, `${path.slice(root.length + 1)} lost the admin link`);
    for (const tag of links) {
      assert.match(tag, /\bdata-admin-only\b/, path);
      assert.match(tag, /\bhidden\b/, `${path.slice(root.length + 1)} admin link must default to hidden`);
    }
  }
  assert.match(readFileSync(join(site, 'js', 'auth.js'), 'utf8'), /querySelectorAll\('\[data-admin-only\]'\)/);
});

test('config.js and the CSP agree on one Supabase origin and no secret key', () => {
  const config = readFileSync(join(site, 'js', 'config.js'), 'utf8');
  const url = config.match(/supabaseUrl:\s*'([^']+)'/);
  assert.ok(url, 'supabaseUrl missing from config.js');
  const origin = new URL(url[1]).origin;

  const headers = readFileSync(join(site, '_headers'), 'utf8');
  const connect = headers.match(/connect-src([^;]+)/i);
  assert.ok(connect, 'connect-src missing from _headers');
  assert.ok(connect[1].includes(origin), `connect-src does not allow ${origin}`);
  assert.match(headers, /strict-transport-security:\s*max-age=\d+/i);
  assert.match(headers, /\/js\/\*[\s\S]*?cache-control:\s*[^\n]*must-revalidate/i);
  assert.match(headers, /\/css\/\*[\s\S]*?cache-control:\s*[^\n]*must-revalidate/i);
  assert.doesNotMatch(config, /service_role|sb_secret_/);
});

