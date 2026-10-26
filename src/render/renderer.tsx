import { Fragment, type ReactNode } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import type { HtmlElement, HtmlNode } from '../parser/types';
import {
  convertDeclarations,
  parseDeclarations,
  toColor,
  toFontFamily,
  toTextAlign,
  type Declarations,
} from './css';
import {
  createDefaultStyles,
  type HtmlStyle,
  type HtmlStyles,
} from './defaultStyles';
import { HtmlImage } from './HtmlImage';
import {
  defaultListStyle,
  listMarker,
  listStyleFromTypeAttribute,
} from './listMarkers';
import {
  inlineTextStyle,
  isEmptyStyle,
  mergeStyle,
  splitStyle,
  type Mutable,
} from './styles';
import { collapseWhitespace } from './whitespace';

export interface CustomRendererProps {
  node: HtmlElement;
  /** The element's rendered children. */
  children: ReactNode;
  /** The element's own resolved style (defaults, tag, class and inline CSS). */
  style: HtmlStyle;
  /** Text style inherited from ancestors, already merged with `style`'s text properties. */
  textStyle: TextStyle;
  /**
   * True when the element sits inside a line of text and must return
   * something valid inside `<Text>` (a string, `<Text>`, or null).
   */
  inline: boolean;
}

export type CustomRenderer = (props: CustomRendererProps) => ReactNode;

export interface FontFamilyQuery {
  fontFamily?: string;
  fontWeight?: TextStyle['fontWeight'];
  fontStyle?: TextStyle['fontStyle'];
}

export interface RenderConfig {
  baseStyle?: TextStyle;
  tagsStyles?: HtmlStyles;
  classesStyles?: HtmlStyles;
  textProps?: Omit<TextProps, 'style' | 'children' | 'onPress'>;
  markerStyle?: TextStyle;
  onLinkPress?: (href: string, element: HtmlElement) => void;
  renderers?: Readonly<Record<string, CustomRenderer>>;
  ignoredTags?: readonly string[];
  enableInlineStyles?: boolean;
  allowedFontFamilies?: readonly string[];
  resolveFontFamily?: (query: FontFamilyQuery) => string | undefined;
  useDefaultStyles?: boolean;
}

const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'html',
  'img',
  'li',
  'listing',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const INLINE_DISPLAYS = new Set(['inline', 'inline-block', 'inline-flex']);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LISTS = new Set(['ul', 'ol', 'menu', 'dir']);
const ALIGNABLE = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'tr',
  'table',
  'caption',
]);
const BACKGROUND_ATTRIBUTE = new Set(['table', 'tr', 'td', 'th', 'body']);
const LEGACY_FONT_SIZES = [0.625, 0.8125, 1, 1.125, 1.5, 2, 3];
const SAFE_LINK = /^(?:https?:|mailto:|tel:)/i;

const declarationCache = new WeakMap<HtmlElement, Declarations>();

interface Context {
  /** Effective inherited text style at this point in the tree. */
  text: TextStyle;
  fontSize: number;
  listDepth: number;
}

function openLinkSafely(href: string) {
  if (SAFE_LINK.test(href.trim())) {
    Linking.openURL(href.trim()).catch(() => {});
  }
}

/**
 * Renders a parsed tree with React Native primitives. Inline content (text,
 * `<b>`, `<a>`, ...) is grouped into a single `<Text>` per line box so it wraps
 * naturally; block content becomes `<View>`s. Create one per render pass.
 */
export class HtmlRenderer {
  private readonly defaults: HtmlStyles;
  private readonly baseFontSize: number;
  private readonly ignored: ReadonlySet<string>;
  private readonly blockCache = new WeakMap<HtmlElement, boolean>();

  constructor(private readonly config: RenderConfig) {
    this.baseFontSize = config.baseStyle?.fontSize ?? 14;
    this.defaults =
      config.useDefaultStyles === false
        ? {}
        : createDefaultStyles(this.baseFontSize);
    this.ignored = new Set(config.ignoredTags ?? []);
  }

  /** Returns the root container, or null if nothing is visible. */
  render(nodes: readonly HtmlNode[], containerStyle?: unknown): ReactNode {
    const { text, view } = splitStyle(this.config.baseStyle ?? {});
    const ctx: Context = {
      text: { fontSize: this.baseFontSize, ...text },
      fontSize: this.baseFontSize,
      listDepth: 0,
    };
    const children = this.renderBlocks(nodes, ctx, 'r');
    if (children.length === 0) {
      return null;
    }
    return <View style={[view, containerStyle as ViewStyle]}>{children}</View>;
  }

  // ---------------------------------------------------------------------------
  // Classification
  // ---------------------------------------------------------------------------

