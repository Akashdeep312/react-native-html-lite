import type { HtmlNode, HtmlText } from '../parser/types';

const COLLAPSIBLE = /[ \t\n\f\r]+/g;

/**
 * Applies CSS `white-space: normal` to a run of inline nodes that renders as a
 * single line box: whitespace sequences collapse to one space, and spaces at
 * the start of the run, after a line break, at the end of the run, and before
 * a line break are removed. Returns new nodes; the input is not modified.
 *
 * Returns null if the run has no visible content.
 */
export function collapseWhitespace(
  nodes: readonly HtmlNode[],
  isHidden: (node: HtmlNode) => boolean
): HtmlNode[] | null {
  let lastWasSpace = true;
  let hasContent = false;
  // Text nodes since the last line break, for trimming trailing spaces.
  let line: HtmlText[] = [];

  const trimLineEnd = () => {
    for (let i = line.length - 1; i >= 0; i--) {
      const text = line[i]!;
      text.data = text.data.replace(/ +$/, '');
      if (text.data) {
        break;
      }
    }
    line = [];
  };

  const walk = (children: readonly HtmlNode[]): HtmlNode[] => {
    const out: HtmlNode[] = [];
    for (const node of children) {
      if (node.type === 'text') {
        let data = node.data.replace(COLLAPSIBLE, ' ');
        if (lastWasSpace && data.startsWith(' ')) {
          data = data.slice(1);
        }
        if (data) {
          lastWasSpace = data.endsWith(' ');
          const text: HtmlText = { type: 'text', data };
          out.push(text);
          line.push(text);
        }
        continue;
      }
      if (isHidden(node)) {
        continue;
      }
      if (node.name === 'br') {
        trimLineEnd();
        lastWasSpace = true;
        hasContent = true;
        out.push(node);
        continue;
      }
      out.push({ ...node, children: walk(node.children) });
    }
    return out;
  };

  const result = walk(nodes);
  trimLineEnd();
  return hasContent || hasText(result) ? result : null;
}

function hasText(nodes: readonly HtmlNode[]): boolean {
  return nodes.some((node) =>
    node.type === 'text' ? node.data !== '' : hasText(node.children)
  );
}
