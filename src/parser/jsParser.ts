/* eslint-disable no-bitwise -- byte-level parsing and PRNG arithmetic */
/**
 * JavaScript implementation of the parser in cpp/HtmlParser.cpp.
 *
 * The two implementations must stay behaviourally identical: change both
 * together and cover the change in src/__fixtures__/parserCases.ts. The
 * algorithm is described in docs/PARSER.md.
 */
import { NAMED_ENTITIES } from './entities.generated';
import type { HtmlElement, HtmlNode } from './types';

export const DEFAULT_MAX_DEPTH = 256;
export const MAX_ALLOWED_DEPTH = 1024;

const set = (...names: string[]): ReadonlySet<string> => new Set(names);

const VOID_ELEMENTS = set(
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
);

const RAW_TEXT_ELEMENTS = set(
  'script',
  'style',
  'title',
  'textarea',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'noscript'
);

const DROPPED_ELEMENTS = set('head', 'template', 'svg', 'math');

const HEAD_CONTENT = set(
  'base',
  'link',
  'meta',
  'style',
  'title',
  'script',
  'noscript',
  'template'
);

const CLOSES_PARAGRAPH = set(
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dd',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'li',
  'listing',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'ul'
);

const HEADINGS = set('h1', 'h2', 'h3', 'h4', 'h5', 'h6');

const SCOPE_BOUNDARY = set(
  'html',
  'table',
  'td',
  'th',
  'caption',
  'marquee',
  'object',
  'applet',
  'template',
  'button'
);

const TABLE_SCOPE_BOUNDARY = set('html', 'table', 'template');

const TABLE_CONTEXT = set(
  'td',
  'th',
  'tr',
  'tbody',
  'thead',
  'tfoot',
  'table',
  'caption'
);

const SPECIAL = set(
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'dd',
  'details',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'html',
  'li',
  'listing',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul'
);

const LEGACY_ENTITIES = set('amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg');

const TR_BOUNDARY = set('table', 'tbody', 'thead', 'tfoot', 'html', 'template');
const CELL_BOUNDARY = set(
  'tr',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'html',
  'template'
);
const SECTION_BOUNDARY = set('table', 'html', 'template');

// prettier-ignore
const WINDOWS_1252 = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];

const entityMap: ReadonlyMap<string, number> = new Map(
  Object.entries(NAMED_ENTITIES)
);

const isWhitespace = (c: number) =>
  c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c;
const isAlpha = (c: number) =>
  (c >= 0x61 && c <= 0x7a) || (c >= 0x41 && c <= 0x5a);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isAlnum = (c: number) => isAlpha(c) || isDigit(c);
const isHexDigit = (c: number) =>
  isDigit(c) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46);
const hexValue = (c: number) =>
  isDigit(c) ? c - 0x30 : (c | 0x20) - 0x61 + 10;

/** Lowercases ASCII letters only, like the C++ parser. */
function toLowerAscii(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

function sanitizeCodePoint(value: number): number {
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return 0xfffd;
  }
  if (value >= 0x80 && value <= 0x9f && WINDOWS_1252[value - 0x80]) {
    return WINDOWS_1252[value - 0x80]!;
  }
  return value;
}

export function decodeCharacterReferences(
  s: string,
  inAttribute: boolean
): string {
  if (s.indexOf('&') === -1) {
    return s;
  }
  let out = '';
  let i = 0;
  const length = s.length;

  while (i < length) {
    const amp = s.indexOf('&', i);
    if (amp === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, amp);
    i = amp;

    let j = i + 1;
    if (j < length && s.charCodeAt(j) === 0x23 /* # */) {
      j++;
      let hex = false;
      if (j < length && (s.charCodeAt(j) | 0x20) === 0x78 /* x */) {
        hex = true;
        j++;
      }
      const digitsStart = j;
      let value = 0;
      let overflow = false;
      while (j < length) {
        const c = s.charCodeAt(j);
        if (!(hex ? isHexDigit(c) : isDigit(c))) {
          break;
        }
        if (!overflow) {
          value = value * (hex ? 16 : 10) + hexValue(c);
          overflow = value > 0x10ffff;
        }
        j++;
      }
      if (j === digitsStart) {
        out += '&';
        i++;
        continue;
      }
      if (j < length && s.charCodeAt(j) === 0x3b /* ; */) {
        j++;
      }
      out += String.fromCodePoint(
        sanitizeCodePoint(overflow ? 0x110000 : value)
      );
      i = j;
      continue;
    }

    const nameStart = j;
    while (j < length && isAlnum(s.charCodeAt(j))) {
      j++;
    }
    if (j === nameStart) {
      out += '&';
      i++;
      continue;
    }

    const name = s.slice(nameStart, j);
    if (j < length && s.charCodeAt(j) === 0x3b) {
      const codePoint = entityMap.get(name);
      if (codePoint !== undefined) {
        out += String.fromCodePoint(codePoint);
        i = j + 1;
        continue;
      }
    } else if (!inAttribute && LEGACY_ENTITIES.has(name)) {
      out += String.fromCodePoint(entityMap.get(name)!);
      i = j;
      continue;
    }

    // Unknown reference: keep it verbatim.
    out += s.slice(i, j);
    i = j;
  }

  return out;
}

