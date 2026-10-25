import * as React from 'react';
import { Platform, ScrollView, StatusBar, View } from 'react-native';
import { Backdrop, TabBar, Toolbar, rgba, useLiveBlur, useTheme } from '@mirror/ui';
import { TAB_ITEMS } from '@mirror/ui/tabs';
import { useMirrorApp, type TabKey } from '../context/MirrorAppContext';
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
  const { activeTab, setActiveTab, iqs, showWhy, setShowWhy } = useMirrorApp();
  const tabBarBlur = useLiveBlur('tab-bar');
  const topInset =
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) + theme.space(1.5) : theme.space(6);
  // Reserve space above Android's edge-to-edge gesture / 3-button navigation bar
  // and guarantee generous non-collapsing bottom clearance below the last card on every tab.
  const navBarReserve = Platform.OS === 'android' ? theme.space(5) : 0;
  const bottomSpacerHeight = theme.size.tabBar + navBarReserve + theme.space(9);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.canvas }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <Backdrop theme={theme} />
      <View style={{ paddingTop: topInset }}>
        <Toolbar title={title} subtitle={subtitle} actions={actions} theme={theme} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.space(4),
          paddingTop: theme.space(2),
          paddingBottom: theme.space(6),
        }}
      >
        <View style={{ gap: theme.space(3) }}>{children}</View>
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
        <View style={{ height: theme.space(2), backgroundColor: rgba(theme.color.canvas, 0.35) }} />
        <View style={{ height: theme.space(2), backgroundColor: rgba(theme.color.canvas, 0.68) }} />
        <View
          style={{
            height: theme.size.tabBar + navBarReserve + theme.space(2),
            backgroundColor: rgba(theme.color.canvas, 0.92),
          }}
        />
      </View>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: navBarReserve,
        }}
      >
        {/* High-opacity Frosted Horizon shell backing directly behind TabBar pill */}
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
            backgroundColor: rgba(theme.color.shell, theme.isDark ? 0.94 : 0.93),
          }}
        />
        <TabBar
          items={TAB_ITEMS}
          active={activeTab}
          onChange={(id) => setActiveTab(id as TabKey)}
          liveBlur={tabBarBlur}
          theme={theme}
        />
      </View>
      {iqs ? <WhyScoreSheet open={showWhy} iqs={iqs} onClose={() => setShowWhy(false)} /> : null}
    </View>
  );
}
