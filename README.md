# react-native-html-lite

Render HTML in React Native with native `<Text>` and `<View>` components. No
WebView, and no runtime dependencies.

- **Fast native parsing.** A small C++ HTML parser runs synchronously over JSI
  as a Turbo Module (New Architecture).
- **Works without the native part.** If the native module isn't linked, an
  identical JS parser takes over automatically. That covers the web, and a JS
  bundle loaded into a host app that hasn't been rebuilt. Both parsers are
  tested against the same fixtures and fuzzed against each other.
- **Forgiving.** Unclosed `<p>`/`<li>`/`<td>`, stray end tags, unknown entities
  and truncated markup never throw.
- **Safe by default.**
  - `<script>`, `<style>`, `<iframe>`, `<svg>` and similar elements are dropped.
  - Links only open `http(s)`, `mailto` and `tel` URLs.
  - Images only load `http(s)` and `data:image/` sources.
  - Inline CSS can only select font families you've allowed, so markup can't
    request a font the app doesn't have.

```tsx
import { HtmlView } from 'react-native-html-lite';

<HtmlView
  html="<p>Check-in from <b>2 PM</b>. <a href='https://example.com'>Policy</a></p>"
  baseStyle={{ fontSize: 15, color: '#222' }}
  tagsStyles={{ p: { marginVertical: 4 }, a: { color: '#245dc1' } }}
  onLinkPress={(href) => openInApp(href)}
/>;
```

## Installation

```sh
npm install react-native-html-lite
# or
yarn add react-native-html-lite
```

Then rebuild the app so the native parser is linked: run `pod install` in
`ios/`, then build for iOS and Android. The native parser needs the New
Architecture. It's developed and tested with React Native 0.84. Without the
native build, the JS parser is used.

## `<HtmlView>` props

| Prop | Type | Description |
| --- | --- | --- |
| `html` | `string` | HTML to render. |
| `nodes` | `HtmlNode[]` | A tree from `parseHtml`, to parse once and render many times. Takes precedence over `html`. |
| `style` | `ViewStyle` | Style of the root container. |
| `baseStyle` | `TextStyle` | Root style. All text inherits its text properties, and its layout properties apply to the container. Its `fontSize` (default 14) scales the default styles. |
| `tagsStyles` | `Record<tag, TextStyle>` | Styles per tag, e.g. `{ p: {...}, li: {...} }`. |
| `classesStyles` | `Record<class, TextStyle>` | Styles per `class` attribute value. |
| `textProps` | `TextProps` | Props for every `<Text>` that starts a line, e.g. `{ allowFontScaling: false }` or `{ selectable: true }`. |
| `onLinkPress` | `(href, element) => void` | Called when a link is pressed. Without it, safe URLs open with `Linking`. |
| `renderers` | `Record<tag, CustomRenderer>` | Custom rendering per tag (see below). |
| `ignoredTags` | `string[]` | Tags to skip, with their content. |
| `enableInlineStyles` | `boolean` | Apply `style="..."` attributes. Default `true`. |
| `allowedFontFamilies` | `string[]` | Font families that inline CSS and `<font face>` may select. Others are ignored. |
| `resolveFontFamily` | `({ fontFamily, fontWeight, fontStyle }) => string \| undefined` | Maps a family plus weight/style to a concrete font, e.g. `Poppins` + bold → `Poppins-Bold`. |
| `markerStyle` | `TextStyle` | Extra style for list markers. |
| `useDefaultStyles` | `boolean` | Browser-like defaults for headings, margins, bold, links and so on. Default `true`. |
| `parser` | `'auto' \| 'native' \| 'js'` | Which parser to use. Default `auto`. |
| `maxDepth` | `number` | Elements nested deeper than this are flattened. Default 256, max 1024. |

Style precedence, lowest first:

1. Defaults.
2. Presentational attributes (`<font color>`, `align`, `bgcolor`).
3. `tagsStyles`.
4. `classesStyles`.
5. Inline `style`.

### Custom renderers

```tsx
<HtmlView
  html="<p>Total: <price>4200</price></p>"
  renderers={{
    price: ({ children, inline }) =>
      inline ? <Text style={{ fontWeight: '600' }}>₹{children}</Text> : null,
  }}
/>
```

A renderer receives `{ node, children, style, textStyle, inline }`. When
`inline` is true, the element is inside a line of text, so return something
that is valid inside `<Text>`.

## Parsing only

```ts
import { parseHtml, isNativeParserAvailable } from 'react-native-html-lite';

const nodes = parseHtml('<ul><li>One<li>Two</ul>');
// [{ type: 'element', name: 'ul', attributes: {}, children: [...] }]
```

`HtmlNode` is either `{ type: 'text', data }` or
`{ type: 'element', name, attributes, children }`. Names are lowercase and
entities are decoded. Whitespace is kept as written.

## What's supported

**Elements:**

- Paragraphs, headings and container elements such as `div` and `section`.
- Inline formatting: `b strong i em u ins s strike del small big sub sup mark code kbd samp tt`.
- Links, `br`, `hr`, `pre` and `blockquote`.
- Ordered, unordered and nested lists, including `start`, `value` and `type`.
- Definition lists.
- Simple tables: rows, cells and `colspan`.
- `img`.
- Unknown elements render their content.

**Inline CSS:**

- Colour: `color`, `background-color`, `-webkit-text-fill-color`.
- Font: `font-size` (px, pt, em, rem, %, keywords), `font-weight`,
  `font-style`, `font-family` (allowlisted only).
- Text: `text-align`, `text-decoration`, `text-transform`, `line-height`,
  `letter-spacing`.
- Box: `margin*`, `padding*`, `width`/`height` and their min/max variants,
  `opacity`.
- `display: none`/`block`/`inline` and `list-style-type`.

Other properties are ignored.

**Entities:** all numeric references, the 252 HTML 4 named entities, and
`&apos;`. Unknown named entities are left as written.

## Limitations

These limits keep the package small:

- It's not a browser engine. There are no stylesheets (`<style>`) or
  selectors, only inline styles, tag styles and class styles.
- Margins don't collapse between adjacent blocks.
- Images are block-level, even inside a paragraph.
- `sub` and `sup` render smaller but aren't raised or lowered.
- Tables lay out as flex columns weighted by `colspan`. There's no `rowspan`
  or automatic column sizing.
- Misnested inline formatting (`<b><i></b></i>`) isn't reconstructed the way
  browsers do it.
- Forms, media, `svg` and `iframe` aren't rendered.

## How it works

`parseHtml` calls the C++ parser through JSI when it's linked, and the JS
parser otherwise. Both implement the same algorithm, described in
[docs/PARSER.md](docs/PARSER.md). The renderer then groups inline content into
one `<Text>` per line box, so text wraps and selects naturally, and maps
blocks to `<View>`s.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). A parser change has to go into both
`cpp/HtmlParser.cpp` and `src/parser/jsParser.ts`, with a case added to
`src/__fixtures__/parserCases.ts`. `yarn test` compiles the C++ parser with
sanitizers and checks both implementations.

## License

MIT
