export function emailHtmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const document = new DOMParser().parseFromString(html, 'text/html');
  const blocks = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'BR']);
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    const element = node as Element;
    const value = Array.from(node.childNodes).map(read).join('');
    return blocks.has(element.tagName) ? `${value}\n` : value;
  };
  return read(document.body).replace(/\n{3,}/g, '\n\n').trim();
}
