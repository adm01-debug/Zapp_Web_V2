import { useMemo } from 'react';

/**
 * Converts WhatsApp markdown-style formatting to HTML for preview.
 * Supports: *bold*, _italic_, ~strikethrough~, ```code```
 */
export function formatWhatsAppText(text: string): string {
  // First: escape ALL HTML to neutralize any injected tags/scripts
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    // Code blocks (```...```) — must come before inline
    .replace(/```([\s\S]*?)```/g, '<code class="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
    // Bold (*...*) — not greedy, avoid matching ** 
    .replace(/\*([^\*]+)\*/g, '<strong>$1</strong>')
    // Italic (_..._)
    .replace(/_((?!_)[^_]+)_/g, '<em>$1</em>')
    // Strikethrough (~...~)
    .replace(/~([^~]+)~/g, '<del class="text-muted-foreground">$1</del>')
    // Line breaks
    .replace(/\n/g, '<br />');
  
  return formatted;
}

interface MarkdownPreviewProps {
  text: string;
  className?: string;
}

export function MarkdownPreview({ text, className }: MarkdownPreviewProps) {
  const html = useMemo(() => formatWhatsAppText(text), [text]);
  
  if (!text.trim()) return null;
  
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
