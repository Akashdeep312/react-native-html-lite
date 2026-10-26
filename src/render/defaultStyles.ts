import { StyleSheet, type TextStyle } from 'react-native';

import { MONOSPACE_FONT } from './css';

export type HtmlStyle = TextStyle;
export type HtmlStyles = Readonly<Record<string, HtmlStyle>>;

export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_LINK_COLOR = '#245dc1';

/**
 * Browser-like defaults, scaled to the base font size. Disable them with
 * `useDefaultStyles={false}`; `tagsStyles` always takes precedence.
 */
export function createDefaultStyles(base: number): HtmlStyles {
  const heading = (scale: number, margin: number): HtmlStyle => ({
    fontSize: base * scale,
    fontWeight: 'bold',
    marginVertical: base * scale * margin,
  });
  const bold: HtmlStyle = { fontWeight: 'bold' };
  const italic: HtmlStyle = { fontStyle: 'italic' };
  const underline: HtmlStyle = { textDecorationLine: 'underline' };
  const lineThrough: HtmlStyle = { textDecorationLine: 'line-through' };
  const mono: HtmlStyle = { fontFamily: MONOSPACE_FONT };
  const smaller: HtmlStyle = { fontSize: base * 0.83 };
  const blockMargin: HtmlStyle = { marginVertical: base };
  const indented: HtmlStyle = { marginVertical: base, marginHorizontal: 40 };

  return {
    b: bold,
    strong: bold,
    i: italic,
    em: italic,
    cite: italic,
    var: italic,
    dfn: italic,
    address: italic,
    u: underline,
    ins: underline,
    s: lineThrough,
    strike: lineThrough,
    del: lineThrough,
    a: { color: DEFAULT_LINK_COLOR, textDecorationLine: 'underline' },
    code: mono,
    kbd: mono,
    samp: mono,
    tt: mono,
    pre: { ...mono, ...blockMargin },
    small: smaller,
    sub: smaller,
    sup: smaller,
    big: { fontSize: base * 1.2 },
    mark: { backgroundColor: '#ffff00', color: '#000000' },
    center: { textAlign: 'center' },
    p: blockMargin,
    ul: blockMargin,
    ol: blockMargin,
    dl: blockMargin,
    dd: { marginLeft: 40 },
    blockquote: indented,
    figure: indented,
    h1: heading(2, 0.67),
    h2: heading(1.5, 0.83),
    h3: heading(1.17, 1),
    h4: heading(1, 1.33),
    h5: heading(0.83, 1.67),
    h6: heading(0.67, 2.33),
    hr: {
      marginVertical: base / 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#cccccc',
    },
    td: { padding: 2 },
    th: { padding: 2, fontWeight: 'bold', textAlign: 'center' },
  };
}
