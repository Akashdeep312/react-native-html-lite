/**
 * Expected parser output, shared by the JS parser tests and the C++ parser
 * tests. Both implementations must produce exactly these trees.
 */
import type { HtmlElement, HtmlNode, HtmlText } from '../parser/types';

export interface ParserCase {
  name: string;
  html: string;
  maxDepth?: number;
  expected: HtmlNode[];
}

export const t = (data: string): HtmlText => ({ type: 'text', data });

export function el(
  name: string,
  attributesOrChild?: Record<string, string> | HtmlNode | string,
  ...rest: Array<HtmlNode | string>
): HtmlElement {
  const isAttributes =
    attributesOrChild !== undefined &&
    typeof attributesOrChild === 'object' &&
    !('type' in attributesOrChild);
  const children = (
    isAttributes || attributesOrChild === undefined
      ? rest
      : [attributesOrChild as HtmlNode | string, ...rest]
  ).map((child) => (typeof child === 'string' ? t(child) : child));
  return {
    type: 'element',
    name,
    attributes: isAttributes
      ? (attributesOrChild as Record<string, string>)
      : {},
    children,
  };
}

export const parserCases: ParserCase[] = [
  // Basics
  { name: 'empty input', html: '', expected: [] },
  { name: 'plain text', html: 'Hello', expected: [t('Hello')] },
  {
    name: 'whitespace is preserved',
    html: '  a \n\t b  ',
    expected: [t('  a \n\t b  ')],
  },
  {
    name: 'nested inline elements',
    html: '<p>Hello <b>bold <i>both</i></b>!</p>',
    expected: [el('p', 'Hello ', el('b', 'bold ', el('i', 'both')), '!')],
  },
  {
    name: 'tag and attribute names are lowercased',
    html: '<P CLASS="Intro" Data-X="Y">x</P>',
    expected: [el('p', { 'class': 'Intro', 'data-x': 'Y' }, 'x')],
  },
  {
    name: 'non-ASCII is not lowercased',
    html: '<DİV>x</DİV>',
    expected: [el('dİv', 'x')],
  },
  {
    name: 'CRLF and CR are normalized',
    html: 'a\r\nb\rc',
    expected: [t('a\nb\nc')],
  },
  {
    name: 'unicode text passes through',
    html: '<p>नमस्ते 😀 café</p>',
    expected: [el('p', 'नमस्ते 😀 café')],
  },

  // Attributes
  {
    name: 'attribute quoting styles',
    html: `<a href="/x" title='y z' data-n=5 hidden>a</a>`,
    expected: [
      el(
        'a',
        { 'href': '/x', 'title': 'y z', 'data-n': '5', 'hidden': '' },
        'a'
      ),
    ],
  },
  {
    name: 'first duplicate attribute wins',
    html: '<p class="a" class="b">x</p>',
    expected: [el('p', { class: 'a' }, 'x')],
  },
  {
    name: 'attributes without whitespace between them',
    html: '<p a="1"b="2">x</p>',
    expected: [el('p', { a: '1', b: '2' }, 'x')],
  },
  {
    name: 'spaces around equals',
    html: '<p a = "1" b= 2>x</p>',
    expected: [el('p', { a: '1', b: '2' }, 'x')],
  },
  {
    name: 'unquoted value keeps slashes',
    html: '<a href=/path/>x</a>',
    expected: [el('a', { href: '/path/' }, 'x')],
  },
  {
    name: 'empty unquoted value before >',
    html: '<p a=>x</p>',
    expected: [el('p', { a: '' }, 'x')],
  },
  {
    name: 'gt inside quoted attribute',
    html: '<p title="a > b">x</p>',
    expected: [el('p', { title: 'a > b' }, 'x')],
  },
  {
    name: '__proto__ attribute is dropped',
    html: '<p __proto__="x" constructor="y">x</p>',
    expected: [el('p', { constructor: 'y' }, 'x')],
  },
  {
    name: 'attribute entities are decoded',
    html: '<a href="?a=1&amp;b=2&copy=3&lt;" title="&quot;q&quot;">x</a>',
    expected: [el('a', { href: '?a=1&b=2&copy=3<', title: '"q"' }, 'x')],
  },
  {
    name: 'stray slashes in tag',
    html: '<p / class="a" / >x</p>',
    expected: [el('p', { class: 'a' }, 'x')],
  },

  // Character references
  {
    name: 'named entities',
    html: '&amp; &lt; &gt; &quot; &apos; &nbsp; &copy; &euro; &hellip; &rarr;',
    expected: [t('& < > " \'   © € … →')],
  },
  {
    name: 'numeric entities',
    html: '&#65;&#x42;&#X43;&#128512;&#8377;',
    expected: [t('ABC😀₹')],
  },
  {
    name: 'numeric entity without semicolon',
    html: '&#65B',
    expected: [t('AB')],
  },
  {
    name: 'invalid numeric entities become U+FFFD',
    html: '&#0;&#xD800;&#x110000;&#99999999999;',
    expected: [t('����')],
  },
  {
    name: 'windows-1252 numeric remapping',
    html: '&#146;&#150;&#128;&#129;',
    expected: [t('’–€\u0081')],
  },
  {
    name: 'unknown and malformed entities are kept',
    html: '&bogus; & &; &# &#x; AT&T &constructor;',
    expected: [t('&bogus; & &; &# &#x; AT&T &constructor;')],
  },
  {
    name: 'legacy entities without semicolon in text',
    html: '&amp &lt &copy 2024 &ampx &euro',
    expected: [t('& < © 2024 &ampx &euro')],
  },
  {
    name: 'case-sensitive entity names',
    html: '&Eacute;&eacute;&AMP;',
    expected: [t('Éé&AMP;')],
  },

  // Comments, doctype and bogus markup
  {
    name: 'comments are dropped',
    html: 'a<!-- x -->b<!---->c<!-->d<!--->e',
    expected: [t('abcde')],
  },
  {
    name: 'unterminated comment drops the rest',
    html: 'a<!-- b',
    expected: [t('a')],
  },
  {
    name: 'doctype and processing instructions are dropped',
    html: '<!DOCTYPE html><?xml version="1.0"?>x',
    expected: [t('x')],
  },
  {
    name: 'literal less-than signs',
    html: 'a < b <3 <',
    expected: [t('a < b <3 <')],
  },
  {
    name: 'empty and bogus end tags',
    html: 'a</>b</ x>c</',
    expected: [t('abc</')],
  },
  {
    name: 'unterminated start tag drops the rest',
    html: 'before<p class="x',
    expected: [t('before')],
  },
  {
    name: 'unterminated end tag drops the rest',
    html: '<b>x</b',
    expected: [el('b', 'x')],
  },

  // Raw text and dropped elements
  {
    name: 'script and style are dropped',
    html: 'a<script>if (a < b) { x("</p>") }</script>b<style>p{}</style>c',
    expected: [t('abc')],
  },
  {
    name: 'raw text end tag is case-insensitive',
    html: '<SCRIPT>x</ScRiPt >after',
    expected: [t('after')],
  },
  {
    name: 'raw text end tag needs a delimiter',
    html: '<script>a</scripts>b</script>c',
    expected: [t('c')],
  },
  {
    name: 'unterminated script drops the rest',
    html: 'a<script>b',
    expected: [t('a')],
  },
  {
    name: 'svg, math and template subtrees are dropped',
    html: 'a<svg><text>x</text></svg>b<math>y</math>c<template><p>z</p></template>d',
    expected: [t('abcd')],
  },
  {
    name: 'document structure',
    html: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body class="b"><p>x</p></body></html>',
    expected: [
      el('html', { lang: 'en' }, el('body', { class: 'b' }, el('p', 'x'))),
    ],
  },
  {
    name: 'content after body end tag stays in body',
    html: '<body><p>a</p></body>after</html>more',
    expected: [el('body', el('p', 'a'), 'aftermore')],
  },
  {
    name: 'head is closed by body content',
    html: '<head><title>t</title><p>x</p>',
    expected: [el('p', 'x')],
  },
  {
    name: 'duplicate html and body tags are ignored',
    html: '<body>a<body class="x">b<html>c</body>',
    expected: [el('body', 'abc')],
  },

  // Void and self-closing elements
  {
    name: 'void elements',
    html: 'a<br>b<hr><img src="x.png" alt="X">c',
    expected: [
      t('a'),
      el('br'),
      t('b'),
      el('hr'),
      el('img', { src: 'x.png', alt: 'X' }),
      t('c'),
    ],
  },
  {
    name: 'self-closing syntax',
    html: '<br/><div/>after<span />x',
    expected: [el('br'), el('div'), t('after'), el('span'), t('x')],
  },
  {
    name: '</br> becomes <br>',
    html: 'a</br>b',
    expected: [t('a'), el('br'), t('b')],
  },
  {
    name: 'void end tags are ignored',
    html: 'a</img></hr>b',
    expected: [t('ab')],
  },

  // Implied end tags
  {
    name: 'p is closed by block elements',
    html: '<p>a<div>b</div><p>c<ul><li>d</ul>',
    expected: [
      el('p', 'a'),
      el('div', 'b'),
      el('p', 'c'),
      el('ul', el('li', 'd')),
    ],
  },
  {
    name: 'p is closed through inline elements',
    html: '<p><span>a<h1>b</h1>',
    expected: [el('p', el('span', 'a')), el('h1', 'b')],
  },
  {
    name: 'p is not closed across a table cell',
    html: '<p><table><tr><td>a<div>b</div></td></tr></table>',
    expected: [el('p'), el('table', el('tr', el('td', 'a', el('div', 'b'))))],
  },
  {
    name: 'unclosed li',
    html: '<ul><li>a<li>b<li>c</ul>',
    expected: [el('ul', el('li', 'a'), el('li', 'b'), el('li', 'c'))],
  },
  {
    name: 'li closes through div but not through nested lists',
    html: '<ul><li><div>a<li>b</ul><ol><li>x<ul><li>y</ul><li>z</ol>',
    expected: [
      el('ul', el('li', el('div', 'a')), el('li', 'b')),
      el('ol', el('li', 'x', el('ul', el('li', 'y'))), el('li', 'z')),
    ],
  },
  {
    name: 'li with p inside',
    html: '<ul><li><p>a<li><p>b</ul>',
    expected: [el('ul', el('li', el('p', 'a')), el('li', el('p', 'b')))],
  },
  {
    name: 'dd and dt close each other',
    html: '<dl><dt>a<dd>b<dt>c<dd>d</dl>',
    expected: [
      el('dl', el('dt', 'a'), el('dd', 'b'), el('dt', 'c'), el('dd', 'd')),
    ],
  },
  {
    name: 'unclosed table rows and cells',
    html: '<table><tr><th>a<th>b<tr><td>c<td>d</table>',
    expected: [
      el(
        'table',
        el('tr', el('th', 'a'), el('th', 'b')),
        el('tr', el('td', 'c'), el('td', 'd'))
      ),
    ],
  },
  {
    name: 'table sections',
    html: '<table><thead><tr><th>h<tbody><tr><td>b<tfoot><tr><td>f</table>',
    expected: [
      el(
        'table',
        el('thead', el('tr', el('th', 'h'))),
        el('tbody', el('tr', el('td', 'b'))),
        el('tfoot', el('tr', el('td', 'f')))
      ),
    ],
  },
  {
    name: 'nested tables keep their own rows',
    html: '<table><tr><td><table><tr><td>x</table><td>y</table>',
    expected: [
      el(
        'table',
        el('tr', el('td', el('table', el('tr', el('td', 'x')))), el('td', 'y'))
      ),
    ],
  },
  {
    name: 'headings do not nest',
    html: '<h1>a<h2>b</h2>',
    expected: [el('h1', 'a'), el('h2', 'b')],
  },
  {
    name: 'nested anchors are closed',
    html: '<a href="1">a<a href="2">b</a>',
    expected: [el('a', { href: '1' }, 'a'), el('a', { href: '2' }, 'b')],
  },
  {
    name: 'pre drops a leading newline',
    html: '<pre>\n  code\n</pre><pre>\n\nx</pre>',
    expected: [el('pre', '  code\n'), el('pre', '\nx')],
  },

  // Stray and misnested end tags
  {
    name: 'stray end tags are ignored',
    html: 'a</span></p></div>b',
    expected: [t('ab')],
  },
  {
    name: 'misnested inline elements',
    html: '<b>a<i>b</b>c</i>',
    expected: [el('b', 'a', el('i', 'b')), t('c')],
  },
  {
    name: 'inline end tag cannot close a block',
    html: '<span><div>a</span>b</div>c',
    expected: [el('span', el('div', 'ab'), 'c')],
  },
  {
    name: 'div end tag cannot leave a table cell',
    html: '<div><table><tr><td>a</div>b</td></tr></table>c</div>',
    expected: [el('div', el('table', el('tr', el('td', 'ab'))), 'c')],
  },
  {
    name: 'li end tag stops at a list',
    html: '<ul><li>a<ol><li>b</li></li></ol>c</ul>',
    expected: [el('ul', el('li', 'a', el('ol', el('li', 'b')), 'c'))],
  },
  {
    name: 'end tags close implied children',
    html: '<div><p>a<b>b</div>c',
    expected: [el('div', el('p', 'a', el('b', 'b'))), t('c')],
  },
  {
    name: 'unclosed elements at end of input',
    html: '<div><p><b>a',
    expected: [el('div', el('p', el('b', 'a')))],
  },

  // Depth limit
  {
    name: 'elements beyond maxDepth are flattened',
    html: '<div><div><div><b>deep</b></div></div></div>after',
    maxDepth: 2,
    expected: [el('div', el('div', 'deep')), t('after')],
  },
  {
    name: 'void elements beyond maxDepth are dropped',
    html: '<p>a<br>b</p>',
    maxDepth: 1,
    expected: [el('p', 'ab')],
  },
];
