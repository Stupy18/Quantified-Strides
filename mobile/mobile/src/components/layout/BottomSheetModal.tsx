import React from 'react'
import { Modal, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../../hooks/useTheme'
import { SPACE, RADIUS } from '../../theme'

interface BottomSheetModalProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}

export function BottomSheetModal({ visible, onClose, children }: BottomSheetModalProps) {
  const theme = useTheme()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
        <View style={styles.handleRow}>
          <View style={[styles.handle, { backgroundColor: theme.textFaint }]} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:     { maxHeight: '82%', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderWidth: 1, borderBottomWidth: 0 },
  handleRow: { alignItems: 'center', paddingTop: SPACE.md },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  body:      { padding: SPACE.xl, paddingBottom: SPACE.xxl + SPACE.xl },
})
