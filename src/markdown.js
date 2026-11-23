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
  const ids = new Set();
  const toc = [];
  let html = '';
  let excerpt = null;
  const srcLen = src.length;
  let pos = 0;

  function nextLine(start) {
    const nl = src.indexOf('\n', start);
    return nl === -1 ? srcLen : nl;
  }

  while (pos < srcLen) {
    let nl = nextLine(pos);
    let blank = true;
    for (let k = pos; k < nl; k++) {
      const c = src.charCodeAt(k);
      if (c !== 32 && c !== 9) { blank = false; break; }
    }
    if (blank) {
      pos = nl + 1;
      continue;
    }

    const c0 = src.charCodeAt(pos);

    // Fence: ```
    if (c0 === 96 && src.startsWith('```', pos)) {
      const line = src.slice(pos, nl);
      const lang = parseFenceOpen(line);
      if (lang !== null) {
        let codeBody = '';
        pos = nl + 1;
        while (pos < srcLen) {
          const nextNl = nextLine(pos);
          const l = src.slice(pos, nextNl);
          if (isFenceClose(l)) {
            pos = nextNl + 1;
            break;
          }
          codeBody += `${fastEscapeHtml(l)}\n`;
          pos = nextNl + 1;
        }
        const cls = lang === '' ? '' : ` class="language-${fastEscapeHtml(lang)}"`;
        html += `<pre><code${cls}>${codeBody}</code></pre>\n`;
        continue;
      }
    }

    // Heading: #
    if (c0 === 35) {
      const line = src.slice(pos, nl);
      const heading = headingOf(line);
      if (heading !== null) {
        const id = uniqueSlug(slugify(heading.text), ids);
        const hHtml = inline(heading.text, env);
        html += `<h${heading.depth} id="${id}">${hHtml}</h${heading.depth}>\n`;
        if (heading.depth === 2 || heading.depth === 3) {
          toc.push({ level: heading.depth, id, html: hHtml });
        }
        pos = nl + 1;
        continue;
      }
    }

    // HR: --- or ***
    if (c0 === 45 || c0 === 42) {
      const line = src.slice(pos, nl);
      if (isHr(line)) {
        html += '<hr>\n';
        pos = nl + 1;
        continue;
      }
    }

    // Blockquote: >
    if (c0 === 62) {
      const qLines = [];
      while (pos < srcLen && src.charCodeAt(pos) === 62) {
        const nextNl = nextLine(pos);
        const l = src.slice(pos, nextNl);
        const stripped = l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1);
        const trimmed = trimLine(stripped);
        if (trimmed !== '') qLines.push(trimmed);
        pos = nextNl + 1;
      }
      html += qLines.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(qLines.join('\n'), env)}</p>\n</blockquote>\n`;
      continue;
    }

    // List: bullet or ordered
    const line = src.slice(pos, nl);
    const bullet = parseBullet(line);
    const ordered = bullet === null ? parseOrdered(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const items = [];
      if (isOrdered) {
        items.push([trimLine(ordered.text)]);
        pos = nl + 1;
        while (pos < srcLen) {
          const nextNl = nextLine(pos);
          const l = src.slice(pos, nextNl);
          const m = parseOrdered(l);
          if (m !== null) {
            items.push([trimLine(m.text)]);
            pos = nextNl + 1;
          } else if (isContinued(l)) {
            items[items.length - 1].push(trimLine(l));
            pos = nextNl + 1;
          } else break;
        }
      } else {
        items.push([trimLine(bullet)]);
        pos = nl + 1;
        while (pos < srcLen) {
          const nextNl = nextLine(pos);
          const l = src.slice(pos, nextNl);
          const m = parseBullet(l);
          if (m !== null) {
            items.push([trimLine(m)]);
            pos = nextNl + 1;
          } else if (isContinued(l)) {
            items[items.length - 1].push(trimLine(l));
            pos = nextNl + 1;
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
    pos = nl + 1;
    while (pos < srcLen) {
      const nextNl = nextLine(pos);
      const l = src.slice(pos, nextNl);
      if (endsParagraph(l)) break;
      pText += '\n' + trimLine(l);
      pos = nextNl + 1;
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