interface BuilderElement {
  name: string;
  attributes: Record<string, string>;
  children: Array<BuilderElement | { text: string }>;
}

type BuilderNode = BuilderElement['children'][number];

const isBuilderText = (node: BuilderNode): node is { text: string } =>
  'text' in node;

class TreeBuilder {
  private readonly root: BuilderElement = {
    name: '',
    attributes: {},
    children: [],
  };
  private readonly stack: BuilderElement[] = [this.root];
  private seenHead = false;

  constructor(private readonly maxDepth: number) {}

  private get current(): BuilderElement {
    return this.stack[this.stack.length - 1]!;
  }

  text(data: string): void {
    if (!data) {
      return;
    }
    const children = this.current.children;
    const last = children[children.length - 1];
    if (last && isBuilderText(last)) {
      last.text += data;
    } else {
      children.push({ text: data });
    }
  }

  startTag(
    name: string,
    attributes: Record<string, string>,
    selfClosing: boolean
  ): void {
    if (name === 'html') {
      if (
        this.stack.length > 1 ||
        this.root.children.some((child) => !isBuilderText(child))
      ) {
        return;
      }
    } else if (name === 'head') {
      const atTop =
        this.stack.length === 1 ||
        (this.stack.length === 2 && this.current.name === 'html');
      if (!atTop || this.seenHead) {
        return;
      }
      this.seenHead = true;
    } else if (name === 'body') {
      if (this.findOpen('body') !== 0) {
        return;
      }
      this.closeIfOpen('head');
    } else if (!HEAD_CONTENT.has(name)) {
      this.closeIfOpen('head');
    }

    if (name === 'li') {
      this.closeListItem(set('li'));
    } else if (name === 'dd' || name === 'dt') {
      this.closeListItem(set('dd', 'dt'));
    } else if (name === 'tr') {
      this.closeWithin(set('tr'), TR_BOUNDARY);
    } else if (name === 'td' || name === 'th') {
      this.closeWithin(set('td', 'th'), CELL_BOUNDARY);
    } else if (name === 'tbody' || name === 'thead' || name === 'tfoot') {
      this.closeWithin(set('tbody', 'thead', 'tfoot'), SECTION_BOUNDARY);
    } else if (name === 'a') {
      this.closeWithin(set('a'), SPECIAL);
    }

    if (CLOSES_PARAGRAPH.has(name)) {
      this.closeWithin(set('p'), SCOPE_BOUNDARY);
    }
    if (HEADINGS.has(name) && HEADINGS.has(this.current.name)) {
      this.stack.pop();
    }

    if (this.stack.length > this.maxDepth) {
      return;
    }

    const element: BuilderElement = { name, attributes, children: [] };
    this.current.children.push(element);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) {
      this.stack.push(element);
    }
  }

  endTag(name: string): void {
    if (name === 'body' || name === 'html') {
      return;
    }
    if (name === 'br') {
      this.startTag('br', {}, false);
      return;
    }
    if (VOID_ELEMENTS.has(name)) {
      return;
    }

    for (let i = this.stack.length - 1; i >= 1; i--) {
      const open = this.stack[i]!.name;
      if (open === name) {
        this.stack.length = i;
        return;
      }
      if (SPECIAL.has(name)) {
        if (TABLE_CONTEXT.has(name)) {
          if (TABLE_SCOPE_BOUNDARY.has(open)) {
            return;
          }
        } else if (
          SCOPE_BOUNDARY.has(open) ||
          (name === 'li' && (open === 'ol' || open === 'ul'))
        ) {
          return;
        }
      } else if (SPECIAL.has(open)) {
        return;
      }
    }
  }

  finish(): HtmlNode[] {
    return collect(this.root.children);
  }

  private findOpen(name: string): number {
    for (let i = this.stack.length - 1; i >= 1; i--) {
      if (this.stack[i]!.name === name) {
        return i;
      }
    }
    return 0;
  }

  private closeIfOpen(name: string): void {
    const index = this.findOpen(name);
    if (index !== 0) {
      this.stack.length = index;
    }
  }

  private closeWithin(
    targets: ReadonlySet<string>,
    boundary: ReadonlySet<string>
  ): void {
    for (let i = this.stack.length - 1; i >= 1; i--) {
      const open = this.stack[i]!.name;
      if (targets.has(open)) {
        this.stack.length = i;
        return;
      }
      if (boundary.has(open)) {
        return;
      }
    }
  }

  private closeListItem(targets: ReadonlySet<string>): void {
    for (let i = this.stack.length - 1; i >= 1; i--) {
      const open = this.stack[i]!.name;
      if (targets.has(open)) {
        this.stack.length = i;
        return;
      }
      if (
        SPECIAL.has(open) &&
        open !== 'address' &&
        open !== 'div' &&
        open !== 'p'
      ) {
        return;
      }
    }
  }
}

