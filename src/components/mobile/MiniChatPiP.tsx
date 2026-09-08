import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Minimize2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MiniChatPiPProps {
  contactName: string;
  contactAvatar?: string;
  lastMessage?: string;
  isVisible: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onQuickReply?: (text: string) => void;
}

export function MiniChatPiP({
  contactName,
  contactAvatar,
  lastMessage,
  isVisible,
  onExpand,
  onDismiss,
  onQuickReply,
}: MiniChatPiPProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');

  const initials = contactName
    ? contactName
        .split(' ')
        .map(n => n[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase() || '??'
    : '??';

  const handleSendReply = useCallback(() => {
    if (replyText.trim() && onQuickReply) {
      onQuickReply(replyText.trim());
      setReplyText('');
      setIsExpanded(false);
    }
  }, [replyText, onQuickReply]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }, [handleSendReply]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 80, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag
          dragMomentum={false}
          dragElastic={0.1}
          dragConstraints={{ left: -100, right: 100, top: -200, bottom: 100 }}
          className={cn(
            'fixed bottom-20 right-3 z-50 rounded-2xl shadow-lg border border-border bg-card overflow-hidden',
            isExpanded ? 'w-72' : 'w-auto'
          )}
          style={{ touchAction: 'none' }}
        >
          {/* Header — always visible */}
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer bg-card hover:bg-muted/50 transition-colors"
            onClick={() => {
              if (!isExpanded) {
                onExpand();
              } else {
                setIsExpanded(false);
              }
            }}
          >
            <div className="relative">
              <Avatar className="w-8 h-8">
                <AvatarImage src={contactAvatar} alt="Avatar do contato" />
                <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[hsl(var(--success))] rounded-full border-2 border-card" />
            </div>

            {isExpanded ? (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{contactName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{lastMessage}</p>
              </div>
            ) : (
              <div className="flex-1 min-w-0 max-w-[140px]">
                <p className="text-xs font-medium text-foreground truncate">{contactName}</p>
              </div>
            )}

            <div className="flex items-center gap-1">
              {isExpanded && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                >
                  <Minimize2 className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Expanded: quick reply */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Last message preview */}
                {lastMessage && (
                  <div className="px-3 py-2 bg-muted/30 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{lastMessage}</p>
                  </div>
                )}

                {/* Quick reply input */}
                {onQuickReply && (
                  <div className="flex items-center gap-1.5 p-2 border-t border-border/50">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Resposta rápida..."
                      className="h-8 text-xs rounded-full bg-muted/50 border-0 focus-visible:ring-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSendReply();
                      }}
                      disabled={!replyText.trim()}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}

                {/* Open full chat */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpand();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-primary hover:bg-primary/5 transition-colors border-t border-border/50"
                >
                  <MessageSquare className="w-3 h-3" />
                  Abrir conversa completa
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collapsed: tap to expand inline */}
          {!isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="w-full px-3 py-1.5 text-[10px] text-primary hover:bg-primary/5 transition-colors border-t border-border/50"
            >
              Toque para responder
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
