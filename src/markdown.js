import { escapeHtml, slugify, uniqueSlug } from '../vendor/makefun-site/lib/text.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const ESCAPE_TEST_RE = /[&<>"']/;
function fastEscapeHtml(text) {
  return ESCAPE_TEST_RE.test(text) ? text.replace(/[&<>"']/g, (c) => ESCAPES[c]) : text;
}

const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

function findUnescaped(s, what, from) {
  const idx = s.indexOf(what, from);
  if (idx === -1) return -1;
  if (!s.includes('\\')) return idx;
  for (let j = from; j <= s.length - what.length; j++) {
    if (s[j] === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (s.startsWith(what, j)) return j;
  }
  return -1;
}

function findSingleStar(s, from) {
  if (s.indexOf('*', from) === -1) return -1;
  if (!s.includes('\\')) {
    for (let j = from; j < s.length; j++) {
      if (s[j] === '*') {
        if (s[j + 1] === '*') {
          j++;
          continue;
        }
        return j;
      }
    }
    return -1;
  }
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (c !== '*') continue;
    if (s[j + 1] === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

export function inline(s, env) {
  const hasStar = s.includes('*');
  const hasTick = s.includes('`');
  const hasBracket = s.includes('[');
  const hasBackslash = s.includes('\\');

  if (!hasStar && !hasTick && !hasBracket && !hasBackslash) {
    return fastEscapeHtml(s);
  }

  let out = '';
  let i = 0;
  const len = s.length;

  while (i < len) {
    let next = -1;

    if (hasBackslash) {
      const idx = s.indexOf('\\', i);
      if (idx !== -1 && (next === -1 || idx < next)) next = idx;
    }
    if (hasTick) {
      const idx = s.indexOf('`', i);
      if (idx !== -1 && (next === -1 || idx < next)) next = idx;
    }
    if (hasStar) {
      const idx = s.indexOf('*', i);
      if (idx !== -1 && (next === -1 || idx < next)) next = idx;
    }
    if (hasBracket) {
      const idx = s.indexOf('[', i);
      if (idx !== -1 && (next === -1 || idx < next)) next = idx;
    }

    if (next === -1) {
      out += fastEscapeHtml(s.slice(i));
      break;
    }

    if (next > i) {
      out += fastEscapeHtml(s.slice(i, next));
      i = next;
    }

    const c = s[i];
    if (c === '\\' && i + 1 < len && ESCAPABLE.has(s[i + 1])) {
      out += fastEscapeHtml(s[i + 1]);
      i += 2;
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        out += `<code>${fastEscapeHtml(s.slice(i + 1, j))}</code>`;
        i = j + 1;
      } else {
        out += '`';
        i++;
      }
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2);
        if (j > i + 2) {
          out += `<strong>${inline(s.slice(i + 2, j), env)}</strong>`;
          i = j + 2;
        } else {
          out += '**';
          i += 2;
        }
        continue;
      }
      const j = findSingleStar(s, i + 1);
      if (j > i + 1) {
        out += `<em>${inline(s.slice(i + 1, j), env)}</em>`;
        i = j + 1;
      } else {
        out += '*';
        i++;
      }
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !/\s/.test(target)) {
        out += `<a href="${fastEscapeHtml(env.link(target))}">${inline(s.slice(i + 1, k), env)}</a>`;
        i = m + 1;
        continue;
      }
      out += '[';
      i++;
      continue;
    }
    out += fastEscapeHtml(c);
    i++;
  }
  return out;
}

function trimLine(line) {
  if (line.length === 0) return '';
  const first = line.charCodeAt(0);
  const last = line.charCodeAt(line.length - 1);
  if (first > 32 && last > 32) return line;
  let start = 0;
  let end = line.length;
  while (start < end && (line.charCodeAt(start) === 32 || line.charCodeAt(start) === 9)) start++;
  while (end > start && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
  return line.slice(start, end);
}

function isBlank(line) {
  const len = line.length;
  for (let i = 0; i < len; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  let depth = 0;
  const len = line.length;
  while (depth < len && line.charCodeAt(depth) === 35) depth++;
  if (depth < 1 || depth > 6) return null;
  let p = depth;
  while (p < len && (line.charCodeAt(p) === 32 || line.charCodeAt(p) === 9)) p++;
  if (p === depth || p === len) return null;
  let end = len;
  while (end > p && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
  if (end === p) return null;
  return { depth, text: line.slice(p, end) };
}

function isFenceClose(line) {
  if (!line.startsWith('```')) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function parseFenceOpen(line) {
  if (!line.startsWith('```')) return null;
  let p = 3;
  const len = line.length;
  while (p < len) {
    const c = line.charCodeAt(p);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 43 || c === 45) {
      p++;
    } else break;
  }
  const lang = line.slice(3, p);
  for (let k = p; k < len; k++) {
    const c = line.charCodeAt(k);
    if (c !== 32 && c !== 9) return null;
  }
  return lang;
}

function isHr(line) {
  const c0 = line.charCodeAt(0);
  if (c0 !== 45 && c0 !== 42) return false;
  if (c0 === 45 && !line.startsWith('---')) return false;
  if (c0 === 42 && !line.startsWith('***')) return false;
  for (let i = 3; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

function isContinued(line) {
  const len = line.length;
  if (len < 3 || line.charCodeAt(0) !== 32 || line.charCodeAt(1) !== 32) return false;
  let p = 2;
  while (p < len && line.charCodeAt(p) === 32) p++;
  return p < len && line.charCodeAt(p) !== 9;
}

function parseBullet(line) {
  const c0 = line.charCodeAt(0);
  if ((c0 === 45 || c0 === 42) && line.charCodeAt(1) === 32) {
    return line.slice(2);
  }
  return null;
}

function parseOrdered(line) {
  const c0 = line.charCodeAt(0);
  if (c0 < 48 || c0 > 57) return null;
  let p = 1;
  const len = line.length;
  while (p < len && p < 9 && line.charCodeAt(p) >= 48 && line.charCodeAt(p) <= 57) p++;
  if (p < len - 1 && line.charCodeAt(p) === 46 && line.charCodeAt(p + 1) === 32) {
    return { start: parseInt(line.slice(0, p), 10), text: line.slice(p + 2) };
  }
  return null;
}

function endsParagraph(line) {
  if (line.length === 0) return true;
  const c0 = line.charCodeAt(0);
  if (c0 !== 32 && c0 !== 9 && c0 !== 96 && c0 !== 35 && c0 !== 45 && c0 !== 42) {
    return false;
  }
  return isBlank(line) || parseFenceOpen(line) !== null || headingOf(line) !== null || isHr(line);
}

export function renderMarkdown(src, env) {
  const lines = src.split('\n');
  const ids = new Set();
  const toc = [];
  let html = '';
  let excerpt = null;
  let i = 0;
  const len = lines.length;

  while (i < len) {
    const line = lines[i];
    if (line.length === 0 || (line.charCodeAt(0) <= 32 && isBlank(line))) {
      i++;
      continue;
    }

    const c0 = line.charCodeAt(0);

    // Fence: ```
    if (c0 === 96 && line.startsWith('```')) {
      const lang = parseFenceOpen(line);
      if (lang !== null) {
        let codeBody = '';
        i++;
        while (i < len && !isFenceClose(lines[i])) {
          codeBody += `${fastEscapeHtml(lines[i++])}\n`;
        }
        i++;
        const cls = lang === '' ? '' : ` class="language-${fastEscapeHtml(lang)}"`;
        html += `<pre><code${cls}>${codeBody}</code></pre>\n`;
        continue;
      }
    }

    // Heading: #
    if (c0 === 35) {
      const heading = headingOf(line);
      if (heading !== null) {
        const id = uniqueSlug(slugify(heading.text), ids);
        const hHtml = inline(heading.text, env);
        html += `<h${heading.depth} id="${id}">${hHtml}</h${heading.depth}>\n`;
        if (heading.depth === 2 || heading.depth === 3) {
          toc.push({ level: heading.depth, id, html: hHtml });
        }
        i++;
        continue;
      }
    }

    // HR: --- or ***
    if ((c0 === 45 || c0 === 42) && isHr(line)) {
      html += '<hr>\n';
      i++;
      continue;
    }

    // Blockquote: >
    if (c0 === 62) {
      const qLines = [];
      while (i < len && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        const stripped = l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1);
        const trimmed = trimLine(stripped);
        if (trimmed !== '') qLines.push(trimmed);
      }
      html += qLines.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(qLines.join('\n'), env)}</p>\n</blockquote>\n`;
      continue;
    }

    // List: bullet or ordered
    const bullet = parseBullet(line);
    const ordered = bullet === null ? parseOrdered(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items = [];
      if (isOrdered) {
        items.push([trimLine(ordered.text)]);
        i++;
        while (i < len) {
          const m = parseOrdered(lines[i]);
          if (m !== null) {
            items.push([trimLine(m.text)]);
            i++;
          } else if (isContinued(lines[i])) {
            items[items.length - 1].push(trimLine(lines[i]));
            i++;
          } else break;
        }
      } else {
        items.push([trimLine(bullet)]);
        i++;
        while (i < len) {
          const m = parseBullet(lines[i]);
          if (m !== null) {
            items.push([trimLine(m)]);
            i++;
          } else if (isContinued(lines[i])) {
            items[items.length - 1].push(trimLine(lines[i]));
            i++;
          } else break;
        }
      }

      const tag = isOrdered ? 'ol' : 'ul';
      const startNum = isOrdered ? ordered.start : 1;
      const open = isOrdered && startNum !== 1 ? `<ol start="${startNum}">` : `<${tag}>`;
      const itemHtmls = items.map((parts) => `<li>${inline(parts.join('\n'), env)}</li>\n`).join('');
      html += `${open}\n${itemHtmls}</${tag}>\n`;
      continue;
    }

    // Paragraph
    let pText = trimLine(line);
    i++;
    while (i < len && !endsParagraph(lines[i])) {
      pText += '\n' + trimLine(lines[i++]);
    }
    const pHtml = inline(pText, env);
    if (excerpt === null) excerpt = pHtml;
    html += `<p>${pHtml}</p>\n`;
  }

  return {
    html,
    toc,
    excerpt: excerpt ?? '',
  };
}