  private declarations(node: HtmlElement): Declarations | undefined {
    if (this.config.enableInlineStyles === false || !node.attributes.style) {
      return undefined;
    }
    let declarations = declarationCache.get(node);
    if (!declarations) {
      declarations = parseDeclarations(node.attributes.style);
      declarationCache.set(node, declarations);
    }
    return declarations;
  }

  private display(node: HtmlElement): string | undefined {
    return this.declarations(node)?.get('display')?.toLowerCase();
  }

  readonly isHidden = (node: HtmlNode): boolean => {
    if (node.type === 'text') {
      return false;
    }
    if (this.ignored.has(node.name) || this.display(node) === 'none') {
      return true;
    }
    if (this.config.tagsStyles?.[node.name]?.display === 'none') {
      return true;
    }
    return this.classNames(node).some(
      (name) => this.config.classesStyles?.[name]?.display === 'none'
    );
  };

  private isBlock(node: HtmlNode): node is HtmlElement {
    if (node.type === 'text') {
      return false;
    }
    let block = this.blockCache.get(node);
    if (block === undefined) {
      const display = this.display(node);
      block =
        (display !== undefined && display !== 'none'
          ? !INLINE_DISPLAYS.has(display)
          : BLOCK_ELEMENTS.has(node.name)) ||
        // An inline element that contains blocks is laid out as a block.
        node.children.some(
          (child) => !this.isHidden(child) && this.isBlock(child)
        );
      this.blockCache.set(node, block);
    }
    return block;
  }

