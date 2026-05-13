import React, { useState, useRef } from 'react'
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'
import { StoryCardShell, AspectRatio } from './StoryCardShell'
import { StoryMoment } from '../../utils/storyTriggers'
import { CardRenderer } from './CardRenderer'

interface Props {
  moments: StoryMoment[]
  initialIndex?: number
}

export function StoriesViewer({ moments, initialIndex = 0 }: Props) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16')
  const scrollRef = useRef<ScrollView>(null)

  function handleScroll(e: any) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width)
    setCurrentIndex(idx)
  }

  if (moments.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.bgPage }]}>
        <Text style={[TEXT.narrativeLarge, { color: theme.textFaint, textAlign: 'center' }]}>
          No moments right now.{'\n'}Keep training.
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bgPage }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        contentOffset={{ x: initialIndex * width, y: 0 }}
        style={styles.scroll}
      >
        {moments.map((moment) => (
          <View key={moment.id} style={[styles.page, { width }]}>
            <StoryCardShell
              expiresAt={moment.expiresAt}
              aspectRatio={aspectRatio}
              onAspectChange={setAspectRatio}
            >
              <CardRenderer moment={moment} />
            </StoryCardShell>
          </View>
        ))}
      </ScrollView>

      {/* Page indicator dots */}
      {moments.length > 1 && (
        <View style={styles.dots}>
          {moments.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === currentIndex ? theme.accent : theme.textFaint,
                  width: i === currentIndex ? 16 : 6,
                },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.lg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.md,
  },
  dot: { height: 6, borderRadius: RADIUS.pill },
})
