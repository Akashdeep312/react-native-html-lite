#pragma once

#include <HtmlLiteSpecJSI.h>

#include <memory>

namespace facebook::react {

class HtmlLiteImpl : public NativeHtmlLiteCxxSpec<HtmlLiteImpl> {
public:
  HtmlLiteImpl(std::shared_ptr<CallInvoker> jsInvoker);

  // Returns an array of nodes shaped like `HtmlNode` in src/parser/types.ts.
  jsi::Object parse(jsi::Runtime& rt, jsi::String html, double maxDepth);
};

} // namespace facebook::react
