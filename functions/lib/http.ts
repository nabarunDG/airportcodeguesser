export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Every one of these endpoints returns per-request state — a leaderboard
      // that changes the moment anyone posts. Sending no caching headers at all
      // left the browser free to apply heuristic caching, and it did: posting a
      // score wrote the row (POST 200), then the refresh immediately after was
      // served from disk cache in ~1ms, showing the board from *before* the
      // post. The score looked like it had been silently dropped when it was
      // actually saved and simply not re-read.
      'cache-control': 'no-store',
    },
  });
}
