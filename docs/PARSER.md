# Parser algorithm

The package has two parsers that must behave identically:

- [`cpp/HtmlParser.cpp`](../cpp/HtmlParser.cpp) is the native one, called through JSI.
- [`src/parser/jsParser.ts`](../src/parser/jsParser.ts) is the fallback when
  the native module isn't linked.

This document is the shared specification. It's a simplified version of the
[WHATWG parsing algorithm](https://html.spec.whatwg.org/multipage/parsing.html):
close enough for the HTML that content systems usually produce, and small
enough to keep two implementations in sync.

**Changing the parser:**

1. Update this document.
2. Update both implementations.
3. Add a case to [`src/__fixtures__/parserCases.ts`](../src/__fixtures__/parserCases.ts).
4. Run `yarn test`. It compiles the C++ parser with AddressSanitizer and
   UBSan, checks both parsers against the fixtures, and compares them on
   3,000 random inputs.

The named-entity table is generated for both languages from
[`scripts/generate-entities.mjs`](../scripts/generate-entities.mjs). Edit that
script and run `yarn generate:entities`; never edit the generated files.

## Output

The output is a list of nodes:

- Text: `{ type: 'text', data }`.
- Element: `{ type: 'element', name, attributes, children }`.

Rules for the output:

- Tag and attribute names are lowercased, ASCII letters only. Non-ASCII
  characters are kept as written.
- Attribute values and text are entity-decoded.
- Whitespace is preserved. Collapsing it is the renderer's job.
- Adjacent text nodes are always merged.
- When an attribute is repeated, the first occurrence wins.
- An attribute named `__proto__` is dropped, because it can't be an ordinary
  JS object key.

## Preprocessing

`\r\n` and lone `\r` become `\n`.

## Tokenizing

The tokenizer reads text up to the next `<`. What it does with the `<` depends
on the characters after it:

| After `<` | Result |
| --- | --- |
| ASCII letter | Start tag. |
| `/` + ASCII letter | End tag. The name runs to whitespace, `/` or `>`, and everything up to the next `>` is ignored. |
| `/>` | Ignored. |
| `/` + anything else | Bogus comment, skipped to the next `>`. |
| `/` at end of input | The text `</`. |
| `!--` | Comment, skipped to `-->`. `<!-->` and `<!--->` close immediately. |
| `!` + anything else | Doctype or bogus comment, skipped to the next `>`. |
| `?` | Processing instruction, skipped to the next `>`. |
| Anything else, or end of input | Literal `<` text. |

If input ends inside a start tag, end tag, quoted attribute value or comment,
that construct and the rest of the input are dropped.

### Start tags

- The name runs to whitespace (space, tab, LF, FF), `/` or `>`.
- Attributes are separated by whitespace or by stray `/`.
- `/>` marks the tag as self-closing.
- An attribute name may start with any character. After that it runs to
  whitespace, `/`, `>` or `=`.
- Values can be double-quoted, single-quoted or unquoted. An unquoted value
  runs to whitespace or `>`, so `/` is part of it.
- An attribute without `=` gets the value `""`.

**Raw-text elements** are `script style title textarea xmp iframe noembed
noframes noscript`. After one of these start tags, everything up to the
matching end tag is discarded, along with the element. The end tag is matched
case-insensitively and must be followed by whitespace, `/`, `>` or the end of
input. The self-closing flag is ignored for these elements.

After a `<pre>` or `<listing>` start tag, one immediately following `\n` is
skipped.

### Character references

In text and attribute values:

- `&#` + decimal digits, or `&#x`/`&#X` + hex digits. The trailing `;` is
  optional. If there are no digits, the `&` is literal.
  - 0, values above U+10FFFF and surrogates become U+FFFD.
  - 0x80–0x9F are remapped through Windows-1252 where a mapping exists, e.g.
    `&#146;` → `'`.
- `&` + alphanumerics + `;` decodes if the name is in the table, and is kept
  verbatim otherwise.
- Without the `;`, only `amp lt gt quot nbsp copy reg` are decoded, and only
  in text, never in attributes. The whole alphanumeric run must match:
  `&ampx` stays as written. This differs from browsers, which prefix-match.

## Tree construction

The parser keeps a stack of open elements on top of an implicit root. "Walk"
means scanning the stack from the current node down to the root, stopping
before the root.

The rules use these element sets:

| Set | Elements |
| --- | --- |
| Void | `area base br col embed hr img input link meta param source track wbr` |
| Dropped | `head template svg math`: parsed normally, but left out of the output with their descendants |
| Closes `p` | `address article aside blockquote center details dialog dir div dl dd dt fieldset figcaption figure footer form h1–h6 header hgroup hr li listing main menu nav ol p pre section summary table ul` |
| Scope boundary | `html table td th caption marquee object applet template button` |
| Table scope boundary | `html table template` |
| Table context | `td th tr tbody thead tfoot table caption` |
| Special | `address article aside blockquote body caption center dd details dir div dl dt fieldset figcaption figure footer form h1–h6 header hgroup html li listing main menu nav ol p pre section summary table tbody td tfoot th thead tr ul` |

### Start tag

1. **Document structure:**
   - `html` is ignored unless the stack is empty and the root has no element
     children yet.
   - `head` is ignored unless the current node is the root or the first
     `html`, and no `head` has been seen before.
   - `body` is ignored if a `body` is already open. Otherwise it closes an
     open `head`.
   - Any other tag that isn't `base link meta style title script noscript
     template` closes an open `head`.
2. **Implied end tags:**
   - `li`: walk. On `li`, pop to and including it. On a special element other
     than `address`, `div` or `p`, stop.
   - `dd`/`dt`: the same, but for `dd` or `dt`.
   - `tr`: walk. On `tr`, pop to it. Stop at `table tbody thead tfoot html
     template`.
   - `td`/`th`: walk. On `td`/`th`, pop to it. Stop at `tr table tbody thead
     tfoot html template`.
   - `tbody`/`thead`/`tfoot`: walk. On any of these, pop to it. Stop at `table
     html template`.
   - `a`: walk. On `a`, pop to it. Stop at any special element.
3. If the tag is in "closes `p`": walk. On `p`, pop to it. Stop at a scope
   boundary.
4. If the tag is `h1`–`h6` and the current node is a heading, pop it.
5. **Depth limit:** if the stack, including the root, is deeper than
   `maxDepth`, drop the tag. Its content still goes to the current node.
6. Append the element. Push it unless it's void or self-closing. Unlike
   browsers, `<div/>` is treated as an empty element.

### End tag

1. `body` and `html` end tags are ignored, so content after them stays in the
   body.
2. `</br>` is treated as `<br>`. Other void end tags are ignored.
3. Walk the stack. When a node has the same name, pop to and including it.
   Before moving past a node, check whether the search must stop:
   - **Special end tag in the table context:** stop at a table scope boundary.
   - **Other special end tag:** stop at a scope boundary. For `li`, also stop
     at `ol` and `ul`.
   - **Any other end tag**, such as `span`, `b` or `a`: stop at any special
     element.

   If the search stops without a match, the end tag is ignored. A stray
   `</p>` is ignored too; browsers would insert an empty `<p>` there.

### Not implemented

These parts of the WHATWG algorithm aren't implemented:

- The adoption agency algorithm. `<b>a<i>b</b>c</i>` gives `<b>a<i>b</i></b>c`.
- Foster parenting of content in tables.
- Implied `tbody`/`tr` insertion.
- `select` and `form` handling.
