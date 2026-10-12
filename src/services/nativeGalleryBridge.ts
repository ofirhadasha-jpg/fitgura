import { Capacitor } from '@capacitor/core'

export interface NativePhoto {
  id: string
  url: string
  file?: File
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

export function getPlatform(): 'android' | 'ios' | 'web' {
  return Capacitor.getPlatform() as 'android' | 'ios' | 'web'
}

async function loadMediaPlugin() {
  const { Media } = await import('@capacitor-community/media')
  return Media
}

export async function requestGalleryPermissions(): Promise<boolean> {
  if (!isNativePlatform()) return false
  try {
    const Media = await loadMediaPlugin()
    const result = await Media.requestPermissions()
    return result.photos === 'granted' || result.photos === 'limited'
  } catch {
    return false
  }
}

export async function getGalleryPhotos(limit: number = 6): Promise<NativePhoto[]> {
  if (!isNativePlatform()) return []

  try {
    const granted = await requestGalleryPermissions()
    if (!granted) return []

    const Media = await loadMediaPlugin()

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
