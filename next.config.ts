import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Emit a self-contained server bundle with only the required node_modules,
  // so the Docker runtime stage does not need a full install.
  output: 'standalone',
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // The reader embeds SoundCloud and YouTube players and loads
        // manuscript scans from external hosts, so those origins are allowed
        // explicitly rather than opening the policy up.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://w.soundcloud.com https://maps.googleapis.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "media-src 'self' https:",
            "font-src 'self'",
            "frame-src https://w.soundcloud.com https://www.youtube.com https://youtube.com https://www.google.com/maps",
            "connect-src 'self' https://api-v2.soundcloud.com https://maps.googleapis.com",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
          ].join('; '),
        },
      ],
    }]
  },
}

export default nextConfig
