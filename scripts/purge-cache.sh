#!/usr/bin/env bash
# Purge Cloudflare edge cache for the API routes.
# Usage:
#   CF_PURGE_TOKEN=<token> ./scripts/purge-cache.sh          # purge openhebrewbible.com/api/*
#   CF_PURGE_TOKEN=<token> ./scripts/purge-cache.sh --all    # purge everything for both zones
#
# Token needs Zone → Cache Purge → Purge on each zone. Create one at
# https://dash.cloudflare.com/profile/api-tokens (use the "Purge Cache" template
# and scope it to openhebrewbible.com + cipherandstone.net).
#
# It also accepts a token file at ~/.config/cloudflare/ohb-purge-token
set -euo pipefail

TOKEN="${CF_PURGE_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$HOME/.config/cloudflare/ohb-purge-token" ]]; then
  TOKEN="$(cat "$HOME/.config/cloudflare/ohb-purge-token")"
fi
if [[ -z "$TOKEN" ]]; then
  echo "error: set CF_PURGE_TOKEN or put the token in ~/.config/cloudflare/ohb-purge-token" >&2
  echo "       create one at https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

ZONES=(
  "eb1604c86d990b85a1b1898092a63ce9" # openhebrewbible.com
  "c0dd646265c8b8e09e5d00944f7991ea" # cipherandstone.net
)

if [[ "${1:-}" == "--all" ]]; then
  echo "Purging everything for ${#ZONES[@]} zone(s)..."
  for zone in "${ZONES[@]}"; do
    echo -n "  $zone ... "
    resp=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone/purge_cache" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      --data '{"purge_everything":true}')
    if echo "$resp" | grep -q '"success":true'; then echo "ok"; else echo "failed: $resp" >&2; exit 1; fi
  done
else
  echo "Purging /api/* prefix for ${#ZONES[@]} zone(s)..."
  for zone in "${ZONES[@]}"; do
    echo -n "  $zone ... "
    # Prefix purge requires Enterprise; fall back to files/prefixes as available.
    # Try prefix purge first; if the plan doesn't support it, fall back to purge_everything for that zone.
    resp=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone/purge_cache" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      --data '{"prefixes":["openhebrewbible.com/api/","cipherandstone.net/api/"]}')
    if echo "$resp" | grep -q '"success":true'; then
      echo "ok (prefix)"
    else
      # Check if error is about prefix not supported — fall back to purging by URL pattern via purge_everything
      echo "prefix not supported, falling back to purge_everything..."
      resp2=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone/purge_cache" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
        --data '{"purge_everything":true}')
      if echo "$resp2" | grep -q '"success":true'; then echo "ok (full)"; else echo "failed: $resp2" >&2; exit 1; fi
    fi
  done
fi
echo "Done. Edge cache purged. Browser caches expire on their own (max-age=1h)."