/** Removes dropped elements and merges text nodes that become adjacent. */
function collect(children: BuilderNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const child of children) {
    if (isBuilderText(child)) {
      const last = out[out.length - 1];
      if (last && last.type === 'text') {
        last.data += child.text;
      } else {
        out.push({ type: 'text', data: child.text });
      }
      continue;
    }
    if (DROPPED_ELEMENTS.has(child.name)) {
      continue;
    }
    const element: HtmlElement = {
      type: 'element',
      name: child.name,
      attributes: child.attributes,
      children: collect(child.children),
    };
    out.push(element);
  }
  return out;
}

interface StartTag {
  name: string;
  attributes: Record<string, string>;
  selfClosing: boolean;
  end: number;
}

/**
 * Parses a start tag whose name begins at `i`. Returns null if the input ends
 * inside the tag, in which case the tag and the rest of the input are dropped.
 */
function parseStartTag(input: string, i: number): StartTag | null {
  const n = input.length;
  const nameStart = i;
  while (i < n) {
    const c = input.charCodeAt(i);
    if (isWhitespace(c) || c === 0x2f /* / */ || c === 0x3e /* > */) {
      break;
    }
    i++;
  }
  const name = toLowerAscii(input.slice(nameStart, i));
  const attributes: Record<string, string> = {};
  const seen = new Set<string>();

  while (true) {
    while (i < n && isWhitespace(input.charCodeAt(i))) {
      i++;
    }
    if (i >= n) {
      return null;
    }
    const c = input.charCodeAt(i);
    if (c === 0x3e) {
      return { name, attributes, selfClosing: false, end: i + 1 };
    }
    if (c === 0x2f) {
      if (i + 1 < n && input.charCodeAt(i + 1) === 0x3e) {
        return { name, attributes, selfClosing: true, end: i + 2 };
      }
      i++;
      continue;
    }

    const attrStart = i;
    i++;
    while (i < n) {
      const d = input.charCodeAt(i);
      if (isWhitespace(d) || d === 0x2f || d === 0x3e || d === 0x3d /* = */) {
        break;
      }
      i++;
    }
    const attrName = toLowerAscii(input.slice(attrStart, i));
    while (i < n && isWhitespace(input.charCodeAt(i))) {
      i++;
    }

    let value = '';
    if (i < n && input.charCodeAt(i) === 0x3d) {
      i++;
      while (i < n && isWhitespace(input.charCodeAt(i))) {
        i++;
      }
      if (i >= n) {
        return null;
      }
      const q = input.charCodeAt(i);
      if (q === 0x22 /* " */ || q === 0x27 /* ' */) {
        const close = input.indexOf(input[i]!, i + 1);
        if (close === -1) {
          return null;
        }
        value = decodeCharacterReferences(input.slice(i + 1, close), true);
        i = close + 1;
      } else if (q !== 0x3e) {
        const valueStart = i;
        while (i < n) {
          const d = input.charCodeAt(i);
          if (isWhitespace(d) || d === 0x3e) {
            break;
          }
          i++;
        }
        value = decodeCharacterReferences(input.slice(valueStart, i), true);
      }
    }

    // "__proto__" cannot be represented as an ordinary JS object key.
    if (attrName !== '__proto__' && !seen.has(attrName)) {
      seen.add(attrName);
      attributes[attrName] = value;
    }
  }
}

