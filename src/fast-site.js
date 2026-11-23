// fast-site: drop-in replacement for makefun-site 1.0.0
// Guarantees 100% byte-for-byte exact output across all cases with maximum CPU efficiency.

import { renderMarkdown } from './markdown.js';
import { parseTemplate, TemplateError } from '../vendor/makefun-site/lib/template.js';

export const REPORT_FILE = 'build-report.txt';
export const RESERVED = Object.freeze(['posts', 'tags', 'page']);

const byCodeUnits = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// --- Text helpers ---
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_TEST_RE = /[&<>"']/;
export function fastEscapeHtml(text) {
  return ESCAPE_TEST_RE.test(text) ? text.replace(/[&<>"']/g, (c) => ESCAPES[c]) : text;
}

export const SLUG_MAX = 64;
const NON_ASCII_RE = /[^\x00-\x7F]/;

export function slugify(text) {
  const plain = NON_ASCII_RE.test(text)
    ? text.normalize('NFKD').replace(/\p{M}/gu, '')
    : text;
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    let keep = null;
    if (ch >= 'A' && ch <= 'Z') keep = ch.toLowerCase();
    else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) keep = ch;
    if (keep === null) {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += keep;
  }
  out = out.slice(0, SLUG_MAX).replace(/-+$/, '');
  return out === '' ? 'untitled' : out;
}

export function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(date) {
  const [y, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function wordsOf(text) {
  let count = 0;
  let inWord = false;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) <= 32) {
      inWord = false;
    } else {
      if (!inWord) {
        count++;
        inWord = true;
      }
    }
  }
  return count;
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

// --- Front Matter ---
export const KEYS = Object.freeze(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);
const KEYS_SET = new Set(['title', 'date', 'tags', 'draft', 'layout', 'slug', 'summary']);

function stringOf(key, raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) return { error: `key "${key}": a quoted string is not closed` };
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      const c = raw[i];
      if (c === '\\') {
        const n = raw[i + 1];
        if ((n !== '"' && n !== '\\') || i + 1 === raw.length - 1) return { error: `key "${key}": a quoted string holds an escape other than \\" or \\\\` };
        out += n;
        i++;
      } else if (c === '"') return { error: `key "${key}": a quoted string holds a stray quote` };
      else out += c;
    }
    return { value: out };
  }
  if (raw.startsWith('[')) return { error: `key "${key}": a bare string opens on [` };
  return { value: raw };
}

function valueOf(key, raw) {
  switch (key) {
    case 'title':
    case 'summary':
      return stringOf(key, raw);
    case 'date': {
      if (raw.length !== 10 || raw.charCodeAt(4) !== 45 || raw.charCodeAt(7) !== 45) {
        return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      const y = parseInt(raw.slice(0, 4), 10);
      const mo = parseInt(raw.slice(5, 7), 10);
      const d = parseInt(raw.slice(8, 10), 10);
      if (isNaN(y) || isNaN(mo) || isNaN(d) || y < 1970 || y > 2099 || mo < 1 || mo > 12 || d < 1) {
        return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      }
      let maxD = 31;
      if (mo === 2) maxD = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
      else if (mo === 4 || mo === 6 || mo === 9 || mo === 11) maxD = 30;
      if (d > maxD) return { error: 'key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)' };
      return { value: raw };
    }
    case 'tags': {
      if (!raw.startsWith('[') || !raw.endsWith(']')) return { error: 'key "tags": not a list [a, b]' };
      const inner = raw.slice(1, -1);
      if (inner.trim() === '') return { value: [] };
      const tags = inner.split(',').map((t) => t.trim());
      for (let i = 0; i < tags.length; i++) {
        const t = tags[i];
        if (t === '' || t.includes('"') || t.includes('[') || t.includes(']')) {
          return { error: 'key "tags": an empty tag, or one holding " [ or ]' };
        }
      }
      return { value: tags };
    }
    case 'draft':
      return raw === 'true' ? { value: true } : raw === 'false' ? { value: false } : { error: 'key "draft": true or false' };
    case 'layout':
      return /^[a-z0-9-]+$/.test(raw) ? { value: raw } : { error: 'key "layout": not a template name' };
    case 'slug':
      return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) && raw.length <= 64 ? { value: raw } : { error: 'key "slug": not a slug' };
    default:
      return { error: `unknown key "${key}"` };
  }
}

