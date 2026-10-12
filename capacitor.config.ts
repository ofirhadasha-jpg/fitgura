import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fitgura.app',
  appName: 'פיטגורה',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    backgroundColor: '#FFFEF5',
  },
  plugins: {
    Media: {
      androidWritePermission: 'READ_MEDIA_IMAGES',
    },
  },
}

export default config
