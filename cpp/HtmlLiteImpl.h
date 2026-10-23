#pragma once

#include <HtmlLiteSpecJSI.h>

#include <memory>

namespace facebook::react {

class HtmlLiteImpl
  : public NativeHtmlLiteCxxSpec<HtmlLiteImpl> {
public:
  HtmlLiteImpl(std::shared_ptr<CallInvoker> jsInvoker);

  double multiply(jsi::Runtime& rt, double a, double b);
};

}
