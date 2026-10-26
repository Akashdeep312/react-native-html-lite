import { fireEvent, render, screen } from '@testing-library/react-native';
import { Image, Linking, StyleSheet, Text } from 'react-native';

import { HtmlView, parseHtml, type HtmlViewProps } from '../index';

type Json = ReturnType<typeof screen.toJSON>;
type JsonNode = Exclude<Json, null | unknown[]> & {
  type: string;
  props: Record<string, any>;
  children: Array<JsonNode | string> | null;
};

function renderHtml(html: string, props: Partial<HtmlViewProps> = {}) {
  render(<HtmlView html={html} parser="js" {...props} />);
  return screen.toJSON() as JsonNode | null;
}

function findAll(
  node: JsonNode | string | null,
  predicate: (n: JsonNode) => boolean,
  out: JsonNode[] = []
): JsonNode[] {
  if (node && typeof node !== 'string') {
    if (predicate(node)) {
      out.push(node);
    }
    node.children?.forEach((child) => findAll(child, predicate, out));
  }
  return out;
}

/** Top-level Text elements: one per line box. */
function lines(tree: JsonNode | null): JsonNode[] {
  const out: JsonNode[] = [];
  const walk = (node: JsonNode | string) => {
    if (typeof node === 'string') {
      return;
    }
    if (node.type === 'Text') {
      out.push(node);
      return;
    }
    node.children?.forEach(walk);
  };
  if (tree) {
    walk(tree);
  }
  return out;
}

function textContent(node: JsonNode | string): string {
  return typeof node === 'string'
    ? node
    : (node.children ?? []).map(textContent).join('');
}

const flat = (node: JsonNode) => StyleSheet.flatten(node.props.style) ?? {};

