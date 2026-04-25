import React from 'react'
import { Tabs } from 'expo-router'
import Svg, { Path, Circle } from 'react-native-svg'
import { ActiveTheme } from '../../src/theme'

type IconProps = { color: string; size: number }

function TodayIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.5} />
      <Circle cx={12} cy={12} r={2.5} fill={color} />
    </Svg>
  )
}

// Rising Bezier curve + endpoint dot — mirrors the CTL line on the Load screen.
function LoadIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3,20 C6,18 9,15 13,11 S18,6 21,4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Circle cx={21} cy={4} r={2} fill={color} />
    </Svg>
  )
}

function LogIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  )
}

function HistoryIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.5} />
      <Path
        d="M12 8v4l2.5 2"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function MeIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={1.5} />
      <Path
        d="M4.5 20c0-3.9 3.4-6.5 7.5-6.5s7.5 2.6 7.5 6.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  )
}

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
      <Tabs.Screen name="today"   options={{ title: 'Today',   tabBarIcon: ({ color, size }) => <TodayIcon   color={color} size={size} /> }} />
      <Tabs.Screen name="load"    options={{ title: 'Load',    tabBarIcon: ({ color, size }) => <LoadIcon    color={color} size={size} /> }} />
      <Tabs.Screen name="log"     options={{ title: 'Log',     tabBarIcon: ({ color, size }) => <LogIcon     color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color, size }) => <HistoryIcon color={color} size={size} /> }} />
      <Tabs.Screen name="me"      options={{ title: 'Me',      tabBarIcon: ({ color, size }) => <MeIcon      color={color} size={size} /> }} />
    </Tabs>
  )
}
