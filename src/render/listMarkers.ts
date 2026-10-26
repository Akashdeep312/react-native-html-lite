const UNORDERED_BY_DEPTH = ['disc', 'circle', 'square'] as const;

const BULLETS: Readonly<Record<string, string>> = {
  disc: '•',
  circle: '◦',
  square: '▪',
};

/** Maps the legacy `type` attribute of `<ol>`/`<ul>`/`<li>` to a list style. */
const TYPE_ATTRIBUTE: Readonly<Record<string, string>> = {
  '1': 'decimal',
  'a': 'lower-alpha',
  'A': 'upper-alpha',
  'i': 'lower-roman',
  'I': 'upper-roman',
  'disc': 'disc',
  'circle': 'circle',
  'square': 'square',
  'none': 'none',
};

export function listStyleFromTypeAttribute(
  type: string | undefined
): string | undefined {
  if (type === undefined) {
    return undefined;
  }
  // Case matters for ordered types ("a" vs "A"), not for bullet names.
  return TYPE_ATTRIBUTE[type] ?? TYPE_ATTRIBUTE[type.toLowerCase()];
}

export function defaultListStyle(ordered: boolean, depth: number): string {
  return ordered
    ? 'decimal'
    : UNORDERED_BY_DEPTH[Math.min(depth, UNORDERED_BY_DEPTH.length - 1)]!;
}

function toAlpha(n: number): string {
  let out = '';
  while (n > 0) {
    n--;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];

function toRoman(n: number): string {
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/** Returns the marker text for a list item, or '' for `none`. */
export function listMarker(listStyleType: string, index: number): string {
  const bullet = BULLETS[listStyleType];
  if (bullet) {
    return bullet;
  }
  if (listStyleType === 'none') {
    return '';
  }
  // Alphabetic and roman counters are only defined for positive numbers.
  const counter =
    index > 0 && index < 4000
      ? {
          'lower-alpha': () => toAlpha(index),
          'lower-latin': () => toAlpha(index),
          'upper-alpha': () => toAlpha(index).toUpperCase(),
          'upper-latin': () => toAlpha(index).toUpperCase(),
          'lower-roman': () => toRoman(index),
          'upper-roman': () => toRoman(index).toUpperCase(),
        }[listStyleType]
      : undefined;
  return `${counter ? counter() : index}.`;
}