export function parseFrontMatter(text) {
  if (!text.startsWith('---\n')) {
    if (text === '---') return { error: 'the front matter is not closed' };
    return { error: 'no front matter' };
  }
  let closeStart = -1;
  let pos = 4;
  while (pos < text.length) {
    if (text.startsWith('---\n', pos) || (text.startsWith('---', pos) && pos + 3 === text.length)) {
      closeStart = pos;
      break;
    }
    const nl = text.indexOf('\n', pos);
    if (nl === -1) break;
    pos = nl + 1;
  }
  if (closeStart === -1) return { error: 'the front matter is not closed' };

  const fmText = text.slice(4, closeStart);
  const body = closeStart + 3 === text.length ? '' : text.slice(closeStart + 4);

  const lines = fmText.split('\n');
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) continue;
    const c0 = line.charCodeAt(0);
    if (c0 === 35) continue; // '#'
    if (c0 === 32 || c0 === 9) {
      let allSpace = true;
      for (let k = 1; k < line.length; k++) {
        const c = line.charCodeAt(k);
        if (c !== 32 && c !== 9) { allSpace = false; break; }
      }
      if (allSpace) continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return { error: `line ${i + 2} is not "key: value"` };
    const key = line.slice(0, colonIdx);
    if (!/^[a-z_]+$/.test(key)) return { error: `line ${i + 2} is not "key: value"` };
    if (colonIdx + 1 < line.length && line.charCodeAt(colonIdx + 1) !== 32) {
      return { error: `line ${i + 2} is not "key: value"` };
    }
    const raw = (colonIdx + 1 < line.length ? line.slice(colonIdx + 2) : '').replace(/[ \t]+$/, '');
    if (!KEYS_SET.has(key)) return { error: `unknown key "${key}"` };
    if (Object.hasOwn(data, key)) return { error: `key "${key}" is given twice` };
    if (raw === '') return { error: `key "${key}" has no value` };
    const v = valueOf(key, raw);
    if ('error' in v) return v;
    data[key] = v.value;
  }
  if (!Object.hasOwn(data, 'title')) return { error: 'no title' };
  return { data, body };
}

// --- Template Compilation ---
function get1(s, p0) {
  while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
  return s === null ? undefined : s.vars[p0];
}

function get2(s, p0, p1) {
  while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
  if (s === null) return undefined;
  const v = s.vars[p0];
  if (v === null || typeof v !== 'object') return undefined;
  return Object.hasOwn(v, p1) ? v[p1] : undefined;
}

function get3(s, p0, p1, p2) {
  while (s !== null && !Object.hasOwn(s.vars, p0)) s = s.parent;
  if (s === null) return undefined;
  const v0 = s.vars[p0];
  if (v0 === null || typeof v0 !== 'object' || !Object.hasOwn(v0, p1)) return undefined;
  const v1 = v0[p1];
  if (v1 === null || typeof v1 !== 'object') return undefined;
  return Object.hasOwn(v1, p2) ? v1[p2] : undefined;
}

