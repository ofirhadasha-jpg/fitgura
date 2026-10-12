export interface NativePhoto {
  id: string
  url: string
  file?: File
}

const PERMISSION_KEY = 'gallery_permission_granted'

type CapacitorLike = {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
}

function getCapacitor(): CapacitorLike | null {
  try {
    if (typeof window !== 'undefined') {
      const cap = (window as any).Capacitor
      if (cap && typeof cap === 'object') return cap as CapacitorLike
    }
  } catch {
    // ignore
  }
  return null
}

export function isNativePlatform(): boolean {
  try {
    const cap = getCapacitor()
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

export function getPlatform(): 'android' | 'ios' | 'web' {
  try {
    const cap = getCapacitor()
    const p = cap?.getPlatform?.()
    if (p === 'android' || p === 'ios') return p
  } catch {
    // ignore
  }
  return 'web'
}

const MEDIA_PLUGIN_ID = '@capacitor-community/media'
const PREFERENCES_PLUGIN_ID = '@capacitor/preferences'

async function loadMediaPlugin(): Promise<any | null> {
  if (!isNativePlatform()) return null
  try {
    const mod = await import(/* @vite-ignore */ MEDIA_PLUGIN_ID)
    return mod.Media
  } catch {
    return null
  }
}

async function loadPreferences(): Promise<any | null> {
  if (!isNativePlatform()) return null
  try {
    const mod = await import(/* @vite-ignore */ PREFERENCES_PLUGIN_ID)
    return mod.Preferences
  } catch {
    return null
  }
}

export async function getGalleryPermissionGranted(): Promise<boolean> {
  const Preferences = await loadPreferences()
  if (Preferences) {
    try {
      const { value } = await Preferences.get({ key: PERMISSION_KEY })
      return value === 'true'
    } catch {
      // fall through to localStorage
    }
  }
  try {
    return localStorage.getItem(PERMISSION_KEY) === 'true'
  } catch {
    return false
  }
}

export async function setGalleryPermissionGranted(granted: boolean): Promise<void> {
  const Preferences = await loadPreferences()
  if (Preferences) {
    try {
      await Preferences.set({ key: PERMISSION_KEY, value: granted ? 'true' : 'false' })
      return
    } catch {
      // fall through to localStorage
    }
  }
  try {
    localStorage.setItem(PERMISSION_KEY, granted ? 'true' : 'false')
  } catch {
    // ignore
  }
}

export async function requestGalleryPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return false
  const Media = await loadMediaPlugin()
  if (!Media) return false
  try {
    const result = await Media.requestPermissions()
    const granted = result.photos === 'granted' || result.photos === 'limited'
    if (granted) await setGalleryPermissionGranted(true)
    return granted
  } catch {
    return false
  }
}

export async function getGalleryPhotos(limit: number = 6): Promise<NativePhoto[]> {
  if (!isNativePlatform()) return []

  const Media = await loadMediaPlugin()
  if (!Media) return []

  try {
    const alreadyGranted = await getGalleryPermissionGranted()
    if (!alreadyGranted) {
      const granted = await requestGalleryPermissions()
      if (!granted) return []
    }

    const albums = await Media.getAlbums()
    if (!albums.albums || albums.albums.length === 0) return []

    const photos: NativePhoto[] = []

    for (const album of albums.albums.slice(0, 3)) {
      try {
        const result = await Media.getMediaList({
          albumId: album.identifier,
          limit,
        })
        if (result.mediaList) {
          for (const media of result.mediaList) {
            if (photos.length >= limit) break
            if (media.type && media.type !== 'image') continue
            photos.push({
              id: `native_${media.identifier ?? photos.length}`,
              url: media.path ?? media.fullPath ?? '',
            })
          }
        }
      } catch {
        // Skip albums that fail
      }
      if (photos.length >= limit) break
    }

    return photos.slice(0, limit)
  } catch (err) {
    console.error('[nativeGalleryBridge] getGalleryPhotos failed:', err)
    return []
  }
}

export async function fetchPhotoAsFile(photoUrl: string): Promise<File | null> {
  try {
    const response = await fetch(photoUrl)
    const blob = await response.blob()
    return new File([blob], `native_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}
