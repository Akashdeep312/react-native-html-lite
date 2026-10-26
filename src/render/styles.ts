import type { TextStyle, ViewStyle } from 'react-native';

/** React Native's strict style types are read-only; styles are built mutably. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Text style properties that descendants inherit, as in CSS. */
const INHERITED_TEXT_KEYS = new Set<string>([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'includeFontPadding',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textAlignVertical',
  'textDecorationColor',
  'textDecorationLine',
  'textDecorationStyle',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
  'textTransform',
  'userSelect',
  'verticalAlign',
  'writingDirection',
]);

export interface SplitStyle {
  /** Inherited text properties. */
  text: TextStyle;
  /** Everything else: layout, box and background properties. */
  view: ViewStyle;
}

export function splitStyle(style: TextStyle): SplitStyle {
  const text: Record<string, unknown> = {};
  const view: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) {
      continue;
    }
    (INHERITED_TEXT_KEYS.has(key) ? text : view)[key] = value;
  }
  return { text: text as TextStyle, view: view as ViewStyle };
}

/** The part of an inline element's style that a nested `<Text>` can apply. */
export function inlineTextStyle(style: TextStyle): TextStyle {
  const { text, view } = splitStyle(style);
  return view.backgroundColor !== undefined
    ? { ...text, backgroundColor: view.backgroundColor }
    : text;
}

export function isEmptyStyle(style: object): boolean {
  for (const _ in style) {
    return false;
  }
  return true;
}

const SIDES = ['Top', 'Right', 'Bottom', 'Left', 'Start', 'End'];

/** Longhand properties that a shorthand replaces, as in CSS. */
const SHORTHANDS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(
    (['margin', 'padding'] as const).flatMap((box) => [
      [
        box,
        [
          ...SIDES.map((side) => box + side),
          `${box}Vertical`,
          `${box}Horizontal`,
        ],
      ],
      [`${box}Vertical`, [`${box}Top`, `${box}Bottom`]],
      [
        `${box}Horizontal`,
        [`${box}Left`, `${box}Right`, `${box}Start`, `${box}End`],
      ],
    ])
  ),
  borderWidth: SIDES.map((side) => `border${side}Width`),
  borderColor: SIDES.map((side) => `border${side}Color`),
  borderRadius: [
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'borderTopStartRadius',
    'borderTopEndRadius',
    'borderBottomStartRadius',
    'borderBottomEndRadius',
  ],
};

/**
 * Merges `layer` into `target` so that later layers win, as in CSS.
 *
 * Plain assignment isn't enough in React Native: `marginVertical` beats
 * `margin` whatever order they're set in, so a user's `margin: 0` couldn't
 * override a default `marginVertical`. A shorthand in `layer` therefore
 * removes the longhands it covers from `target`.
 */
export function mergeStyle(
  target: Record<string, unknown>,
  layer: object | null | undefined
): void {
  if (!layer) {
    return;
  }
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined) {
      continue;
    }
    for (const longhand of SHORTHANDS[key] ?? []) {
      delete target[longhand];
    }
    target[key] = value;
  }
}
