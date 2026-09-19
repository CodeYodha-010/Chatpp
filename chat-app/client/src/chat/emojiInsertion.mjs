// Keep the server's 5,000 UTF-16-code-unit limit without cutting emoji clusters.
export const MESSAGE_LIMIT = 5000;

export function insertEmoji(text, emoji, start, end, limit = MESSAGE_LIMIT) {
  const boundaries = [0];
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    boundaries.push(part.index + part.segment.length);
  }
  const from = Math.max(0, Math.min(text.length, start ?? text.length));
  const to = Math.max(from, Math.min(text.length, end ?? from));
  const left = boundaries.filter((n) => n <= from).at(-1);
  const right = from === to ? left : boundaries.find((n) => n >= to);
  const value = text.slice(0, left) + emoji + text.slice(right);
  if (value.length > limit) return null;
  return { value, cursor: left + emoji.length };
}
