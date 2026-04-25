import { Tabs } from 'expo-router'
import { ActiveTheme } from '../../src/theme'

export default function TabsLayout() {
  const t = ActiveTheme
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: t.bgPage,
        borderTopColor: t.tabBorder,
        borderTopWidth: 1,
        height: 82,
        paddingBottom: 16,
      },
      tabBarActiveTintColor:   t.accent,
      tabBarInactiveTintColor: t.textFaint,
      tabBarLabelStyle: {
        fontFamily: 'JetBrainsMono',
        fontSize: 9,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
      },
    }}>
      <Tabs.Screen name="today"   options={{ title: 'Today' }} />
      <Tabs.Screen name="load"    options={{ title: 'Load' }} />
      <Tabs.Screen name="log"     options={{ title: 'Log' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="me"      options={{ title: 'Me' }} />
    </Tabs>
  )
}
