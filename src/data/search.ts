/**
 * Scores how well `text` matches `query`: substring matches score highest (earlier is better),
 * then in-order subsequence matches (consecutive letters and word starts score more).
 * Returns null when the query letters don't all appear in order.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();

  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at;

  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    score += found === prev + 1 ? 5 : 1;
    if (found === 0 || t[found - 1] === ' ') score += 3;
    prev = found;
    from = found + 1;
  }
  return score;
}

export function filterByQuery<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
