function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderInlineFormatting(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/gi, (_match, label: string, escapedUrl: string) => {
      const url = escapedUrl.replace(/&amp;/g, '&');
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return escapeHtml(label);
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      } catch {
        return escapeHtml(label);
      }
    })
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
}

export function formatEmailComposerHtml(value: string): string {
  const output: string[] = [];
  let listOpen = false;
  for (const line of value.split(/\r?\n/)) {
    if (line.startsWith('- ')) {
      if (!listOpen) { output.push('<ul>'); listOpen = true; }
      output.push(`<li>${renderInlineFormatting(line.slice(2))}</li>`);
      continue;
    }
    if (listOpen) { output.push('</ul>'); listOpen = false; }
    if (line.startsWith('> ')) output.push(`<blockquote>${renderInlineFormatting(line.slice(2))}</blockquote>`);
    else output.push(line ? `<div>${renderInlineFormatting(line)}</div>` : '<div><br></div>');
  }
  if (listOpen) output.push('</ul>');
  return output.join('');
}

export function formatEmailComposerText(value: string): string {
  return value
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/gi, '$1 ($2)')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1');
}
