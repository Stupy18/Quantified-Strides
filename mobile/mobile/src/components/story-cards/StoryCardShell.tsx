import React, { useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Share,
  StyleSheet,
  useWindowDimensions,
  ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { captureRef } from 'react-native-view-shot'
import Svg, { Rect } from 'react-native-svg'
import { useTheme } from '../../hooks/useTheme'
import { TEXT, SPACE, RADIUS } from '../../theme'

export type AspectRatio = '9:16' | '1:1'

interface StoryCardShellProps {
  expiresAt: number
  aspectRatio: AspectRatio
  onAspectChange: (ratio: AspectRatio) => void
  children: React.ReactNode
  style?: ViewStyle
}

export function StoryCardShell({
  expiresAt,
  aspectRatio,
  onAspectChange,
  children,
  style,
}: StoryCardShellProps) {
  const theme = useTheme()
  const { width: screenWidth } = useWindowDimensions()
  const cardRef = useRef<View>(null)
  const [sharing, setSharing] = useState(false)

  const cardWidth = screenWidth - SPACE.lg * 2
  const cardHeight = aspectRatio === '9:16' ? cardWidth * (16 / 9) : cardWidth

  const hoursLeft = Math.max(
    0,
    Math.round((expiresAt - Date.now()) / (1000 * 60 * 60))
  )
  const expiryLabel = hoursLeft <= 1 ? 'fades soon' : `fades in ${hoursLeft}h`

  async function handleShare() {
    if (!cardRef.current || sharing) return
    setSharing(true)
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1.0 })
      await Share.share({ url: uri })
    } catch (_) {
      // user cancelled or capture failed — silent
    } finally {
      setSharing(false)
    }
  }

  return (
    <View style={[{ width: cardWidth }, style]}>
      {/* Capturable card area */}
      <View
        ref={cardRef}
        collapsable={false}
        style={[styles.card, { width: cardWidth, height: cardHeight, borderRadius: RADIUS.xl }]}
      >
        {/* Gradient background */}
        <LinearGradient
          colors={[theme.bgCard, theme.bgPage]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />


        {/* Subtle border */}
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.border,
            { borderColor: theme.borderSubtle, borderRadius: RADIUS.xl },
          ]}
          pointerEvents="none"
        />

        {/* Top row: aspect toggle + expiry */}
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={() => onAspectChange(aspectRatio === '9:16' ? '1:1' : '9:16')}
            style={[styles.ratioToggle, { backgroundColor: theme.bgCardDeep, borderColor: theme.borderSubtle }]}
            activeOpacity={0.7}
          >
            <Text style={[TEXT.monoSmall, { color: theme.textMuted }]}>
              {aspectRatio}
            </Text>
          </TouchableOpacity>
          <Text style={[TEXT.monoSmall, { color: theme.textFaint }]}>
            {expiryLabel}
          </Text>
        </View>

        {/* Card content */}
        <View style={styles.content}>{children}</View>
      </View>

      {/* Share button — outside capturable area */}
      <TouchableOpacity
        onPress={handleShare}
        activeOpacity={0.8}
        style={[styles.shareButton, { backgroundColor: theme.accent }]}
      >
        <Text style={[TEXT.monoMedium, { color: theme.textOnAccent, letterSpacing: 2 }]}>
          {sharing ? 'CAPTURING...' : 'SHARE MOMENT'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
  },
  grainWrap: {
    opacity: 0.8,
    mixBlendMode: 'screen',
  },
  border: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
  },
  ratioToggle: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.lg,
  },
  shareButton: {
    marginTop: SPACE.md,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACE.md,
    alignItems: 'center',
  },
})
