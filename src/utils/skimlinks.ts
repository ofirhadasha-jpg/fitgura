import { SKIMLINKS_PUBLISHER_ID } from '../lib/config'

// Wraps any raw merchant URL with a Skimlinks server-side redirect.
// When a user clicks the resulting link, Skimlinks handles the affiliate
// redirect transparently — no client-side JavaScript snippet needed.
export function wrapWithSkimlinks(originalUrl: string): string {
  if (!originalUrl) return originalUrl
  if (!SKIMLINKS_PUBLISHER_ID) return originalUrl
  return `https://go.skimlinks.com/?id=${SKIMLINKS_PUBLISHER_ID}&xs=1&url=${encodeURIComponent(originalUrl)}`
}
