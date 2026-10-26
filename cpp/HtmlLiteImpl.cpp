#include "HtmlLiteImpl.h"

#include "HtmlParser.h"

#include <cmath>

namespace facebook::react {

namespace {

struct PropNames {
  jsi::PropNameID type;
  jsi::PropNameID name;
  jsi::PropNameID attributes;
  jsi::PropNameID children;
  jsi::PropNameID data;
  jsi::String elementType;
  jsi::String textType;

  explicit PropNames(jsi::Runtime& rt)
    : type(jsi::PropNameID::forAscii(rt, "type")),
      name(jsi::PropNameID::forAscii(rt, "name")),
      attributes(jsi::PropNameID::forAscii(rt, "attributes")),
      children(jsi::PropNameID::forAscii(rt, "children")),
      data(jsi::PropNameID::forAscii(rt, "data")),
      elementType(jsi::String::createFromAscii(rt, "element")),
      textType(jsi::String::createFromAscii(rt, "text")) {}
};

jsi::Array toJsArray(
  jsi::Runtime& rt,
  const htmllite::NodeList& nodes,
  const PropNames& names
) {
  jsi::Array array(rt, nodes.size());
  for (size_t i = 0; i < nodes.size(); ++i) {
    const htmllite::Node& node = *nodes[i];
    jsi::Object object(rt);
    if (node.type == htmllite::Node::Type::Text) {
      object.setProperty(rt, names.type, jsi::Value(rt, names.textType));
      object.setProperty(
        rt, names.data, jsi::String::createFromUtf8(rt, node.text));
    } else {
      object.setProperty(rt, names.type, jsi::Value(rt, names.elementType));
      object.setProperty(
        rt, names.name, jsi::String::createFromUtf8(rt, node.name));
      jsi::Object attributes(rt);
      for (const auto& [key, value] : node.attributes) {
        attributes.setProperty(
          rt,
          jsi::PropNameID::forUtf8(rt, key),
          jsi::String::createFromUtf8(rt, value));
      }
      object.setProperty(rt, names.attributes, attributes);
      object.setProperty(
        rt, names.children, toJsArray(rt, node.children, names));
    }
    array.setValueAtIndex(rt, i, object);
  }
  return array;
}

} // namespace

HtmlLiteImpl::HtmlLiteImpl(std::shared_ptr<CallInvoker> jsInvoker)
  : NativeHtmlLiteCxxSpec(std::move(jsInvoker)) {}

jsi::Object HtmlLiteImpl::parse(
  jsi::Runtime& rt,
  jsi::String html,
  double maxDepth
) {
  htmllite::ParseOptions options;
  if (std::isfinite(maxDepth) && maxDepth >= 1) {
    options.maxDepth = maxDepth >= static_cast<double>(htmllite::kMaxAllowedDepth)
      ? htmllite::kMaxAllowedDepth
      : static_cast<size_t>(maxDepth);
  }

  const htmllite::NodeList nodes = htmllite::parse(html.utf8(rt), options);
  const PropNames names(rt);
  jsi::Object result = toJsArray(rt, nodes, names);
  return result;
}

} // namespace facebook::react
