// Anonymous per-browser player id, used for leaderboard PAX dedupe and the
// "YOURS" tag — same approach as the prototype's `myId()`.
const KEY = 'gatecheck_player_id';

export function getPlayerId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}