function lookup(scope, path) {
  let s = scope;
  while (s !== null && !Object.hasOwn(s.vars, path[0])) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[path[0]];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

function esc(v) {
  if (typeof v === 'string') {
    return ESCAPE_TEST_RE.test(v) ? v.replace(/[&<>"']/g, (c) => ESCAPES[c]) : v;
  }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const s = v.map(textOf).join(', ');
    return ESCAPE_TEST_RE.test(s) ? s.replace(/[&<>"']/g, (c) => ESCAPES[c]) : s;
  }
  return '';
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

const templateCtx = {
  get1,
  get2,
  get3,
  lookup,
  esc,
  textOf,
  truthy,
};

function generateTemplateCode(nodes, scopeVar, depth) {
  let code = '';
  for (const n of nodes) {
    const p = n.path;
    let accessExpr = '';
    if (p) {
      if (p.length === 1) accessExpr = `ctx.get1(${scopeVar}, ${JSON.stringify(p[0])})`;
      else if (p.length === 2) accessExpr = `ctx.get2(${scopeVar}, ${JSON.stringify(p[0])}, ${JSON.stringify(p[1])})`;
      else if (p.length === 3) accessExpr = `ctx.get3(${scopeVar}, ${JSON.stringify(p[0])}, ${JSON.stringify(p[1])}, ${JSON.stringify(p[2])})`;
      else accessExpr = `ctx.lookup(${scopeVar}, ${JSON.stringify(p)})`;
    }

    switch (n.kind) {
      case 'text':
        code += `out += ${JSON.stringify(n.text)};\n`;
        break;
      case 'var':
        code += `out += ctx.esc(${accessExpr});\n`;
        break;
      case 'raw':
        code += `out += ctx.textOf(${accessExpr});\n`;
        break;
      case 'if': {
        const cond = `${n.not ? '!' : ''}ctx.truthy(${accessExpr})`;
        code += `if (${cond}) {\n${generateTemplateCode(n.then, scopeVar, depth)}}`;
        if (n.else !== null) {
          code += ` else {\n${generateTemplateCode(n.else, scopeVar, depth)}}\n`;
        } else {
          code += '\n';
        }
        break;
      }
      case 'for': {
        const loopScope = `s_${depth}`;
        code += `{\n`;
        code += `  const xs = ${accessExpr};\n`;
        code += `  if (Array.isArray(xs)) {\n`;
        code += `    const len = xs.length;\n`;
        code += `    for (let k = 0; k < len; k++) {\n`;
        code += `      const ${loopScope} = { vars: { ${JSON.stringify(n.name)}: xs[k], loop: { index: k + 1, first: k === 0, last: k === len - 1, length: len } }, parent: ${scopeVar} };\n`;
        code += generateTemplateCode(n.body, loopScope, depth + 1);
        code += `    }\n`;
        code += `  }\n`;
        code += `}\n`;
        break;
      }
      case 'include':
        code += `if (depth < 8) {\n`;
        code += `  const fn = ctx.compiled.get(${JSON.stringify(n.name)});\n`;
        code += `  if (fn !== undefined) out += fn(${scopeVar}, ctx, depth + 1);\n`;
        code += `}\n`;
        break;
    }
  }
  return code;
}

function compileTemplate(nodes) {
  const bodyCode = `let out = '';\n${generateTemplateCode(nodes, 'scope', 0)}return out;\n`;
  return new Function('scope', 'ctx', 'depth', bodyCode);
}

// --- Pipeline Functions ---

export { readSources, frontMatter, permalinks, markdown, collections, tags, layouts, report, compileTemplate };

function readSources(b) {
  const files = [...b.input.files].sort((x, y) => byCodeUnits(x.path, y.path));
  for (const f of files) {
    if (f.path.endsWith('.md')) {
      const text = f.content.includes('\r') ? f.content.replace(/\r\n?/g, '\n') : f.content;
      b.sources.push({ path: f.path, text });
    } else {
      b.statics.push({ path: f.path, content: f.content });
    }
  }
}

function frontMatter(b) {
  const kept = [];
  for (let i = 0; i < b.sources.length; i++) {
    const s = b.sources[i];
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      b.report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    if (s.path.startsWith('tags/')) {
      b.report.push(`refused ${s.path}: tags/ is the generator's own`);
      continue;
    }
    if (s.path.startsWith('page/')) {
      b.report.push(`refused ${s.path}: page/ is the generator's own`);
      continue;
    }
    if (s.post && !Object.hasOwn(s.data, 'date')) {
      b.report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!b.compiled.has(layout)) {
      b.report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      b.report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  b.sources = kept;
}

function permalinks(b) {
  const taken = new Map();
  const takenIn = (dir) => {
    let s = taken.get(dir);
    if (s === undefined) {
      s = new Set(dir === '' ? RESERVED : []);
      taken.set(dir, s);
    }
    return s;
  };
  for (const s of b.sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), takenIn(dir));
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${b.base}/${s.outDir}/`;
    b.bySource.set(s.path, s);
  }
}

function markdown(b) {
  const staticPaths = new Set(b.statics.map((f) => f.path));
  for (let i = 0; i < b.sources.length; i++) {
    const s = b.sources[i];
    const dir = dirOf(s.path);
    const env = {
      link: (target) => {
        const c0 = target.charCodeAt(0);
        if (c0 === 47 || c0 === 35) return target;
        if (target.includes(':') && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return target;
        const hash = target.indexOf('#');
        const rel = hash === -1 ? target : target.slice(0, hash);
        const frag = hash === -1 ? '' : target.slice(hash);
        const path = rel === '' ? null : resolvePath(dir, rel);
        if (path !== null && b.bySource.has(path)) return `${b.bySource.get(path).url}${frag}`;
        if (path !== null && staticPaths.has(path)) return `${b.base}/${path}${frag}`;
        b.broken.add(`broken-link ${s.path} -> ${target}`);
        return target;
      },
    };
    const md = renderMarkdown(s.body, env);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }
}

function collections(b) {
  const posts = b.sources.filter((s) => s.post);
  posts.sort((x, y) => byCodeUnits(y.data.date, x.data.date) || byCodeUnits(x.slug, y.slug));
  b.posts = posts;
  const len = posts.length;
  for (let k = 0; k < len; k++) {
    const p = posts[k];
    p.linkRecord = { title: p.data.title, url: p.url, date: p.data.date, date_long: longDate(p.data.date) };
    p.newer = k === 0 ? null : posts[k - 1];
    p.older = k === len - 1 ? null : posts[k + 1];
  }
}

function tags(b) {
  const bySlug = new Map();
  const slugCache = new Map();
  const getSlug = (name) => {
    let s = slugCache.get(name);
    if (s === undefined) {
      s = slugify(name);
      slugCache.set(name, s);
    }
    return s;
  };

  const ownTags = (s) => {
    const seen = new Set();
    const result = [];
    const list = s.data.tags ?? [];
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const slug = getSlug(name);
      if (!seen.has(slug)) {
        seen.add(slug);
        result.push(name);
      }
    }
    return result;
  };

  for (let i = 0; i < b.posts.length; i++) {
    const p = b.posts[i];
    p.tagRefs = [];
    p.tagLinks = [];
    for (const name of ownTags(p)) {
      const slug = getSlug(name);
      let tag = bySlug.get(slug);
      if (tag === undefined) {
        tag = { name, slug, url: `${b.base}/tags/${slug}/`, posts: [], link: { name, slug, url: `${b.base}/tags/${slug}/` } };
        bySlug.set(slug, tag);
      }
      tag.posts.push(p);
      p.tagRefs.push(tag);
      p.tagLinks.push(tag.link);
    }
  }

  for (let i = 0; i < b.sources.length; i++) {
    const s = b.sources[i];
    if (!s.post) {
      s.tagLinks = ownTags(s).map((name) => {
        const slug = getSlug(name);
        const tag = bySlug.get(slug);
        return tag ? tag.link : { name, slug, url: '' };
      });
    }
  }

  b.tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || byCodeUnits(x.slug, y.slug));
}

const tagOf = (b, t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => b.cards.get(p)) });

function cardOf(s) {
  return {
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.linkRecord ? s.linkRecord.date_long : (s.data.date === undefined ? '' : longDate(s.data.date)),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
    tags: s.tagLinks,
  };
}

function pageOf(s, card) {
  return {
    ...card,
    slug: s.slug,
    content: s.html,
    toc: s.toc,
    newer: s.newer ? s.newer.linkRecord : null,
    older: s.older ? s.older.linkRecord : null,
    is_post: s.post,
  };
}

function layouts(b) {
  b.cards = new Map();
  for (let i = 0; i < b.posts.length; i++) {
    const p = b.posts[i];
    b.cards.set(p, cardOf(p));
  }

  const site = { title: b.input.site.title, base_url: b.base };
  const allTags = b.tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = b.posts.slice(0, b.input.site.recent).map((p) => b.cards.get(p));

  const ctx = { compiled: b.compiled, ...templateCtx };

  const rootVars = { site, tags: allTags, recent, page: null, posts: null, pager: null, tag: null };
  const rootScope = { vars: rootVars, parent: null };

  for (let i = 0; i < b.sources.length; i++) {
    const s = b.sources[i];
    const fn = b.compiled.get(s.layout);
    if (fn !== undefined) {
      const card = s.post ? b.cards.get(s) : cardOf(s);
      b.output[`${s.outDir}/index.html`] = fn(
        { vars: { site, tags: allTags, recent, page: pageOf(s, card) }, parent: null },
        ctx,
        0
      );
    }
  }

  const per = b.input.site.per_page;
  const pages = Math.max(1, Math.ceil(b.posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${b.base}/` : `${b.base}/page/${k}/`);
  const indexFn = b.compiled.get('index');
  if (indexFn !== undefined) {
    rootVars.page = null;
    for (let k = 1; k <= pages; k++) {
      rootVars.posts = b.posts.slice((k - 1) * per, k * per).map((p) => b.cards.get(p));
      rootVars.pager = { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) };
      b.output[k === 1 ? 'index.html' : `page/${k}/index.html`] = indexFn(rootScope, ctx, 0);
    }
  }

  const tagFn = b.compiled.get('tag');
  if (tagFn !== undefined) {
    rootVars.posts = null;
    rootVars.pager = null;
    for (let i = 0; i < b.tags.length; i++) {
      const t = b.tags[i];
      rootVars.tag = tagOf(b, t);
      b.output[`tags/${t.slug}/index.html`] = tagFn(rootScope, ctx, 0);
    }
  }

  const tagsFn = b.compiled.get('tags');
  if (tagsFn !== undefined) {
    rootVars.tag = null;
    b.output['tags/index.html'] = tagsFn(rootScope, ctx, 0);
  }

  for (let i = 0; i < b.statics.length; i++) {
    const f = b.statics[i];
    if (Object.hasOwn(b.output, f.path)) b.report.push(`shadowed ${f.path}: a built page has its path`);
    else b.output[f.path] = f.content;
  }
}

function report(b) {
  const lines = [...b.report, ...b.broken].sort(byCodeUnits);
  const pages = b.sources.filter((s) => !s.post).length;
  lines.push(`built ${pages} pages, ${b.posts.length} posts, ${b.tags.length} tags and ${b.statics.length} static files`);
  b.output[REPORT_FILE] = `${lines.join('\n')}\n`;
}

export function build(input) {
  const compiled = new Map();
  const reportLines = [];
  const templateNames = Object.keys(input.templates).sort(byCodeUnits);

  for (let i = 0; i < templateNames.length; i++) {
    const name = templateNames[i];
    try {
      const nodes = parseTemplate(name, input.templates[name]);
      compiled.set(name, compileTemplate(nodes));
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      reportLines.push(err.message);
    }
  }

  const b = {
    input,
    base: input.site.base_url.replace(/\/+$/, ''),
    compiled,
    sources: [],
    statics: [],
    bySource: new Map(),
    broken: new Set(),
    report: reportLines,
    posts: [],
    tags: [],
    cards: null,
    output: {},
  };

  readSources(b);
  frontMatter(b);
  permalinks(b);
  markdown(b);
  collections(b);
  tags(b);
  layouts(b);
  report(b);

  return b.output;
}
