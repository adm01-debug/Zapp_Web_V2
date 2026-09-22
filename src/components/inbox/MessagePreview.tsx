import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MessagePreviewProps {
  content: string;
  className?: string;
}

// Convert markdown-like syntax and emoji shortcodes to formatted preview
export function MessagePreview({ content, className }: MessagePreviewProps) {
  const formattedContent = useMemo(() => {
    if (!content) return null;

    let result = content;

    // Convert emoji shortcodes to actual emojis
    const emojiMap: Record<string, string> = {
      ':)': '😊',
      ':-)': '😊',
      ':(': '😔',
      ':-(': '😔',
      ':D': '😃',
      ':-D': '😃',
      ';)': '😉',
      ';-)': '😉',
      ':P': '😛',
      ':-P': '😛',
      ':p': '😛',
      '<3': '❤️',
      ':heart:': '❤️',
      ':fire:': '🔥',
      ':thumbsup:': '👍',
      ':thumbs_up:': '👍',
      ':thumbsdown:': '👎',
      ':thumbs_down:': '👎',
      ':star:': '⭐',
      ':check:': '✅',
      ':x:': '❌',
      ':warning:': '⚠️',
      ':info:': 'ℹ️',
      ':rocket:': '🚀',
      ':sparkles:': '✨',
      ':wave:': '👋',
      ':clap:': '👏',
      ':pray:': '🙏',
      ':100:': '💯',
      ':tada:': '🎉',
      ':eyes:': '👀',
      ':ok:': '👌',
    };

    Object.entries(emojiMap).forEach(([code, emoji]) => {
      result = result.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emoji);
    });

    return result;
  }, [content]);

  const parts = useMemo(() => {
    if (!formattedContent) return [];

    const segments: { type: 'text' | 'bold' | 'italic' | 'code' | 'link'; content: string; url?: string }[] = [];
    const remaining = formattedContent;

    // Process formatting patterns
    const patterns = [
      { regex: /\*\*(.+?)\*\*/g, type: 'bold' as const },
      { regex: /\*(.+?)\*/g, type: 'italic' as const },
      { regex: /_(.+?)_/g, type: 'italic' as const },
      { regex: /`(.+?)`/g, type: 'code' as const },
      { regex: /(https?:\/\/[^\s]+)/g, type: 'link' as const },
    ];

    // Simple parsing - split on patterns
    let lastIndex = 0;
    const allMatches: { index: number; length: number; type: typeof patterns[0]['type']; content: string; url?: string }[] = [];

    patterns.forEach(({ regex, type }) => {
      const matches = [...formattedContent.matchAll(regex)];
      matches.forEach(match => {
        if (match.index !== undefined) {
          allMatches.push({
            index: match.index,
            length: match[0].length,
            type,
            content: type === 'link' ? match[0] : match[1],
            url: type === 'link' ? match[0] : undefined,
          });
        }
      });
    });

    // Sort matches by index
    allMatches.sort((a, b) => a.index - b.index);

    // Build segments
    allMatches.forEach(match => {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: formattedContent.slice(lastIndex, match.index) });
      }
      segments.push({ type: match.type, content: match.content, url: match.url });
      lastIndex = match.index + match.length;
    });

    if (lastIndex < formattedContent.length) {
      segments.push({ type: 'text', content: formattedContent.slice(lastIndex) });
    }

    return segments.length > 0 ? segments : [{ type: 'text' as const, content: formattedContent }];
  }, [formattedContent]);

  if (!content) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        className={cn(
          "text-sm text-muted-foreground p-2 rounded-lg bg-muted/50 border border-border/50",
          className
        )}
      >
        <span className="text-xs text-muted-foreground/70 block mb-1">Preview:</span>
        <span className="break-words">
          {parts.map((part, index) => {
            switch (part.type) {
              case 'bold':
                return <strong key={index} className="font-bold text-foreground">{part.content}</strong>;
              case 'italic':
                return <em key={index} className="italic">{part.content}</em>;
              case 'code':
                return (
                  <code key={index} className="px-1 py-0.5 bg-primary/10 text-primary rounded text-xs font-mono">
                    {part.content}
                  </code>
                );
              case 'link':
                return (
                  <a
                    key={index}
                    href={part.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:no-underline"
                  >
                    {part.content}
                  </a>
                );
              default:
                return <span key={index}>{part.content}</span>;
            }
          })}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook to detect if content has formattable elements
export function useHasFormattableContent(content: string): boolean {
  return useMemo(() => {
    if (!content) return false;
    
    const patterns = [
      /\*\*.+?\*\*/, // bold
      /\*.+?\*/, // italic
      /_.+?_/, // italic
      /`.+?`/, // code
      /https?:\/\/[^\s]+/, // link
      /:[a-z_]+:/, // emoji shortcode
      /:\)/, /:\(/, /:D/, /;\)/, /:P/, /<3/, // simple emojis
    ];

    return patterns.some(pattern => pattern.test(content));
  }, [content]);
}
