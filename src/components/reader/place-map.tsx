'use client'

import { useEffect, useRef, useState } from 'react'
import type { GeoPlace } from '@/data/tanakh'
import { mapEmbedUrl } from './study-panel'

/** Set this to enable drawing place shapes (regions, rivers) on the map. */
export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

declare global {
  interface Window {
    google?: {
      maps: {
        importLibrary: (name: 'maps' | 'marker') => Promise<{
          Map: new (node: HTMLElement, options: Record<string, unknown>) => unknown
        }>
        KmlLayer: new (options: { url: string; map: unknown; suppressInfoWindows: boolean }) => void
      }
    }
  }
}

let scriptPromise: Promise<void> | undefined

/** Loads the Maps JS API once and resolves when the google global is usable. */
function loadMapsApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google?.maps?.importLibrary) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-maps-api]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('maps api failed to load')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly`
    script.async = true
    script.dataset.mapsApi = '1'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('maps api failed to load')), { once: true })
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Draws a place on a map. Regions and rivers carry a KML shape; when the
 * Maps JS API key is configured the shape is drawn as a KmlLayer so the
 * polygon appears on Google Maps. Without a key, or for point places, it
 * falls back to the keyless embed iframe.
 */
export function PlaceMap({ place, large = false }: { place: GeoPlace; large?: boolean }) {
  const mount = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)

  const canDrawShape = Boolean(GOOGLE_MAPS_API_KEY && place.geometry?.kmlUrl && place.geometry.kind !== 'point')

  useEffect(() => {
    if (!canDrawShape || failed || !mount.current) return
    let disposed = false
    void loadMapsApi().then(async () => {
      if (disposed || !mount.current) return
      const google = window.google
      if (!google?.maps) {
        setFailed(true)
        return
      }
      try {
        const { Map } = await google.maps.importLibrary('maps')
        const map = new Map(mount.current, {
          center: { lat: Number(place.lonlat.split(',')[1]), lng: Number(place.lonlat.split(',')[0]) },
          zoom: 9,
        })
        new google.maps.KmlLayer({ url: place.geometry!.kmlUrl!, map, suppressInfoWindows: true })
      } catch {
        setFailed(true)
      }
    }).catch(() => setFailed(true))
    return () => { disposed = true }
  }, [canDrawShape, failed, place])

  if (!canDrawShape) {
    return (
      <iframe
        title={`Map of ${place.name}`}
        src={mapEmbedUrl(place)}
        className={large ? 'place-map place-map-large' : 'place-map'}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    )
  }
  if (failed) {
    return (
      <div className="place-map place-map-fallback" role="note">
        <span>The map could not load.</span>
        <a href={mapEmbedUrl(place)} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>
      </div>
    )
  }
  return <div ref={mount} className={large ? 'place-map place-map-large' : 'place-map'} aria-label={`Map of ${place.name}`} />
}