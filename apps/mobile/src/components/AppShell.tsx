import * as React from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import { Backdrop, Callout, Pill, TabBar, Text, Toolbar, rgba, useLiveBlur, useTheme } from '@mirror/ui';
import { TAB_ITEMS } from '@mirror/ui/tabs';
import { useMirrorApp, type TabKey } from '../context/MirrorAppContext';
import { useSafeInsets } from './useSafeInsets';
import { WhyScoreSheet } from './WhyScoreSheet';

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const {
    activeTab,
    setActiveTab,
    permission,
    openSettings,
    insets: contextInsets,
    iqs,
    showWhy,
    setShowWhy,
  } = useMirrorApp();
  const tabBarBlur = useLiveBlur('tab-bar');
  const insets = useSafeInsets(contextInsets);

  const topInset = insets.top + theme.space(2);
  const horizontalInset = Math.max(theme.space(4), Math.max(insets.left, insets.right) + theme.space(4));
  // Reserve space above Android's edge-to-edge gesture / 3-button navigation bar
  // and guarantee generous non-collapsing bottom clearance below the last card on every tab.
  const navBarReserve = Math.max(insets.bottom, theme.space(5));
  const bottomSpacerHeight = theme.size.tabBar + navBarReserve + theme.space(9);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.canvas }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <Backdrop theme={theme} />
      <View
        importantForAccessibility={showWhy ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1 }}
      >
        <View style={{ paddingTop: topInset, paddingLeft: insets.left, paddingRight: insets.right }}>
          <Toolbar title={title} subtitle={subtitle} actions={actions} theme={theme} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: horizontalInset,
            paddingTop: theme.space(2.5),
            paddingBottom: theme.space(6),
          }}
        >
          <View style={{ gap: theme.space(3) }}>
            {permission === 'denied' ? (
              <View testID="usage-access-revoked-banner" style={{ gap: theme.space(2) }}>
                <Callout theme={theme} tone="limit">
                  <Text role="label" theme={theme}>
                    Usage access is turned off. New app activity is paused until you turn Usage access back on in Android settings; your stored local history and privacy controls remain available.
                  </Text>
                </Callout>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) }}>
                  <Pill theme={theme} onPress={openSettings}>
                    Open Android settings
                  </Pill>
                </View>
              </View>
            ) : null}
            {children}
          </View>
          <View
            pointerEvents="none"
            testID="tab-scroll-bottom-spacer"
            style={{ height: bottomSpacerHeight }}
          />
        </ScrollView>
        {/* Bottom backdrop scrim so scrolling text dims before reaching the floating TabBar */}
        <View
          pointerEvents="none"
          testID="tab-bar-bottom-scrim"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: theme.size.tabBar + navBarReserve + theme.space(6),
            justifyContent: 'flex-end',
          }}
        >
          <View style={{ height: theme.space(2), backgroundColor: rgba(theme.color.canvas, 0.45) }} />
          <View style={{ height: theme.space(2), backgroundColor: rgba(theme.color.canvas, 0.82) }} />
          <View
            style={{
              height: theme.size.tabBar + navBarReserve + theme.space(2),
              backgroundColor: theme.color.canvas,
            }}
          />
        </View>
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: insets.left,
            right: insets.right,
            bottom: navBarReserve,
          }}
        >
          {/* Solid opaque surface behind TabBar pill so scrolling text never shows through */}
          <View
            pointerEvents="none"
            testID="tab-bar-opaque-backing"
            style={{
              position: 'absolute',
              left: theme.space(4),
              right: theme.space(4),
              bottom: theme.space(4),
              height: theme.size.tabBar,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.color.card,
            }}
          />
          <TabBar
            items={TAB_ITEMS}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TabKey)}
            liveBlur={tabBarBlur}
            opaque
            theme={theme}
          />
        </View>
      </View>
      {iqs ? <WhyScoreSheet open={showWhy} iqs={iqs} onClose={() => setShowWhy(false)} /> : null}
    </View>
  );
}
