import { Platform, processColor, type TextStyle } from 'react-native';

import type { Mutable } from './styles';

/**
 * Converts the supported subset of inline CSS (`style="..."`) into React
 * Native styles. Unsupported properties and invalid values are ignored rather
 * than passed through, so malformed markup can never produce a style React
 * Native rejects.
 */

export type Declarations = ReadonlyMap<string, string>;

export interface CssContext {
  /** Font size of the parent element; `em` and `%` font sizes resolve against it. */
  parentFontSize: number;
  /**
   * Font size the element already has from non-inline styles (defaults, tag or
   * class styles). Used for `em` values when inline CSS sets no font-size.
   */
  elementFontSize?: number;
  /** Root font size; `rem` and keyword font sizes resolve against it. */
  baseFontSize: number;
  /** Font families inline CSS may select. Others are ignored. */
  allowedFontFamilies?: readonly string[];
}

export interface ConvertedCss {
  style: TextStyle;
  display?: string;
  listStyleType?: string;
}

export const MONOSPACE_FONT = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

/** Parses a `style` attribute into lowercase property names and values. */
export function parseDeclarations(cssText: string): Declarations {
  const declarations = new Map<string, string>();
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let quote = '';
  let start = 0;

  const add = (end: number) => {
    const chunk = text.slice(start, end);
    const colon = chunk.indexOf(':');
    if (colon > 0) {
      const property = chunk.slice(0, colon).trim().toLowerCase();
      const value = chunk
        .slice(colon + 1)
        .replace(/!\s*important\s*$/i, '')
        .trim();
      if (property && value) {
        declarations.set(property, value);
      }
    }
    start = end + 1;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) {
        quote = '';
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
    } else if (c === ';' && depth === 0) {
      add(i);
    }
  }
  add(text.length);
  return declarations;
}

const COLOR_KEYWORDS_TO_IGNORE = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'currentcolor',
]);

/** Returns the colour if React Native can render it, otherwise undefined. */
export function toColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const color = value.trim();
  if (!color || COLOR_KEYWORDS_TO_IGNORE.has(color.toLowerCase())) {
    return undefined;
  }
  const normalized = /^[a-z]+$/i.test(color) ? color.toLowerCase() : color;
  try {
    return processColor(normalized) == null ? undefined : normalized;
  } catch {
    return undefined;
  }
}

const LENGTH = /^(-?(?:\d+\.?\d*|\.\d+))(px|pt|em|rem|%)?$/i;

type Percent = `${number}%`;

/**
 * Resolves a CSS length to device-independent pixels. Percentages are
 * returned as strings when `allowPercent` is set and dropped otherwise.
 * Unitless values other than 0 are invalid CSS lengths and are dropped.
 */
function toLength(
  value: string,
  fontSize: number,
  baseFontSize: number,
  allowPercent = false
): number | Percent | undefined {
  const match = LENGTH.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const n = Number(match[1]);
  switch ((match[2] ?? '').toLowerCase()) {
    case '':
      return n === 0 ? 0 : undefined;
    case 'px':
      return n;
    case 'pt':
      return (n * 4) / 3;
    case 'em':
      return n * fontSize;
    case 'rem':
      return n * baseFontSize;
    case '%':
      return allowPercent ? (`${n}%` as Percent) : undefined;
    default:
      return undefined;
  }
}

const FONT_SIZE_KEYWORDS: Readonly<Record<string, number>> = {
  'xx-small': 0.5625,
  'x-small': 0.625,
  'small': 0.8125,
  'medium': 1,
  'large': 1.125,
  'x-large': 1.5,
  'xx-large': 2,
  'xxx-large': 3,
};

export function toFontSize(
  value: string,
  ctx: Pick<CssContext, 'parentFontSize' | 'baseFontSize'>
): number | undefined {
  const keyword = value.trim().toLowerCase();
  const scale = FONT_SIZE_KEYWORDS[keyword];
  if (scale !== undefined) {
    return scale * ctx.baseFontSize;
  }
  if (keyword === 'smaller') {
    return ctx.parentFontSize / 1.2;
  }
  if (keyword === 'larger') {
    return ctx.parentFontSize * 1.2;
  }
  const match = LENGTH.exec(keyword);
  if (match?.[2] === '%') {
    const size = (Number(match[1]) / 100) * ctx.parentFontSize;
    return size > 0 ? size : undefined;
  }
  const size = toLength(keyword, ctx.parentFontSize, ctx.baseFontSize);
  return typeof size === 'number' && size > 0 ? size : undefined;
}