/**
 * Returns the position just after the end tag that closes a raw text element,
 * or the end of the input if there is none.
 */
function skipRawText(input: string, pos: number, name: string): number {
  const n = input.length;
  while (true) {
    const lt = input.indexOf('</', pos);
    if (lt === -1) {
      return n;
    }
    const j = lt + 2;
    if (toLowerAscii(input.slice(j, j + name.length)) === name) {
      const after = j + name.length;
      if (after >= n) {
        return n;
      }
      const c = input.charCodeAt(after);
      if (isWhitespace(c) || c === 0x2f || c === 0x3e) {
        const gt = input.indexOf('>', after);
        return gt === -1 ? n : gt + 1;
      }
    }
    pos = lt + 2;
  }
}

function skipPast(input: string, char: string, from: number): number {
  const found = input.indexOf(char, from);
  return found === -1 ? input.length : found + 1;
}

export function normalizeMaxDepth(maxDepth: number | undefined): number {
  if (maxDepth === undefined || !Number.isFinite(maxDepth) || maxDepth < 1) {
    return DEFAULT_MAX_DEPTH;
  }
  return Math.min(Math.floor(maxDepth), MAX_ALLOWED_DEPTH);
}

/** Parses HTML into a node tree. Never throws on malformed markup. */
export function parseHtmlJs(
  html: string,
  maxDepth: number = DEFAULT_MAX_DEPTH
): HtmlNode[] {
  const input = html.replace(/\r\n?/g, '\n');
  const n = input.length;
  const builder = new TreeBuilder(normalizeMaxDepth(maxDepth));

  let pending = '';
  const flush = () => {
    if (pending) {
      builder.text(pending);
      pending = '';
    }
  };

  let pos = 0;
  while (pos < n) {
    if (input.charCodeAt(pos) !== 0x3c /* < */) {
      let next = input.indexOf('<', pos);
      if (next === -1) {
        next = n;
      }
      pending += decodeCharacterReferences(input.slice(pos, next), false);
      pos = next;
      continue;
    }

    if (pos + 1 >= n) {
      pending += '<';
      pos++;
      continue;
    }

    const next = input.charCodeAt(pos + 1);
    if (isAlpha(next)) {
      const tag = parseStartTag(input, pos + 1);
      if (!tag) {
        break;
      }
      flush();
      pos = tag.end;
      if (RAW_TEXT_ELEMENTS.has(tag.name)) {
        pos = skipRawText(input, pos, tag.name);
        continue;
      }
      builder.startTag(tag.name, tag.attributes, tag.selfClosing);
      if (
        (tag.name === 'pre' || tag.name === 'listing') &&
        input.charCodeAt(pos) === 0x0a
      ) {
        pos++;
      }
      continue;
    }

    if (next === 0x2f /* / */) {
      if (pos + 2 >= n) {
        pending += '</';
        pos = n;
        continue;
      }
      if (isAlpha(input.charCodeAt(pos + 2))) {
        let i = pos + 2;
        while (i < n) {
          const c = input.charCodeAt(i);
          if (isWhitespace(c) || c === 0x2f || c === 0x3e) {
            break;
          }
          i++;
        }
        const name = toLowerAscii(input.slice(pos + 2, i));
        const gt = input.indexOf('>', i);
        if (gt === -1) {
          break;
        }
        flush();
        builder.endTag(name);
        pos = gt + 1;
        continue;
      }
      // "</>" is ignored; anything else is a bogus comment.
      pos =
        input.charCodeAt(pos + 2) === 0x3e
          ? pos + 3
          : skipPast(input, '>', pos + 2);
      continue;
    }

    if (next === 0x21 /* ! */) {
      if (input.startsWith('<!--', pos)) {
        const start = pos + 4;
        if (input.charCodeAt(start) === 0x3e) {
          pos = start + 1;
        } else if (input.startsWith('->', start)) {
          pos = start + 2;
        } else {
          const close = input.indexOf('-->', start);
          pos = close === -1 ? n : close + 3;
        }
        continue;
      }
      pos = skipPast(input, '>', pos + 2);
      continue;
    }

    if (next === 0x3f /* ? */) {
      pos = skipPast(input, '>', pos + 2);
      continue;
    }

    pending += '<';
    pos++;
  }

  flush();
  return builder.finish();
}
