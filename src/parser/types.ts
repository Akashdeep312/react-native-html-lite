export interface HtmlText {
  type: 'text';
  /** Decoded text. Whitespace is preserved exactly as in the source. */
  data: string;
}

export interface HtmlElement {
  type: 'element';
  /** Lowercase tag name. */
  name: string;
  /** Lowercase attribute names mapped to decoded values. */
  attributes: Record<string, string>;
  children: HtmlNode[];
}

export type HtmlNode = HtmlElement | HtmlText;

/**
 * - `auto`: the native C++ parser when it is linked into the app, otherwise
 *   the JS parser.
 * - `native`: the native parser; throws if it is not linked.
 * - `js`: the JS parser.
 *
 * Both parsers implement the same algorithm and produce identical trees.
 */
export type ParserMode = 'auto' | 'native' | 'js';

export interface ParseOptions {
  /**
   * Elements nested deeper than this are dropped (their content is kept).
   * Clamped to 1..1024. Default: 256.
   */
  maxDepth?: number;
  /** Default: `auto`. */
  parser?: ParserMode;
}
