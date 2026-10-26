import { parserCases } from '../__fixtures__/parserCases';
import { parseHtmlJs } from '../parser/jsParser';

describe('JS parser', () => {
  it.each(parserCases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    expect(parseHtmlJs(c.html, c.maxDepth)).toEqual(c.expected);
  });

  it('handles deeply nested input without exceeding the depth limit', () => {
    const html = '<div>'.repeat(5000) + 'x';
    let depth = 0;
    let nodes = parseHtmlJs(html);
    while (nodes[0]?.type === 'element') {
      depth++;
      nodes = nodes[0].children;
    }
    expect(depth).toBe(256);
    expect(nodes).toEqual([{ type: 'text', data: 'x' }]);
  });

  it('parses large documents in linear-ish time', () => {
    const html = '<p>Lorem <b>ipsum</b> &amp; dolor</p>'.repeat(20000);
    const start = Date.now();
    expect(parseHtmlJs(html)).toHaveLength(20000);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
