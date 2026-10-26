/* eslint-disable no-bitwise -- byte-level parsing and PRNG arithmetic */
/** Deterministic generator of messy, HTML-like strings for parity testing. */
const PIECES = [
  '<p>',
  '</p>',
  '<div>',
  '</div>',
  '<span>',
  '</span>',
  '<b>',
  '</b>',
  '<i>',
  '</i>',
  '<ul>',
  '</ul>',
  '<ol start="3">',
  '</ol>',
  '<li>',
  '</li>',
  '<a href="x?a=1&amp;b">',
  '</a>',
  '<table>',
  '</table>',
  '<tr>',
  '</tr>',
  '<td>',
  '</td>',
  '<th>',
  '<tbody>',
  '<h1>',
  '</h1>',
  '<h2>',
  '<pre>\n',
  '</pre>',
  '<br>',
  '</br>',
  '<br/>',
  '<hr>',
  '<img src="https://e.com/a.png">',
  '<script>x</script>',
  '<style>p{}</style>',
  '<svg><p>s</p></svg>',
  '<!-- c -->',
  '<!---->',
  '<!doctype html>',
  '<?pi?>',
  '<html>',
  '<head>',
  '</head>',
  '<body>',
  '</body>',
  '</html>',
  '<title>t</title>',
  '<dl>',
  '<dt>',
  '<dd>',
  '<blockquote>',
  '<template>',
  '</template>',
  '<P CLASS=X>',
  '<div/>',
  '<span a=1 b="2" c=\'3\' d>',
  '<',
  '>',
  '</',
  '</>',
  '&',
  '&amp;',
  '&lt',
  '&copy;',
  '&#65;',
  '&#x1F600;',
  '&#146;',
  '&bogus;',
  '&nbsp;',
  '&#0;',
  ' ',
  '  ',
  '\n',
  '\r\n',
  '\t',
  'text',
  'Ünï',
  '😀',
  '₹',
  'a',
  'B',
  '=',
  '"',
  "'",
  '<p title="unterminated',
  '<!-- open',
  '<script>open',
];

export function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function randomHtml(random: () => number, pieces = 30): string {
  let out = '';
  for (let i = 0; i < pieces; i++) {
    out += PIECES[Math.floor(random() * PIECES.length)];
  }
  return out;
}
