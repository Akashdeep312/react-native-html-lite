#include "HtmlLiteImpl.h"

namespace facebook::react {

HtmlLiteImpl::HtmlLiteImpl(
  std::shared_ptr<CallInvoker> jsInvoker
)
  : NativeHtmlLiteCxxSpec(std::move(jsInvoker)) {}

double HtmlLiteImpl::multiply(
  jsi::Runtime& rt,
  double a,
  double b
) {
  return a * b;
}

}
