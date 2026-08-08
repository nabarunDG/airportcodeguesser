// GET /api/where — approximate location for the check-in screen's opening
// guess. Response: { lat, lon, city, country }, every field optional.
//
// Cloudflare resolves this from the connection at the edge (request.cf), so
// there is no browser permission prompt and no third-party geolocation
// service. It is a coarse, IP-derived guess — right often enough to save a
// player typing, wrong behind a VPN — so the client always presents it as an
// editable suggestion rather than fact.
//
// PRIVACY: read off the request and handed straight back to the same visitor
// who generated it. Never written to D1, never logged, never joined to
// playerId — the same anonymity the rest of this API keeps (see ping.ts).
// jsonResponse sends `cache-control: no-store`, which matters more here than
// anywhere else: a cached copy would hand one visitor's location to another.
import type { PagesFunction } from '@cloudflare/workers-types';
import { jsonResponse } from '../lib/http';

// No bindings — this endpoint reads nothing and writes nothing.
type Env = Record<string, never>;

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  // `request.cf` is absent under `wrangler pages dev` (and the whole Functions
  // layer is absent under `vite dev`), so an empty object is a normal answer,
  // not an error. The client falls through to its timezone seed.
  const cf = request.cf;
  if (!cf) return jsonResponse({}, 200);

  // cf.latitude/longitude arrive as strings; hand back numbers, and drop them
  // entirely rather than emit NaN if they're missing or unparseable.
  const lat = Number(cf.latitude);
  const lon = Number(cf.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  return jsonResponse(
    {
      ...(hasCoords ? { lat, lon } : {}),
      ...(cf.city ? { city: cf.city } : {}),
      ...(cf.country ? { country: cf.country } : {}),
    },
    200,
  );
};
