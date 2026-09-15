import React from 'react'
import { Image, TouchableOpacity, StyleSheet } from 'react-native'

export function SplashScreen({ onNext }: { onNext: () => void }) {
  return (
    <TouchableOpacity
      onPress={onNext}
      activeOpacity={0.98}
      accessibilityRole="button"
      accessibilityLabel="הקש להתחלה"
      style={splashStyles.container}
    >
      <Image
        source={{ uri: '/image.png' }}
        resizeMode="contain"
        style={splashStyles.image}
      />
    </TouchableOpacity>
  )
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F1',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
})
