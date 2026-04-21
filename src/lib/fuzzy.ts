/** Levenshtein distance between two strings (case-insensitive). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Returns true if `query` fuzzy-matches `text`.
 * Strategy: substring match first (fast path), then word-level Levenshtein
 * with tolerance based on word length.
 */
const stripAccents = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function fuzzyMatch(text: string, query: string): boolean {
  const t = stripAccents(text);
  const q = stripAccents(query).trim();
  if (!q) return true;
  // Fast path: direct substring
  if (t.includes(q)) return true;
  // Word-level fuzzy: each query word must match at least one text word
  const queryWords = q.split(/\s+/);
  const textWords = t.split(/\s+/);
  return queryWords.every((qw) =>
    textWords.some((tw) => {
      const maxDist = qw.length <= 3 ? 0 : qw.length <= 5 ? 1 : 2;
      return levenshtein(qw, tw) <= maxDist;
    })
  );
}
