#include "HtmlParser.h"

#include "HtmlEntities.generated.h"

#include <algorithm>
#include <cstdint>
#include <initializer_list>

namespace htmllite {
namespace {

using Attributes = std::vector<std::pair<std::string, std::string>>;
using NameSet = std::initializer_list<std::string_view>;

constexpr char32_t kReplacementCharacter = 0xFFFD;

// ---------------------------------------------------------------------------
// Element categories. Keep in sync with src/parser/jsParser.ts.
// ---------------------------------------------------------------------------

// Elements that never have children.
constexpr NameSet kVoidElements = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"};

// Elements whose content is raw text. The element and its content are
// discarded entirely.
constexpr NameSet kRawTextElements = {
    "script", "style", "title", "textarea", "xmp",
    "iframe", "noembed", "noframes", "noscript"};

// Elements that are parsed normally but omitted, with their descendants, from
// the output.
constexpr NameSet kDroppedElements = {"head", "template", "svg", "math"};

// Elements allowed inside <head>; any other start tag implicitly closes it.
constexpr NameSet kHeadContent = {
    "base", "link", "meta", "style", "title", "script", "noscript", "template"};

// Start tags that implicitly close an open <p>.
constexpr NameSet kClosesParagraph = {
    "address", "article", "aside", "blockquote", "center", "details",
    "dialog", "dir", "div", "dl", "dd", "dt", "fieldset", "figcaption",
    "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hgroup", "hr", "li", "listing", "main", "menu", "nav",
    "ol", "p", "pre", "section", "summary", "table", "ul"};

constexpr NameSet kHeadings = {"h1", "h2", "h3", "h4", "h5", "h6"};

// Elements that limit how far an implicit or explicit close may search.
constexpr NameSet kScopeBoundary = {
    "html", "table", "td", "th", "caption", "marquee", "object", "applet",
    "template", "button"};

constexpr NameSet kTableScopeBoundary = {"html", "table", "template"};

constexpr NameSet kTableContext = {
    "td", "th", "tr", "tbody", "thead", "tfoot", "table", "caption"};

// Structural elements that inline end tags cannot close through.
constexpr NameSet kSpecial = {
    "address", "article", "aside", "blockquote", "body", "caption",
    "center", "dd", "details", "dir", "div", "dl", "dt", "fieldset",
    "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
    "h5", "h6", "header", "hgroup", "html", "li", "listing", "main",
    "menu", "nav", "ol", "p", "pre", "section", "summary", "table",
    "tbody", "td", "tfoot", "th", "thead", "tr", "ul"};

// Named references that are decoded without a trailing semicolon in text.
constexpr NameSet kLegacyEntities = {
    "amp", "lt", "gt", "quot", "nbsp", "copy", "reg"};

// Windows-1252 remapping for numeric references in 0x80..0x9F. 0 = unmapped.
constexpr char32_t kWindows1252[32] = {
    0x20AC, 0,      0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
    0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0,      0x017D, 0,
    0,      0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
    0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0,      0x017E, 0x0178};

bool contains(NameSet set, std::string_view name) {
  return std::find(set.begin(), set.end(), name) != set.end();
}

bool isWhitespace(char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\f';
}

bool isAlpha(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

bool isDigit(char c) {
  return c >= '0' && c <= '9';
}

bool isAlnum(char c) {
  return isAlpha(c) || isDigit(c);
}

bool isHexDigit(char c) {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

uint32_t hexValue(char c) {
  if (isDigit(c)) {
    return static_cast<uint32_t>(c - '0');
  }
  if (c >= 'a' && c <= 'f') {
    return static_cast<uint32_t>(c - 'a' + 10);
  }
  return static_cast<uint32_t>(c - 'A' + 10);
}

char toLowerAscii(char c) {
  return (c >= 'A' && c <= 'Z') ? static_cast<char>(c + ('a' - 'A')) : c;
}

void appendUtf8(std::string& out, char32_t cp) {
  if (cp < 0x80) {
    out += static_cast<char>(cp);
  } else if (cp < 0x800) {
    out += static_cast<char>(0xC0 | (cp >> 6));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    out += static_cast<char>(0xE0 | (cp >> 12));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (cp >> 18));
    out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (cp & 0x3F));
  }
}

char32_t sanitizeCodePoint(uint32_t value) {
  if (value == 0 || value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF)) {
    return kReplacementCharacter;
  }
  if (value >= 0x80 && value <= 0x9F && kWindows1252[value - 0x80] != 0) {
    return kWindows1252[value - 0x80];
  }
  return static_cast<char32_t>(value);
}

const NamedEntity* lookupEntity(std::string_view name) {
  const auto* begin = std::begin(kNamedEntities);
  const auto* end = std::end(kNamedEntities);
  const auto* it = std::lower_bound(
      begin, end, name, [](const NamedEntity& entity, std::string_view key) {
        return entity.name < key;
      });
  return (it != end && it->name == name) ? it : nullptr;
}

std::string decodeCharacterReferences(std::string_view s, bool inAttribute) {
  std::string out;
  out.reserve(s.size());
  std::size_t i = 0;
  const std::size_t length = s.size();

  while (i < length) {
    if (s[i] != '&') {
      out += s[i++];
      continue;
    }

    std::size_t j = i + 1;
    if (j < length && s[j] == '#') {
      ++j;
      bool hex = false;
      if (j < length && (s[j] == 'x' || s[j] == 'X')) {
        hex = true;
        ++j;
      }
      const std::size_t digitsStart = j;
      uint32_t value = 0;
      bool overflow = false;
      while (j < length && (hex ? isHexDigit(s[j]) : isDigit(s[j]))) {
        if (!overflow) {
          value = value * (hex ? 16 : 10) + hexValue(s[j]);
          overflow = value > 0x10FFFF;
        }
        ++j;
      }
      if (j == digitsStart) {
        out += '&';
        ++i;
        continue;
      }
      if (j < length && s[j] == ';') {
        ++j;
      }
      appendUtf8(out, sanitizeCodePoint(overflow ? 0x110000 : value));
      i = j;
      continue;
    }

    const std::size_t nameStart = j;
    while (j < length && isAlnum(s[j])) {
      ++j;
    }
    if (j == nameStart) {
      out += '&';
      ++i;
      continue;
    }

    const std::string_view name = s.substr(nameStart, j - nameStart);
    if (j < length && s[j] == ';') {
      if (const NamedEntity* entity = lookupEntity(name)) {
        appendUtf8(out, entity->codePoint);
        i = j + 1;
        continue;
      }
    } else if (!inAttribute && contains(kLegacyEntities, name)) {
      appendUtf8(out, lookupEntity(name)->codePoint);
      i = j;
      continue;
    }

    // Unknown reference: keep it verbatim.
    out.append(s.substr(i, j - i));
    i = j;
  }

  return out;
}

std::string normalizeNewlines(std::string_view html) {
  std::string out;
  out.reserve(html.size());
  for (std::size_t i = 0; i < html.size(); ++i) {
    if (html[i] == '\r') {
      out += '\n';
      if (i + 1 < html.size() && html[i + 1] == '\n') {
        ++i;
      }
    } else {
      out += html[i];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

class TreeBuilder {
 public:
  explicit TreeBuilder(std::size_t maxDepth) : maxDepth_(maxDepth) {
    root_ = std::make_unique<Node>();
    root_->type = Node::Type::Element;
    stack_.push_back(root_.get());
  }

  void text(std::string&& data) {
    if (data.empty()) {
      return;
    }
    Node* parent = stack_.back();
    if (!parent->children.empty() &&
        parent->children.back()->type == Node::Type::Text) {
      parent->children.back()->text += data;
      return;
    }
    auto node = std::make_unique<Node>();
    node->type = Node::Type::Text;
    node->text = std::move(data);
    parent->children.push_back(std::move(node));
  }

  void startTag(const std::string& name, Attributes&& attributes,
                bool selfClosing) {
    if (name == "html") {
      if (stack_.size() > 1 || hasElementChild(*root_)) {
        return;
      }
    } else if (name == "head") {
      const bool atTop = stack_.size() == 1 ||
          (stack_.size() == 2 && stack_.back()->name == "html");
      if (!atTop || seenHead_) {
        return;
      }
      seenHead_ = true;
    } else if (name == "body") {
      if (findOpen("body") != 0) {
        return;
      }
      closeIfOpen("head");
    } else if (!contains(kHeadContent, name)) {
      closeIfOpen("head");
    }

    if (name == "li") {
      closeListItem({"li"});
    } else if (name == "dd" || name == "dt") {
      closeListItem({"dd", "dt"});
    } else if (name == "tr") {
      closeWithin({"tr"}, {"table", "tbody", "thead", "tfoot", "html",
                           "template"});
    } else if (name == "td" || name == "th") {
      closeWithin({"td", "th"}, {"tr", "table", "tbody", "thead", "tfoot",
                                 "html", "template"});
    } else if (name == "tbody" || name == "thead" || name == "tfoot") {
      closeWithin({"tbody", "thead", "tfoot"}, {"table", "html", "template"});
    } else if (name == "a") {
      closeWithin({"a"}, kSpecial);
    }

    if (contains(kClosesParagraph, name)) {
      closeWithin({"p"}, kScopeBoundary);
    }
    if (contains(kHeadings, name) && contains(kHeadings, stack_.back()->name)) {
      stack_.pop_back();
    }

    if (stack_.size() > maxDepth_) {
      return;
    }

    auto node = std::make_unique<Node>();
    node->type = Node::Type::Element;
    node->name = name;
    node->attributes = std::move(attributes);
    Node* raw = node.get();
    stack_.back()->children.push_back(std::move(node));
    if (!selfClosing && !contains(kVoidElements, name)) {
      stack_.push_back(raw);
    }
  }

  void endTag(const std::string& name) {
    if (name == "body" || name == "html") {
      return;
    }
    if (name == "br") {
      startTag("br", {}, false);
      return;
    }
    if (contains(kVoidElements, name)) {
      return;
    }

    for (std::size_t i = stack_.size() - 1; i >= 1; --i) {
      const std::string& open = stack_[i]->name;
      if (open == name) {
        stack_.resize(i);
        return;
      }
      if (contains(kSpecial, name)) {
        if (contains(kTableContext, name)) {
          if (contains(kTableScopeBoundary, open)) {
            return;
          }
        } else if (contains(kScopeBoundary, open) ||
                   (name == "li" && (open == "ol" || open == "ul"))) {
          return;
        }
      } else if (contains(kSpecial, open)) {
        return;
      }
    }
  }

  NodeList finish() {
    NodeList out;
    collect(std::move(root_->children), out);
    return out;
  }

 private:
  static bool hasElementChild(const Node& node) {
    return std::any_of(
        node.children.begin(), node.children.end(),
        [](const auto& child) { return child->type == Node::Type::Element; });
  }

  // Index of the topmost open element with this name, or 0 if none.
  std::size_t findOpen(std::string_view name) const {
    for (std::size_t i = stack_.size() - 1; i >= 1; --i) {
      if (stack_[i]->name == name) {
        return i;
      }
    }
    return 0;
  }

  void closeIfOpen(std::string_view name) {
    if (const std::size_t index = findOpen(name); index != 0) {
      stack_.resize(index);
    }
  }

  // Closes the topmost element named in `targets`, searching down from the
  // current node and stopping at any element named in `boundary`.
  void closeWithin(NameSet targets, NameSet boundary) {
    for (std::size_t i = stack_.size() - 1; i >= 1; --i) {
      const std::string& open = stack_[i]->name;
      if (contains(targets, open)) {
        stack_.resize(i);
        return;
      }
      if (contains(boundary, open)) {
        return;
      }
    }
  }

  void closeListItem(NameSet targets) {
    for (std::size_t i = stack_.size() - 1; i >= 1; --i) {
      const std::string& open = stack_[i]->name;
      if (contains(targets, open)) {
        stack_.resize(i);
        return;
      }
      if (contains(kSpecial, open) && open != "address" && open != "div" &&
          open != "p") {
        return;
      }
    }
  }

  // Moves children into `out`, removing dropped elements and merging the text
  // nodes that become adjacent as a result.
  static void collect(NodeList&& children, NodeList& out) {
    for (auto& child : children) {
      if (child->type == Node::Type::Text) {
        if (!out.empty() && out.back()->type == Node::Type::Text) {
          out.back()->text += child->text;
        } else {
          out.push_back(std::move(child));
        }
        continue;
      }
      if (contains(kDroppedElements, child->name)) {
        continue;
      }
      NodeList grandchildren = std::move(child->children);
      child->children.clear();
      collect(std::move(grandchildren), child->children);
      out.push_back(std::move(child));
    }
  }

  std::unique_ptr<Node> root_;
  std::vector<Node*> stack_;
  std::size_t maxDepth_;
  bool seenHead_ = false;
};

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

struct StartTag {
  std::string name;
  Attributes attributes;
  bool selfClosing = false;
};

bool hasAttribute(const Attributes& attributes, std::string_view name) {
  return std::any_of(attributes.begin(), attributes.end(),
                     [&](const auto& attr) { return attr.first == name; });
}

// Parses a start tag whose name begins at `i`. Returns false if the input ends
// inside the tag, in which case the tag and the rest of the input are dropped.
bool parseStartTag(const std::string& input, std::size_t i, StartTag& tag,
                   std::size_t& end) {
  const std::size_t n = input.size();
  while (i < n && !isWhitespace(input[i]) && input[i] != '/' &&
         input[i] != '>') {
    tag.name += toLowerAscii(input[i++]);
  }

  while (true) {
    while (i < n && isWhitespace(input[i])) {
      ++i;
    }
    if (i >= n) {
      return false;
    }
    if (input[i] == '>') {
      end = i + 1;
      return true;
    }
    if (input[i] == '/') {
      if (i + 1 < n && input[i + 1] == '>') {
        tag.selfClosing = true;
        end = i + 2;
        return true;
      }
      ++i;
      continue;
    }

    std::string attrName(1, toLowerAscii(input[i++]));
    while (i < n && !isWhitespace(input[i]) && input[i] != '/' &&
           input[i] != '>' && input[i] != '=') {
      attrName += toLowerAscii(input[i++]);
    }
    while (i < n && isWhitespace(input[i])) {
      ++i;
    }

    std::string value;
    if (i < n && input[i] == '=') {
      ++i;
      while (i < n && isWhitespace(input[i])) {
        ++i;
      }
      if (i >= n) {
        return false;
      }
      if (input[i] == '"' || input[i] == '\'') {
        const std::size_t close = input.find(input[i], i + 1);
        if (close == std::string::npos) {
          return false;
        }
        value = decodeCharacterReferences(
            std::string_view(input).substr(i + 1, close - i - 1), true);
        i = close + 1;
      } else if (input[i] != '>') {
        const std::size_t start = i;
        while (i < n && !isWhitespace(input[i]) && input[i] != '>') {
          ++i;
        }
        value = decodeCharacterReferences(
            std::string_view(input).substr(start, i - start), true);
      }
    }

    // "__proto__" cannot be represented as an ordinary JS object key.
    if (attrName != "__proto__" && !hasAttribute(tag.attributes, attrName)) {
      tag.attributes.emplace_back(std::move(attrName), std::move(value));
    }
  }
}

// Returns the position just after the end tag that closes a raw text element,
// or the end of the input if there is none.
std::size_t skipRawText(const std::string& input, std::size_t pos,
                        const std::string& name) {
  const std::size_t n = input.size();
  while (true) {
    const std::size_t lt = input.find("</", pos);
    if (lt == std::string::npos) {
      return n;
    }
    std::size_t j = lt + 2;
    std::size_t k = 0;
    while (k < name.size() && j + k < n &&
           toLowerAscii(input[j + k]) == name[k]) {
      ++k;
    }
    if (k == name.size()) {
      const std::size_t after = j + k;
      if (after >= n) {
        return n;
      }
      if (isWhitespace(input[after]) || input[after] == '/' ||
          input[after] == '>') {
        const std::size_t gt = input.find('>', after);
        return gt == std::string::npos ? n : gt + 1;
      }
    }
    pos = lt + 2;
  }
}

std::size_t skipPast(const std::string& input, char c, std::size_t from) {
  const std::size_t found = input.find(c, from);
  return found == std::string::npos ? input.size() : found + 1;
}

} // namespace

NodeList parse(std::string_view html, const ParseOptions& options) {
  const std::string input = normalizeNewlines(html);
  const std::size_t n = input.size();
  TreeBuilder builder(
      std::clamp<std::size_t>(options.maxDepth, 1, kMaxAllowedDepth));

  std::string pending;
  auto flush = [&] {
    if (!pending.empty()) {
      builder.text(std::move(pending));
      pending.clear();
    }
  };

  std::size_t pos = 0;
  while (pos < n) {
    if (input[pos] != '<') {
      std::size_t next = input.find('<', pos);
      if (next == std::string::npos) {
        next = n;
      }
      pending += decodeCharacterReferences(
          std::string_view(input).substr(pos, next - pos), false);
      pos = next;
      continue;
    }

    if (pos + 1 >= n) {
      pending += '<';
      ++pos;
      continue;
    }

    const char next = input[pos + 1];
    if (isAlpha(next)) {
      StartTag tag;
      std::size_t end = 0;
      if (!parseStartTag(input, pos + 1, tag, end)) {
        break;
      }
      flush();
      pos = end;
      if (contains(kRawTextElements, tag.name)) {
        pos = skipRawText(input, pos, tag.name);
        continue;
      }
      builder.startTag(tag.name, std::move(tag.attributes), tag.selfClosing);
      if ((tag.name == "pre" || tag.name == "listing") && pos < n &&
          input[pos] == '\n') {
        ++pos;
      }
      continue;
    }

    if (next == '/') {
      if (pos + 2 >= n) {
        pending += "</";
        pos = n;
        continue;
      }
      if (isAlpha(input[pos + 2])) {
        std::string name;
        std::size_t i = pos + 2;
        while (i < n && !isWhitespace(input[i]) && input[i] != '/' &&
               input[i] != '>') {
          name += toLowerAscii(input[i++]);
        }
        const std::size_t gt = input.find('>', i);
        if (gt == std::string::npos) {
          break;
        }
        flush();
        builder.endTag(name);
        pos = gt + 1;
        continue;
      }
      // "</>" is ignored; anything else is a bogus comment.
      pos = input[pos + 2] == '>' ? pos + 3 : skipPast(input, '>', pos + 2);
      continue;
    }

    if (next == '!') {
      if (input.compare(pos, 4, "<!--") == 0) {
        const std::size_t start = pos + 4;
        if (start < n && input[start] == '>') {
          pos = start + 1;
        } else if (start + 1 < n && input[start] == '-' &&
                   input[start + 1] == '>') {
          pos = start + 2;
        } else {
          const std::size_t close = input.find("-->", start);
          pos = close == std::string::npos ? n : close + 3;
        }
        continue;
      }
      pos = skipPast(input, '>', pos + 2);
      continue;
    }

    if (next == '?') {
      pos = skipPast(input, '>', pos + 2);
      continue;
    }

    pending += '<';
    ++pos;
  }

  flush();
  return builder.finish();
}

} // namespace htmllite