function toFontWeight(value: string): TextStyle['fontWeight'] | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'normal' || v === 'lighter') {
    return 'normal';
  }
  if (v === 'bold' || v === 'bolder') {
    return 'bold';
  }
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 1000) {
    const rounded = Math.min(900, Math.max(100, Math.round(n / 100) * 100));
    return String(rounded) as TextStyle['fontWeight'];
  }
  return undefined;
}

/** Picks the first family in a CSS font-family list that is allowed. */
export function toFontFamily(
  value: string,
  allowed: readonly string[] | undefined
): string | undefined {
  const families = value
    .split(',')
    .map((family) =>
      family
        .trim()
        .replace(/^["']|["']$/g, '')
        .trim()
    )
    .filter(Boolean);
  for (const family of families) {
    if (family.toLowerCase() === 'monospace') {
      return MONOSPACE_FONT;
    }
    if (allowed?.includes(family)) {
      return family;
    }
  }
  return undefined;
}

function toTextDecoration(
  value: string
): TextStyle['textDecorationLine'] | undefined {
  const tokens = value.toLowerCase().split(/\s+/);
  if (tokens.includes('none')) {
    return 'none';
  }
  const underline = tokens.includes('underline');
  const lineThrough = tokens.includes('line-through');
  if (underline && lineThrough) {
    return 'underline line-through';
  }
  if (underline) {
    return 'underline';
  }
  return lineThrough ? 'line-through' : undefined;
}

const TEXT_ALIGN: Readonly<Record<string, TextStyle['textAlign']>> = {
  left: 'left',
  start: 'left',
  right: 'right',
  end: 'right',
  center: 'center',
  justify: 'justify',
};

export function toTextAlign(value: string): TextStyle['textAlign'] | undefined {
  return TEXT_ALIGN[value.trim().toLowerCase()];
}

const TEXT_TRANSFORM = new Set([
  'uppercase',
  'lowercase',
  'capitalize',
  'none',
]);

export const LIST_STYLE_TYPES = new Set([
  'none',
  'disc',
  'circle',
  'square',
  'decimal',
  'lower-alpha',
  'upper-alpha',
  'lower-latin',
  'upper-latin',
  'lower-roman',
  'upper-roman',
]);

type Side = 'Top' | 'Right' | 'Bottom' | 'Left';

function applyBox(
  style: TextStyle,
  prefix: 'margin' | 'padding',
  value: string,
  fontSize: number,
  baseFontSize: number
) {
  const tokens = value.trim().split(/\s+/);
  if (tokens.length < 1 || tokens.length > 4) {
    return;
  }
  const [top, right = top, bottom = top, left = right] = tokens as [
    string,
    ...string[],
  ];
  const sides: Array<[Side, string]> = [
    ['Top', top],
    ['Right', right],
    ['Bottom', bottom],
    ['Left', left],
  ];
  for (const [side, token] of sides) {
    applySide(style, prefix, side, token, fontSize, baseFontSize);
  }
}

function applySide(
  style: TextStyle,
  prefix: 'margin' | 'padding',
  side: Side,
  token: string,
  fontSize: number,
  baseFontSize: number
) {
  const length = toLength(token, fontSize, baseFontSize);
  if (typeof length !== 'number' || (prefix === 'padding' && length < 0)) {
    return;
  }
  (style as Record<string, unknown>)[`${prefix}${side}`] = length;
}

const SIZE_PROPERTIES: Readonly<Record<string, keyof TextStyle>> = {
  'width': 'width',
  'height': 'height',
  'min-width': 'minWidth',
  'max-width': 'maxWidth',
  'min-height': 'minHeight',
  'max-height': 'maxHeight',
};

/** Converts parsed declarations into React Native styles. */
export function convertDeclarations(
  declarations: Declarations,
  ctx: CssContext
): ConvertedCss {
  const style: Mutable<TextStyle> = {};
  const result: ConvertedCss = { style };
  const set = <K extends keyof TextStyle>(
    key: K,
    value: TextStyle[K] | undefined
  ) => {
    if (value !== undefined) {
      style[key] = value;
    }
  };

  // Font size first: other `em` values are relative to the element's own size.
  const fontSizeValue = declarations.get('font-size');
  const ownFontSize =
    fontSizeValue !== undefined ? toFontSize(fontSizeValue, ctx) : undefined;
  set('fontSize', ownFontSize);
  const fontSize = ownFontSize ?? ctx.elementFontSize ?? ctx.parentFontSize;
  const { baseFontSize } = ctx;

  for (const [property, value] of declarations) {
    const lower = value.toLowerCase();
    switch (property) {
      case 'color':
        if (!declarations.has('-webkit-text-fill-color')) {
          set('color', toColor(value));
        }
        break;
      case '-webkit-text-fill-color':
        // Browsers paint text with the fill colour when both are set.
        set('color', toColor(value) ?? toColor(declarations.get('color')));
        break;
      case 'background-color':
      case 'background':
        set('backgroundColor', toColor(value));
        break;
      case 'font-weight':
        set('fontWeight', toFontWeight(value));
        break;
      case 'font-style':
        if (lower === 'normal') {
          style.fontStyle = 'normal';
        } else if (lower === 'italic' || lower.startsWith('oblique')) {
          style.fontStyle = 'italic';
        }
        break;
      case 'font-family':
        set('fontFamily', toFontFamily(value, ctx.allowedFontFamilies));
        break;
      case 'text-decoration':
      case 'text-decoration-line':
        set('textDecorationLine', toTextDecoration(value));
        break;
      case 'text-align':
        set('textAlign', toTextAlign(value));
        break;
      case 'text-transform':
        if (TEXT_TRANSFORM.has(lower)) {
          style.textTransform = lower as TextStyle['textTransform'];
        }
        break;
      case 'line-height': {
        if (lower === 'normal') {
          break;
        }
        const match = LENGTH.exec(lower);
        if (match && match[2] === undefined) {
          const n = Number(match[1]);
          set('lineHeight', n > 0 ? n * fontSize : undefined);
        } else if (match?.[2] === '%') {
          set('lineHeight', (Number(match[1]) / 100) * fontSize);
        } else {
          const length = toLength(lower, fontSize, baseFontSize);
          set(
            'lineHeight',
            typeof length === 'number' && length > 0 ? length : undefined
          );
        }
        break;
      }
      case 'letter-spacing': {
        const length = toLength(lower, fontSize, baseFontSize);
        set('letterSpacing', typeof length === 'number' ? length : undefined);
        break;
      }
      case 'margin':
      case 'padding':
        applyBox(style, property, lower, fontSize, baseFontSize);
        break;
      case 'margin-top':
      case 'margin-right':
      case 'margin-bottom':
      case 'margin-left':
      case 'padding-top':
      case 'padding-right':
      case 'padding-bottom':
      case 'padding-left': {
        const [prefix, side] = property.split('-') as [
          'margin' | 'padding',
          string,
        ];
        applySide(
          style,
          prefix,
          (side.charAt(0).toUpperCase() + side.slice(1)) as Side,
          lower,
          fontSize,
          baseFontSize
        );
        break;
      }
      case 'width':
      case 'height':
      case 'min-width':
      case 'max-width':
      case 'min-height':
      case 'max-height': {
        const length = toLength(lower, fontSize, baseFontSize, true);
        if (
          length !== undefined &&
          (typeof length !== 'number' || length >= 0)
        ) {
          (style as Record<string, unknown>)[SIZE_PROPERTIES[property]!] =
            length;
        }
        break;
      }
      case 'opacity': {
        const n = Number(lower);
        if (lower !== '' && Number.isFinite(n)) {
          style.opacity = Math.min(1, Math.max(0, n));
        }
        break;
      }
      case 'display':
        result.display = lower;
        break;
      case 'list-style-type':
      case 'list-style': {
        const type = lower
          .split(/\s+/)
          .find((token) => LIST_STYLE_TYPES.has(token));
        if (type) {
          result.listStyleType = type;
        }
        break;
      }
    }
  }

  return result;
}
