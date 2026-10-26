import NativeHtmlLite from '../NativeHtmlLite';
import { normalizeMaxDepth, parseHtmlJs } from './jsParser';
import type { HtmlNode, ParseOptions } from './types';

/**
 * Whether the native C++ parser is linked into the running app.
 *
 * It is unavailable when the host app was built without this package's native
 * code, for example a mini app loaded into a host that has not been rebuilt.
 */
export function isNativeParserAvailable(): boolean {
  return NativeHtmlLite != null;
}

/**
 * Parses an HTML string into a node tree, synchronously.
 *
 * Malformed markup never throws: the parser recovers the way browsers do for
 * the common cases (unclosed `<p>`/`<li>`/`<td>`, stray end tags, unknown
 * entities). See docs/PARSER.md for the exact rules.
 */
export function parseHtml(
  html: string,
  options: ParseOptions = {}
): HtmlNode[] {
  const { parser = 'auto' } = options;
  const maxDepth = normalizeMaxDepth(options.maxDepth);

  if (!html) {
    return [];
  }

  if (parser !== 'js') {
    if (NativeHtmlLite) {
      return NativeHtmlLite.parse(html, maxDepth) as HtmlNode[];
    }
    if (parser === 'native') {
      throw new Error(
        "react-native-html-lite: the native parser is not linked. Rebuild the app with this package installed, or use parser: 'auto' or 'js'."
      );
    }
  }

  return parseHtmlJs(html, maxDepth);
}
