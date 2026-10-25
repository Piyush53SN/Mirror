import * as React from 'react';
import { Platform, ScrollView, StatusBar, View } from 'react-native';
import { Backdrop, TabBar, Toolbar, useLiveBlur, useTheme } from '@mirror/ui';
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