  private classNames(node: HtmlElement): string[] {
    const value = node.attributes.class;
    return value ? value.split(/\s+/).filter(Boolean) : [];
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  /**
   * Resolves an element's own style. Precedence, lowest first: defaults,
   * presentational attributes, `tagsStyles`, `classesStyles` (in class order),
   * inline CSS.
   */
  private resolveStyle(
    node: HtmlElement,
    ctx: Context,
    extraDefaults?: HtmlStyle
  ): HtmlStyle {
    const { name, attributes } = node;
    const style: Record<string, unknown> = {};

    if (name !== 'a' || attributes.href !== undefined) {
      mergeStyle(style, this.defaults[name]);
    }
    mergeStyle(style, extraDefaults);
    mergeStyle(style, this.presentationalStyle(node));
    mergeStyle(style, this.config.tagsStyles?.[name]);
    for (const className of this.classNames(node)) {
      mergeStyle(style, this.config.classesStyles?.[className]);
    }

    const declarations = this.declarations(node);
    if (declarations) {
      mergeStyle(
        style,
        convertDeclarations(declarations, {
          parentFontSize: ctx.fontSize,
          elementFontSize:
            typeof style.fontSize === 'number' ? style.fontSize : undefined,
          baseFontSize: this.baseFontSize,
          allowedFontFamilies: this.config.allowedFontFamilies,
        }).style
      );
    }
    return style as HtmlStyle;
  }

  /** Legacy HTML attributes such as `<font color>` and `align`. */
  private presentationalStyle(node: HtmlElement): HtmlStyle {
    const { name, attributes } = node;
    const style: Mutable<HtmlStyle> = {};
    if (name === 'font') {
      const color = toColor(attributes.color);
      if (color) {
        style.color = color;
      }
      if (attributes.face) {
        const family = toFontFamily(
          attributes.face,
          this.config.allowedFontFamilies
        );
        if (family) {
          style.fontFamily = family;
        }
      }
      const size = attributes.size?.trim();
      if (size && /^[+-]?\d+$/.test(size)) {
        const n = /^[+-]/.test(size)
          ? 3 + parseInt(size, 10)
          : parseInt(size, 10);
        const scale = LEGACY_FONT_SIZES[Math.min(7, Math.max(1, n)) - 1]!;
        style.fontSize = scale * this.baseFontSize;
      }
    }
    if (attributes.align && ALIGNABLE.has(name)) {
      const align = toTextAlign(attributes.align);
      if (align) {
        style.textAlign = align;
      }
    }
    if (attributes.bgcolor && BACKGROUND_ATTRIBUTE.has(name)) {
      const color = toColor(attributes.bgcolor);
      if (color) {
        style.backgroundColor = color;
      }
    }
    return style;
  }

  private inherit(ctx: Context, text: TextStyle): Context {
    if (isEmptyStyle(text)) {
      return ctx;
    }
    const merged = { ...ctx.text, ...text };
    return {
      ...ctx,
      text: merged,
      fontSize:
        typeof merged.fontSize === 'number' ? merged.fontSize : ctx.fontSize,
    };
  }

  private resolvedFamily(text: TextStyle): string | undefined {
    return (
      this.config.resolveFontFamily?.({
        fontFamily: text.fontFamily,
        fontWeight: text.fontWeight,
        fontStyle: text.fontStyle,
      }) ?? text.fontFamily
    );
  }

  /** Full style for a `<Text>` that starts a new line box. */
  private rootTextStyle(ctx: Context): TextStyle {
    const fontFamily = this.resolvedFamily(ctx.text);
    return fontFamily === ctx.text.fontFamily
      ? ctx.text
      : { ...ctx.text, fontFamily };
  }

  // ---------------------------------------------------------------------------
  // Block layout
  // ---------------------------------------------------------------------------

  private renderBlocks(
    nodes: readonly HtmlNode[],
    ctx: Context,
    key: string
  ): ReactNode[] {
    const out: ReactNode[] = [];
    let run: HtmlNode[] = [];

    const flush = () => {
      if (run.length > 0) {
        const line = this.renderLine(run, ctx, `${key}.${out.length}`);
        if (line) {
          out.push(line);
        }
        run = [];
      }
    };

    for (const node of nodes) {
      if (this.isHidden(node)) {
        continue;
      }
      if (this.isBlock(node)) {
        flush();
        const block = this.renderBlock(node, ctx, `${key}.${out.length}`);
        if (block != null) {
          out.push(block);
        }
      } else {
        run.push(node);
      }
    }
    flush();
    return out;
  }

  private renderLine(
    nodes: readonly HtmlNode[],
    ctx: Context,
    key: string
  ): ReactNode {
    const collapsed = collapseWhitespace(nodes, this.isHidden);
    if (!collapsed) {
      return null;
    }
    return (
      <Text
        key={key}
        {...this.config.textProps}
        style={this.rootTextStyle(ctx)}
      >
        {this.renderInline(collapsed, ctx, key)}
      </Text>
    );
  }

  private renderBlock(node: HtmlElement, ctx: Context, key: string): ReactNode {
    const { name } = node;

    if (LISTS.has(name)) {
      return this.renderList(node, ctx, key);
    }
    if (name === 'li') {
      // A list item outside a list renders like an unordered list item.
      return this.renderListItem(node, ctx, key, listMarker('disc', 1));
    }

    const style = this.resolveStyle(node, ctx);
    const { text, view } = splitStyle(style);
    const childCtx = this.inherit(ctx, text);
    const custom = this.config.renderers?.[name];
    if (custom) {
      return (
        <Fragment key={key}>
          {custom({
            node,
            children: this.renderBlocks(node.children, childCtx, key),
            style,
            textStyle: childCtx.text,
            inline: false,
          })}
        </Fragment>
      );
    }

    switch (name) {
      case 'hr':
        return <View key={key} style={view} />;
      case 'img':
        return <HtmlImage key={key} node={node} style={view as never} />;
      case 'pre':
        return (
          <View key={key} style={view}>
            {this.renderPreformatted(node.children, childCtx, key)}
          </View>
        );
    }

    let layout: ViewStyle | undefined;
    if (name === 'tr') {
      layout = { flexDirection: 'row' };
    } else if (name === 'td' || name === 'th') {
      const span = parseInt(node.attributes.colspan ?? '', 10);
      layout = { flex: span > 0 && span < 1000 ? span : 1 };
    }

    const children = this.renderBlocks(node.children, childCtx, key);
    const href = node.attributes.href;
    if (name === 'a' && href !== undefined) {
      return (
        <Pressable
          key={key}
          style={[layout, view]}
          accessibilityRole="link"
          onPress={() => this.pressLink(href, node)}
        >
          {children}
        </Pressable>
      );
    }
    return (
      <View
        key={key}
        style={layout ? [layout, view] : view}
        accessibilityRole={HEADINGS.has(name) ? 'header' : undefined}
      >
        {children}
      </View>
    );
  }

  /** `<pre>` keeps whitespace; nested blocks are flattened into its text. */
  private renderPreformatted(
    nodes: readonly HtmlNode[],
    ctx: Context,
    key: string
  ): ReactNode {
    return (
      <Text {...this.config.textProps} style={this.rootTextStyle(ctx)}>
        {this.renderInline(nodes, ctx, key)}
      </Text>
    );
  }

  private renderList(node: HtmlElement, ctx: Context, key: string): ReactNode {
    const ordered = node.name === 'ol';
    const style = this.resolveStyle(
      node,
      ctx,
      // Nested lists have no vertical margin, as in browsers.
      ctx.listDepth > 0 && this.config.useDefaultStyles !== false
        ? { marginVertical: 0 }
        : undefined
    );
    const { text, view } = splitStyle(style);
    const listCtx = {
      ...this.inherit(ctx, text),
      listDepth: ctx.listDepth + 1,
    };
    const listStyleType =
      convertDeclarations(this.declarations(node) ?? new Map(), {
        parentFontSize: ctx.fontSize,
        baseFontSize: this.baseFontSize,
      }).listStyleType ??
      listStyleFromTypeAttribute(node.attributes.type) ??
      defaultListStyle(ordered, ctx.listDepth);

    const start = parseInt(node.attributes.start ?? '', 10);
    let counter = ordered && Number.isFinite(start) ? start : 1;
    const items: ReactNode[] = [];
    const custom = this.config.renderers?.[node.name];

    node.children.forEach((child, index) => {
      const itemKey = `${key}.${index}`;
      if (this.isHidden(child)) {
        return;
      }
      if (child.type === 'element' && child.name === 'li') {
        const value = parseInt(child.attributes.value ?? '', 10);
        if (ordered && Number.isFinite(value)) {
          counter = value;
        }
        const itemStyleType =
          listStyleFromTypeAttribute(child.attributes.type) ?? listStyleType;
        items.push(
          this.renderListItem(
            child,
            listCtx,
            itemKey,
            listMarker(itemStyleType, counter)
          )
        );
        counter++;
        return;
      }
      // Stray content between items.
      items.push(...this.renderBlocks([child], listCtx, itemKey));
    });

    if (custom) {
      return (
        <Fragment key={key}>
          {custom({
            node,
            children: items,
            style,
            textStyle: listCtx.text,
            inline: false,
          })}
        </Fragment>
      );
    }
    return (
      <View key={key} style={view}>
        {items}
      </View>
    );
  }

  private renderListItem(
    node: HtmlElement,
    ctx: Context,
    key: string,
    marker: string
  ): ReactNode {
    const style = this.resolveStyle(node, ctx);
    const { text, view } = splitStyle(style);
    const itemCtx = this.inherit(ctx, text);
    const children = this.renderBlocks(node.children, itemCtx, key);
    const custom = this.config.renderers?.li;
    if (custom) {
      return (
        <Fragment key={key}>
          {custom({
            node,
            children,
            style,
            textStyle: itemCtx.text,
            inline: false,
          })}
        </Fragment>
      );
    }
    const markerWidth = itemCtx.fontSize * (marker.length > 1 ? 1.8 : 1.2);
    return (
      <View key={key} style={[styles.listItem, view]}>
        {marker ? (
          <Text
            {...this.config.textProps}
            accessible={false}
            importantForAccessibility="no"
            style={[
              this.rootTextStyle(itemCtx),
              styles.marker,
              {
                minWidth: markerWidth,
                paddingRight: itemCtx.fontSize * 0.4,
              },
              this.config.markerStyle,
            ]}
          >
            {marker}
          </Text>
        ) : null}
        <View style={styles.listItemContent}>{children}</View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Inline layout
  // ---------------------------------------------------------------------------

  private renderInline(
    nodes: readonly HtmlNode[],
    ctx: Context,
    key: string
  ): ReactNode[] {
    const out: ReactNode[] = [];
    nodes.forEach((node, index) => {
      const childKey = `${key}.${index}`;
      if (node.type === 'text') {
        if (node.data) {
          out.push(node.data);
        }
        return;
      }
      if (this.isHidden(node)) {
        return;
      }
      if (node.name === 'br') {
        out.push('\n');
        return;
      }
      if (node.name === 'img') {
        // Images are block-level; inside <pre> they are skipped.
        return;
      }
      out.push(this.renderInlineElement(node, ctx, childKey));
    });
    return out;
  }

  private renderInlineElement(
    node: HtmlElement,
    ctx: Context,
    key: string
  ): ReactNode {
    const style = this.resolveStyle(node, ctx);
    const own = inlineTextStyle(style);
    const childCtx = this.inherit(ctx, splitStyle(style).text);
    const children = this.renderInline(node.children, childCtx, key);

    const custom = this.config.renderers?.[node.name];
    if (custom) {
      return (
        <Fragment key={key}>
          {custom({
            node,
            children,
            style,
            textStyle: childCtx.text,
            inline: true,
          })}
        </Fragment>
      );
    }

    const fontFamily = this.resolvedFamily(childCtx.text);
    const textStyle =
      fontFamily !== this.resolvedFamily(ctx.text)
        ? { ...own, fontFamily }
        : own;

    const href = node.name === 'a' ? node.attributes.href : undefined;
    if (href !== undefined) {
      return (
        <Text
          key={key}
          style={textStyle}
          accessibilityRole="link"
          onPress={() => this.pressLink(href, node)}
        >
          {children}
        </Text>
      );
    }
    if (isEmptyStyle(textStyle)) {
      return <Fragment key={key}>{children}</Fragment>;
    }
    return (
      <Text key={key} style={textStyle}>
        {children}
      </Text>
    );
  }

  private pressLink(href: string, node: HtmlElement) {
    if (this.config.onLinkPress) {
      this.config.onLinkPress(href, node);
    } else {
      openLinkSafely(href);
    }
  }
}

const styles = StyleSheet.create({
  listItem: { flexDirection: 'row' },
  listItemContent: { flex: 1 },
  marker: { textAlign: 'right', textDecorationLine: 'none' },
});
