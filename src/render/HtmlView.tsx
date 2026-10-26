import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { parseHtml } from '../parser/parseHtml';
import type { HtmlNode, ParserMode } from '../parser/types';
import { HtmlRenderer, type RenderConfig } from './renderer';

export interface HtmlViewProps extends RenderConfig {
  /** HTML to render. Ignored when `nodes` is provided. */
  html?: string;
  /** A tree from `parseHtml`, to parse once and render many times. */
  nodes?: readonly HtmlNode[];
  /** Style of the root container `<View>`. */
  style?: StyleProp<ViewStyle>;
  /** See `ParseOptions.parser`. Default: `auto`. */
  parser?: ParserMode;
  /** See `ParseOptions.maxDepth`. Default: 256. */
  maxDepth?: number;
}

/**
 * Renders HTML with native `<Text>` and `<View>` components.
 *
 * Returns null when the HTML has no visible content.
 */
export function HtmlView({
  html,
  nodes,
  style,
  parser,
  maxDepth,
  ...config
}: HtmlViewProps) {
  const parsed = useMemo(
    () => nodes ?? parseHtml(html ?? '', { parser, maxDepth }),
    [nodes, html, parser, maxDepth]
  );
  return <>{new HtmlRenderer(config).render(parsed, style)}</>;
}
