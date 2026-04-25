import React from 'react'
import { ScrollView, View, StyleSheet, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../hooks/useTheme'

interface ScreenWrapperProps {
  children: React.ReactNode
  scrollable?: boolean
  style?: ViewStyle
}

export function ScreenWrapper({ children, scrollable = true, style }: ScreenWrapperProps) {
  const theme = useTheme()
  const inner = <View style={[styles.inner, style]}>{children}</View>
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }}>
      {scrollable
        ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {inner}
          </ScrollView>
        )
        : inner
      }
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  inner:  { flex: 1, paddingHorizontal: 18, paddingBottom: 100 },
  scroll: { paddingBottom: 120 },
})
