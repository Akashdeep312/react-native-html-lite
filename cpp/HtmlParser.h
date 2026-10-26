#pragma once

#include <cstddef>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

// A small, dependency-free HTML parser. It has no React Native dependency so
// it can be compiled and tested on its own (see cpp-tests/).
//
// The algorithm is documented in docs/PARSER.md and is mirrored exactly by
// src/parser/jsParser.ts. Any behavioural change must be made in both places
// and covered by src/__fixtures__/parserCases.ts.
namespace htmllite {

struct Node {
  enum class Type { Element, Text };

  Type type = Type::Text;
  // Element: lowercase ASCII tag name.
  std::string name;
  // Element: attributes in source order. Names are lowercase ASCII, values are
  // decoded. When an attribute is repeated, the first occurrence wins.
  std::vector<std::pair<std::string, std::string>> attributes;
  // Element: child nodes.
  std::vector<std::unique_ptr<Node>> children;
  // Text: decoded text. Whitespace is preserved; collapsing is a rendering
  // concern.
  std::string text;
};

using NodeList = std::vector<std::unique_ptr<Node>>;

constexpr std::size_t kDefaultMaxDepth = 256;
constexpr std::size_t kMaxAllowedDepth = 1024;

struct ParseOptions {
  // Elements nested deeper than this are dropped; their content is kept and
  // attached to the deepest allowed ancestor.
  std::size_t maxDepth = kDefaultMaxDepth;
};

// Parses UTF-8 HTML and returns the top-level nodes. Never throws on malformed
// markup.
NodeList parse(std::string_view html, const ParseOptions& options = {});

} // namespace htmllite
