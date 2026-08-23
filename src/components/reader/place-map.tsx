'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { GeoPlace } from '@/data/tanakh'
import { mapEmbedUrl } from './study-panel'

/**
 * Interactive map for a place, drawn with Leaflet over OpenStreetMap tiles —
 * keyless, no billing, and compliant with the OSM tile usage policy: tiles
 * are fetched only for the user's current view, the Referer header is sent
 * (strict-origin-when-cross-origin), and attribution is shown.
 *
 * Point places get a marker. Regions and rivers draw the polygon/path
 * coordinates that ship with the place payload (self-hosted, generated at
 * import time), so no upstream geometry is fetched at runtime. On any failure
 * the keyless embed iframe is shown instead.
 *
 * Leaflet is imported inside the effect: its module reads `window` at import
 * time, so a static import would crash the server-side prerender.
 */
export function PlaceMap({ place, large = false }: { place: GeoPlace; large?: boolean }) {
  const mount = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  // Tracks the Leaflet instance and the id it was drawn for. Leaflet stamps
  // _leaflet_id on the container, so a second L.map() on the same node throws
  // "already initialized"; the ref lets cleanup remove the previous map before
  // the effect re-runs for a different place.
  const mapRef = useRef<{ remove: () => void } | null>(null)
  const drawnFor = useRef<string | null>(null)

  useEffect(() => {
    if (failed || !mount.current) return
    const node = mount.current
    let disposed = false

    const draw = async () => {
      const L = (await import('leaflet')).default
      // Leaflet's default marker icon resolves to /marker-icon.png, which does
      // not exist on this host; point it at the bundled images instead.
      const DefaultIcon = L.icon({
        iconUrl: (await import('leaflet/dist/images/marker-icon.png')).default.src,
        iconRetinaUrl: (await import('leaflet/dist/images/marker-icon-2x.png')).default.src,
        shadowUrl: (await import('leaflet/dist/images/marker-shadow.png')).default.src,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      })
      L.Marker.prototype.options.icon = DefaultIcon
      if (disposed) return
      const [lon, lat] = place.lonlat.split(',').map(Number)

      // A previous run may have initialised this node (StrictMode, a parent
      // re-render between import and init). Remove it first so L.map() gets a
      // clean container instead of throwing "Map container is already
      // initialized".
      if ((node as HTMLElement & { _leaflet_id?: number })._leaflet_id || mapRef.current) {
        mapRef.current?.remove()
        mapRef.current = null
      }

      const map = L.map(node, { center: [lat, lon], zoom: 9, attributionControl: true })
      mapRef.current = map
      drawnFor.current = place.id
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map)

      const shape = place.shape
      if (shape && (shape.polygons.length || shape.paths.length)) {
        if (!disposed) {
          // The payload stores [lat, lng] rings (what Leaflet's native layers
          // expect), so draw polygons/polylines directly rather than routing
          // through GeoJSON, which would re-interpret the pair order.
          const layerGroup = L.featureGroup().addTo(map)
          // A single polygon is a firm identification and keeps its outline.
          // Multiple polygons are overlapping uncertainty bands: outlining
          // each makes a messy tangle, so drop the stroke and let the
          // translucent fills stack — darker where the bands overlap, fainter
          // toward the uncertain edges.
          const overlapped = shape.polygons.length > 1
          const polygonStyle = overlapped
            ? { color: 'transparent', weight: 0, fillColor: '#792d39', fillOpacity: 0.12 }
            : { color: '#792d39', weight: 2, fillOpacity: 0.15 }
          for (const polygon of shape.polygons) {
            L.polygon(polygon as never, polygonStyle).addTo(layerGroup)
          }
          for (const path of shape.paths) {
            L.polyline(path as never, { color: '#792d39', weight: 2 }).addTo(layerGroup)
          }
          map.fitBounds(layerGroup.getBounds(), { padding: [16, 16] })
        }
      } else {
        L.marker([lat, lon]).addTo(map)
      }
    }

    void draw().catch((error) => {
      if (!disposed) setFailed(error instanceof Error ? error.message : String(error))
    })
    return () => {
      disposed = true
      // Only tear down the map this effect drew (a newer effect may already
      // own the node), but always clear it before a re-run for another place.
      if (drawnFor.current === place.id) {
        try {
          mapRef.current?.remove()
        } catch {
          // Leaflet's teardown can throw in jsdom, where the marker's DOM is
          // not fully present; the map node is being discarded regardless.
        }
        mapRef.current = null
        drawnFor.current = null
      }
    }
    // Draw once per place. The place object is recreated on every parent
    // render, so depend on the stable id rather than the object reference.
  }, [failed, place.id])

  if (failed) {
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
  return (
    <div
      ref={mount}
      className={large ? 'place-map place-map-large' : 'place-map'}
      aria-label={`Map of ${place.name}`}
    />
  )
}