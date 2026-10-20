import { memo } from 'react';

interface HighlightedTextProps {
  text: string;
  query: string;
  className?: string;
}

/** Normalize for accent-insensitive matching */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Build a mapping from normalized-string index → original-string index.
 * After NFD decomposition and diacritic removal, some original characters
 * map to fewer normalized characters (e.g., "é" → NFD "e\u0301" → stripped "e").
 * This mapping lets us accurately slice the original string.
 */
function buildIndexMap(original: string): number[] {
  const map: number[] = [];
  const origChars = [...original];

  for (let oi = 0; oi < origChars.length; oi++) {
    const nfdOfChar = origChars[oi].normalize('NFD');
    for (let ci = 0; ci < nfdOfChar.length; ci++) {
      if (!/[\u0300-\u036f]/.test(nfdOfChar[ci])) {
        map.push(oi);
      }
    }
  }
  map.push(origChars.length);
  return map;
}

/**
 * Renders text with matching substrings highlighted.
 * Accent-insensitive and case-insensitive.
 * Uses index mapping to correctly handle multi-byte/accented characters.
 */
export const HighlightedText = memo(function HighlightedText({
  text,
  query,
  className,
}: HighlightedTextProps) {
  if (!query.trim() || !text) {
    return <span className={className}>{text}</span>;
  }

  const normalizedText = normalize(text);
  const normalizedQuery = normalize(query);

  if (!normalizedQuery || !normalizedText.includes(normalizedQuery)) {
    return <span className={className}>{text}</span>;
  }

  // Build index map: normalizedIdx → original char index
  const origChars = [...text];
  const indexMap = buildIndexMap(text);

  const parts: { text: string; highlight: boolean }[] = [];
  let lastOrigIdx = 0;
  let searchStart = 0;

  while (searchStart <= normalizedText.length - normalizedQuery.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, searchStart);
    if (matchIndex === -1) break;

    const matchEnd = matchIndex + normalizedQuery.length;
    // Map back to original string positions
    const origStart = indexMap[matchIndex];
    const origEnd = indexMap[matchEnd] ?? origChars.length;

    // Add text before match
    if (origStart > lastOrigIdx) {
      parts.push({ text: origChars.slice(lastOrigIdx, origStart).join(''), highlight: false });
    }

    // Add matched text (original casing/accents preserved)
    parts.push({
      text: origChars.slice(origStart, origEnd).join(''),
      highlight: true,
    });

    lastOrigIdx = origEnd;
    searchStart = matchEnd;
  }

  // Add remaining text
  if (lastOrigIdx < origChars.length) {
    parts.push({ text: origChars.slice(lastOrigIdx).join(''), highlight: false });
  }

  if (parts.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark
            key={i}
            className="bg-[hsl(var(--warning)/0.35)] dark:bg-[hsl(var(--warning)/0.25)] text-inherit rounded-sm px-0.5"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
});
