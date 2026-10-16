const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

// Expo SDK 51 creates its React window in AppDelegate. Attach that window to
// the scene UIKit supplies; tvOS 27 requires a scene-based lifecycle.
const sceneDelegate = `
@interface OrionTVSceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation OrionTVSceneDelegate
- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) return;
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  self.window = appDelegate.window;
  self.window.windowScene = (UIWindowScene *)scene;
  [self.window makeKeyAndVisible];
  for (UIOpenURLContext *context in connectionOptions.URLContexts) {
    [self forwardURLContext:context];
  }
  for (NSUserActivity *activity in connectionOptions.userActivities) {
    [self scene:scene continueUserActivity:activity];
  }
}

- (void)forwardURLContext:(UIOpenURLContext *)context
{
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  NSMutableDictionary *options = [NSMutableDictionary dictionary];
  if (context.options.sourceApplication) options[UIApplicationOpenURLOptionsSourceApplicationKey] = context.options.sourceApplication;
  if (context.options.annotation) options[UIApplicationOpenURLOptionsAnnotationKey] = context.options.annotation;
  options[UIApplicationOpenURLOptionsOpenInPlaceKey] = @(context.options.openInPlace);
  [appDelegate application:UIApplication.sharedApplication openURL:context.URL options:options];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) [self forwardURLContext:context];
}

- (void)scene:(UIScene *)scene continueUserActivity:(NSUserActivity *)userActivity
{
  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;
  [appDelegate application:UIApplication.sharedApplication continueUserActivity:userActivity restorationHandler:^(NSArray *objects) {}];
}
@end
`;

module.exports = function withTVSceneLifecycle(config) {
  if (process.env.EXPO_TV !== '1') return config;
  config = withInfoPlist(config, config => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'OrionTVSceneDelegate',
        }],
      },
    };
    return config;
  });
  return withAppDelegate(config, config => {
    if (!config.modResults.contents.includes('@implementation OrionTVSceneDelegate')) {
      config.modResults.contents += sceneDelegate;
    }
    return config;
  });
};
