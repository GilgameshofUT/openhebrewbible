# Web Tanakh — production image
#
# The corpus is not committed to git. It is fetched from pinned upstream
# sources during the build, so the image is self-contained at runtime and the
# repository stays small.
#
# Build:  docker build -t web-tanakh .
# Run:    docker run -p 3000:3000 web-tanakh

# ---------------------------------------------------------------- deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------- data
# Fetches ~60 MB from GitHub and derives the per-book files and lemma index.
# Isolated in its own stage so application code changes do not re-trigger it.
FROM node:22-alpine AS data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY scripts ./scripts
COPY data/generated/manifest.json ./data/generated/manifest.json
RUN npm run import:oshb \
 && npm run import:citations \
 && npm run build:derived \
 # The raw upstream cache is only needed during import.
 && rm -rf data/sources/1* data/sources/2* data/sources/[A-Z]* data/sources/lexicon-* data/sources/translation-*

# ---------------------------------------------------------------- build
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=data /app/data/generated ./data/generated
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone output bundles only the node_modules the server actually needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Read at request time by src/lib/corpus.ts, resolved against process.cwd().
COPY --from=data    --chown=nextjs:nodejs /app/data/generated ./data/generated
COPY --from=builder --chown=nextjs:nodejs /app/data/external ./data/external
# Committed translation texts, converted to Jewish versification at import
# time, so the runner needs no citation-map work.
COPY --from=builder --chown=nextjs:nodejs /app/data/sources/kjv ./data/sources/kjv
COPY --from=builder --chown=nextjs:nodejs /app/data/sources/web ./data/sources/web
COPY --from=builder --chown=nextjs:nodejs /app/data/sources/ylt ./data/sources/ylt
COPY --from=builder --chown=nextjs:nodejs /app/data/sources/bsb ./data/sources/bsb

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/chapter?book=gen&chapter=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