describe('HtmlView', () => {
  it('renders nothing for empty or invisible content', () => {
    expect(renderHtml('')).toBeNull();
    expect(renderHtml('  \n <!-- c --> <script>x</script>')).toBeNull();
    expect(renderHtml('<p style="display:none">x</p>')).toBeNull();
  });

  it('groups inline content into one Text per block and collapses whitespace', () => {
    const tree = renderHtml(
      '<p>\n  Hello   <b> big </b>\n world  </p><p>second</p>trailing'
    );
    expect(lines(tree).map(textContent)).toEqual([
      'Hello big world',
      'second',
      'trailing',
    ]);
  });

  it('keeps non-breaking spaces and trims around line breaks', () => {
    const tree = renderHtml('<p>a&nbsp;&nbsp;b <br> c</p>');
    expect(lines(tree).map(textContent)).toEqual(['a  b\nc']);
  });

  it('preserves whitespace in pre', () => {
    const tree = renderHtml('<pre>\n  a  <b>b</b>\n\n c</pre>');
    expect(lines(tree).map(textContent)).toEqual(['  a  b\n\n c']);
  });

  it('applies default inline styles through nested Text', () => {
    const tree = renderHtml('<p><b>bold <i>both</i></b></p>');
    const bold = findAll(
      tree,
      (n) => n.type === 'Text' && flat(n).fontWeight === 'bold'
    );
    const italic = findAll(
      tree,
      (n) => n.type === 'Text' && flat(n).fontStyle === 'italic'
    );
    expect(bold.map(textContent)).toEqual(['bold both']);
    expect(italic.map(textContent)).toEqual(['both']);
  });

  it('applies styles with precedence defaults < tag < class < inline', () => {
    const tree = renderHtml(
      '<p class="a b" style="color: #ff0000">x</p><p class="a">y</p><p>z</p><h1>h</h1>',
      {
        tagsStyles: { p: { color: 'green', marginVertical: 0 } },
        classesStyles: { a: { color: 'blue' }, b: { fontSize: 20 } },
        useDefaultStyles: true,
      }
    );
    const [x, y, z, h] = lines(tree);
    expect(flat(x!)).toMatchObject({ color: '#ff0000', fontSize: 20 });
    expect(flat(y!)).toMatchObject({ color: 'blue' });
    expect(flat(z!)).toMatchObject({ color: 'green' });
    expect(flat(h!)).toMatchObject({ fontSize: 28, fontWeight: 'bold' });
  });

  it('lets shorthand styles override default longhands', () => {
    const tree = renderHtml(
      '<p>a</p><ul><li>b</li></ul><p class="spaced" style="margin-top: 3px">c</p>',
      {
        tagsStyles: { p: { margin: 0 }, ul: { margin: 2, paddingLeft: 6 } },
        classesStyles: { spaced: { marginVertical: 8 } },
      }
    );
    // root, p, ul, li row, li content, p
    const views = findAll(tree, (n) => n.type === 'View').map(flat);
    expect(views).toHaveLength(6);
    const [, p, ul, , , last] = views;
    expect(p).toEqual({ margin: 0 });
    expect(ul).toEqual({ margin: 2, paddingLeft: 6 });
    expect(last).toEqual({ margin: 0, marginVertical: 8, marginTop: 3 });
  });

  it('inherits text styles across blocks and from baseStyle', () => {
    const tree = renderHtml('<div style="color: red"><p>x</p></div>', {
      baseStyle: { fontSize: 18, fontFamily: 'Base', padding: 4 },
    });
    expect(flat(lines(tree)[0]!)).toMatchObject({
      color: 'red',
      fontSize: 18,
      fontFamily: 'Base',
    });
    expect(flat(tree!)).toMatchObject({ padding: 4 });
    expect(flat(tree!).fontSize).toBeUndefined();
  });

  it('applies textProps to every line and list marker', () => {
    const tree = renderHtml('<p>a</p><ul><li>b</li></ul>', {
      textProps: { allowFontScaling: false },
    });
    const texts = lines(tree);
    expect(texts).toHaveLength(3);
    texts.forEach((t) => expect(t.props.allowFontScaling).toBe(false));
  });

  it('calls onLinkPress with the href', () => {
    const onLinkPress = jest.fn();
    render(
      <HtmlView
        parser="js"
        html='<p>Read <a href="https://e.com/t?a=1&amp;b=2">terms</a></p>'
        onLinkPress={onLinkPress}
      />
    );
    fireEvent.press(screen.getByText('terms'));
    expect(onLinkPress).toHaveBeenCalledWith(
      'https://e.com/t?a=1&b=2',
      expect.objectContaining({ name: 'a' })
    );
    expect(screen.getByRole('link')).toBeTruthy();
  });

  it('opens only safe link schemes by default', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(
      <HtmlView
        parser="js"
        html='<a href="javascript:alert(1)">bad</a> <a href="intent://x">intent</a> <a href=" https://ok.com ">good</a>'
      />
    );
    fireEvent.press(screen.getByText('bad'));
    fireEvent.press(screen.getByText('intent'));
    fireEvent.press(screen.getByText('good'));
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith('https://ok.com');
    openURL.mockRestore();
  });

  it('does not style anchors without href as links', () => {
    const tree = renderHtml('<a name="top">anchor</a>');
    expect(
      findAll(tree, (n) => flat(n).textDecorationLine === 'underline')
    ).toHaveLength(0);
  });

  it('renders an inline element containing blocks as a block', () => {
    const onLinkPress = jest.fn();
    render(
      <HtmlView
        parser="js"
        html='<a href="https://e.com"><div>Card title</div><p>Card body</p></a>'
        onLinkPress={onLinkPress}
      />
    );
    fireEvent.press(screen.getByText('Card body'));
    expect(onLinkPress).toHaveBeenCalledWith(
      'https://e.com',
      expect.anything()
    );
  });

  it('renders list markers', () => {
    const tree = renderHtml(
      '<ul><li>a<ul><li>b<ul><li>c</ul></ul></ul>' +
        '<ol start="9"><li>x<li value="20">y<li>z</ol>' +
        '<ol type="a"><li>p<li>q</ol>' +
        '<ol style="list-style-type: upper-roman"><li>r<li>s<li>t<li>u</ol>' +
        '<ul style="list-style: none"><li>plain</ul>' +
        '<li>orphan'
    );
    const markers = findAll(
      tree,
      (n) => n.type === 'Text' && n.props.importantForAccessibility === 'no'
    ).map(textContent);
    expect(markers).toEqual([
      '•',
      '◦',
      '▪',
      '9.',
      '20.',
      '21.',
      'a.',
      'b.',
      'I.',
      'II.',
      'III.',
      'IV.',
      '•',
    ]);
    expect(lines(tree).map(textContent)).toContain('plain');
  });

  it('removes vertical margins from nested lists only', () => {
    const tree = renderHtml('<ul><li>a<ul><li>b</ul></ul>');
    const lists = findAll(
      tree,
      (n) => n.type === 'View' && flat(n).marginVertical !== undefined
    );
    expect(lists.map((n) => flat(n).marginVertical)).toEqual([14, 0]);
  });

  it('lays out table rows horizontally with colspan', () => {
    const tree = renderHtml(
      '<table><tr><th>a</th><th>b</th></tr><tr><td colspan="2" bgcolor="#eeeeee">c</td></tr></table>'
    );
    const rows = findAll(tree, (n) => flat(n).flexDirection === 'row');
    expect(rows).toHaveLength(2);
    const wide = findAll(tree, (n) => flat(n).flex === 2);
    expect(wide).toHaveLength(1);
    expect(flat(wide[0]!)).toMatchObject({ backgroundColor: '#eeeeee' });
  });

  it('hides ignored tags and display:none elements', () => {
    const tree = renderHtml(
      '<p>a<span style="display: none">hidden</span><span class="x">gone</span>b</p><footer>f</footer>',
      { ignoredTags: ['footer'], classesStyles: { x: { display: 'none' } } }
    );
    expect(lines(tree).map(textContent)).toEqual(['ab']);
  });

  it('supports custom renderers for inline and block elements', () => {
    const tree = renderHtml(
      '<p>Price: <price>100</price></p><callout>Note</callout>',
      {
        renderers: {
          price: ({ children, inline }) => (
            <Text testID="price">
              ₹{children}
              {inline ? '' : '!'}
            </Text>
          ),
          callout: ({ node }) => <Text testID="callout">[{node.name}]</Text>,
        },
      }
    );
    expect(screen.getByTestId('price')).toHaveTextContent('₹100');
    expect(lines(tree).map(textContent)).toEqual(['Price: ₹100', '[callout]']);
  });

  it('resolves font families for weight and style', () => {
    const resolveFontFamily = jest.fn(({ fontFamily, fontWeight }) =>
      fontFamily === 'Poppins'
        ? fontWeight === 'bold'
          ? 'Poppins-Bold'
          : 'Poppins-Regular'
        : undefined
    );
    const tree = renderHtml('<p>a <b>b</b></p>', {
      baseStyle: { fontFamily: 'Poppins' },
      resolveFontFamily,
    });
    const [line] = lines(tree);
    expect(flat(line!).fontFamily).toBe('Poppins-Regular');
    const bold = findAll(tree, (n) => flat(n).fontWeight === 'bold');
    expect(flat(bold[0]!).fontFamily).toBe('Poppins-Bold');
  });

  it('only accepts allowed font families from markup', () => {
    const tree = renderHtml(
      '<p style="font-family: Comic Sans">a</p><p><font face="Brand" color="red" size="5">b</font></p>',
      { allowedFontFamilies: ['Brand'] }
    );
    const [a, b] = lines(tree);
    expect(flat(a!).fontFamily).toBeUndefined();
    const font = findAll(b!, (n) => flat(n).color === 'red');
    expect(flat(font[0]!)).toMatchObject({ fontFamily: 'Brand', fontSize: 21 });
  });

  it('renders images with known dimensions and skips unsafe sources', () => {
    render(
      <HtmlView
        parser="js"
        html='<img src="https://e.com/a.png" width="300" height="150" alt="A"><img src="javascript:x" width="1" height="1"><img src="file:///etc/passwd" width="1" height="1">'
      />
    );
    const images = screen.UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0]!.props.source).toEqual({ uri: 'https://e.com/a.png' });
    expect(StyleSheet.flatten(images[0]!.props.style)).toMatchObject({
      maxWidth: 300,
      aspectRatio: 2,
    });
    expect(screen.getByLabelText('A')).toBeTruthy();
  });

  it('accepts a pre-parsed tree', () => {
    const nodes = parseHtml('<p>pre-parsed</p>');
    render(<HtmlView nodes={nodes} />);
    expect(screen.getByText('pre-parsed')).toBeTruthy();
  });

  it('renders real-world policy markup', () => {
    const tree = renderHtml(
      `<p><span style="color:#AFE4FF; -webkit-text-fill-color: #0b5394">Free cancellation</span> until <b>24 hrs</b> before check-in.</p>
       <ul><li>Valid ID required<li>No pets</ul>
       <p class="text-green">Breakfast included</p>`,
      { classesStyles: { 'text-green': { color: '#1e8449' } } }
    );
    expect(lines(tree).map(textContent)).toEqual([
      'Free cancellation until 24 hrs before check-in.',
      '•',
      'Valid ID required',
      '•',
      'No pets',
      'Breakfast included',
    ]);
    expect(findAll(tree, (n) => flat(n).color === '#0b5394')).toHaveLength(1);
    expect(flat(lines(tree)[5]!).color).toBe('#1e8449');
  });
});
