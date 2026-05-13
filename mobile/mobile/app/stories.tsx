import React, { useEffect, useState } from 'react'
import { View, TouchableOpacity, Text, StyleSheet, SafeAreaView } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTheme } from '../src/hooks/useTheme'
import { TEXT, SPACE } from '../src/theme'
import { StoriesViewer } from '../src/components/story-cards/StoriesViewer'
import { getActiveMoments, StoryMoment } from '../src/utils/storyTriggers'

export default function StoriesScreen() {
  const theme = useTheme()
  const params = useLocalSearchParams<{ initialType?: string }>()
  const [moments, setMoments] = useState<StoryMoment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveMoments().then((active) => {
      setMoments(active)
      setLoading(false)
    })
  }, [])

  const initialIndex = params.initialType
    ? Math.max(0, moments.findIndex((m) => m.type === params.initialType))
    : 0

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bgPage }]}>
      {/* Back button */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>← BACK</Text>
        </TouchableOpacity>
        <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>YOUR MOMENT</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? null : (
        <StoriesViewer moments={moments} initialIndex={initialIndex} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  backBtn: { width: 60 },
})
