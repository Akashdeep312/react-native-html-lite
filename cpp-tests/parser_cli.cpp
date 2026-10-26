// Test harness for the C++ parser. Reads HTML from stdin and prints
// the parsed tree as JSON, shaped like `HtmlNode[]` in src/parser/types.ts.
//
// Usage: parser_cli [maxDepth] < input.html
//        parser_cli --batch < records
//
// In batch mode, stdin holds records separated by NUL bytes. Each record is a
// line with maxDepth (0 for the default) followed by the HTML. One JSON line
// is printed per record.
//
// Built and driven by src/__tests__/cppParser.test.ts.
#include "HtmlParser.h"

#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <iterator>
#include <string>

namespace {

void writeJsonString(std::string& out, const std::string& value) {
  out += '"';
  for (const char c : value) {
    const auto byte = static_cast<unsigned char>(c);
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (byte < 0x20) {
          char buffer[8];
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", byte);
          out += buffer;
        } else {
          out += c;
        }
    }
  }
  out += '"';
}

void writeNodes(std::string& out, const htmllite::NodeList& nodes) {
  out += '[';
  for (std::size_t i = 0; i < nodes.size(); ++i) {
    if (i > 0) {
      out += ',';
    }
    const htmllite::Node& node = *nodes[i];
    if (node.type == htmllite::Node::Type::Text) {
      out += R"({"type":"text","data":)";
      writeJsonString(out, node.text);
      out += '}';
      continue;
    }
    out += R"({"type":"element","name":)";
    writeJsonString(out, node.name);
    out += R"(,"attributes":{)";
    for (std::size_t a = 0; a < node.attributes.size(); ++a) {
      if (a > 0) {
        out += ',';
      }
      writeJsonString(out, node.attributes[a].first);
      out += ':';
      writeJsonString(out, node.attributes[a].second);
    }
    out += R"(},"children":)";
    writeNodes(out, node.children);
    out += '}';
  }
  out += ']';
}

} // namespace

int main(int argc, char** argv) {
  std::string input(std::istreambuf_iterator<char>(std::cin), {});
  std::string out;

  if (argc > 1 && std::string(argv[1]) == "--batch") {
    std::size_t start = 0;
    while (start < input.size()) {
      std::size_t end = input.find('\0', start);
      if (end == std::string::npos) {
        end = input.size();
      }
      const std::string record = input.substr(start, end - start);
      const std::size_t newline = record.find('\n');
      htmllite::ParseOptions options;
      const auto depth = std::strtoul(record.substr(0, newline).c_str(), nullptr, 10);
      if (depth > 0) {
        options.maxDepth = depth;
      }
      const std::string html =
          newline == std::string::npos ? "" : record.substr(newline + 1);
      writeNodes(out, htmllite::parse(html, options));
      out += '\n';
      start = end + 1;
    }
    std::cout << out;
    return 0;
  }

  htmllite::ParseOptions options;
  if (argc > 1) {
    options.maxDepth = static_cast<std::size_t>(std::strtoul(argv[1], nullptr, 10));
  }
  writeNodes(out, htmllite::parse(input, options));
  std::cout << out << '\n';
  return 0;
}
