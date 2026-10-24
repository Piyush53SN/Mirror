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

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.canvas }}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <Backdrop theme={theme} />
      <View style={{ paddingTop: topInset }}>
        <Toolbar title={title} subtitle={subtitle} actions={actions} theme={theme} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.space(4),
          paddingTop: theme.space(2),
          paddingBottom: theme.size.tabBar + theme.space(10),
          gap: theme.space(3),
        }}
      >
        {children}
      </ScrollView>
      <TabBar
        items={TAB_ITEMS}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabKey)}
        liveBlur={tabBarBlur}
        theme={theme}
      />
      {iqs ? <WhyScoreSheet open={showWhy} iqs={iqs} onClose={() => setShowWhy(false)} /> : null}
    </View>
  );
}
