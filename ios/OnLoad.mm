#import <Foundation/Foundation.h>
#import "HtmlLiteImpl.h"
#import <ReactCommon/CxxTurboModuleUtils.h>

@interface HtmlLiteOnLoad : NSObject
@end

@implementation HtmlLiteOnLoad

using namespace facebook::react;

+ (void)load
{
  registerCxxModuleToGlobalModuleMap(
    std::string(HtmlLiteImpl::kModuleName),
    [](std::shared_ptr<CallInvoker> jsInvoker) {
      return std::make_shared<HtmlLiteImpl>(jsInvoker);
    }
  );
}

@end
