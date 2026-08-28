import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Smile, Search, Clock, Heart, ThumbsUp, Laugh, X, Cat, UtensilsCrossed, Briefcase, Hash, PartyPopper, Plane, Flag, Users, Hand } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { emojiDatabase, searchEmojis, type EmojiEntry } from '@/data/emojiDatabase';

const categoryIcons: Record<string, React.ElementType> = {
  smileys: Smile,
  gestures: Hand,
  people: Users,
  hearts: Heart,
  animals: Cat,
  food: UtensilsCrossed,
  objects: Briefcase,
  symbols: Hash,
  celebration: PartyPopper,
  travel: Plane,
  flags: Flag,
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
  className?: string;
  recentEmojis?: string[];
  onRecentUpdate?: (emojis: string[]) => void;
}

const RECENT_KEY = 'emoji-recent';

export function EmojiPicker({
  onEmojiSelect,
  trigger,
  className,
  recentEmojis: externalRecent,
  onRecentUpdate,
}: EmojiPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategory, setActiveCategory] = React.useState('smileys');
  const [hoveredEmoji, setHoveredEmoji] = React.useState<string | null>(null);

  // Local recent emojis persisted to localStorage
  const [localRecent, setLocalRecent] = React.useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch { return []; }
  });

  const recentEmojis = externalRecent ?? localRecent;

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 16);

    if (onRecentUpdate) {
      onRecentUpdate(updated);
    } else {
      setLocalRecent(updated);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
    }

    setIsOpen(false);
  };

  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return null;
    return searchEmojis(searchQuery);
  }, [searchQuery]);

  const currentEntries = searchResults ?? emojiDatabase[activeCategory]?.emojis ?? [];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className={cn('h-9 w-9', className)}>
            <Smile className="h-5 w-5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0 bg-popover border-border" align="start" sideOffset={8}>
        <div className="flex flex-col h-[360px]">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar emoji... (ex: coração, feliz, pizza)"
                className="pl-8 h-8 text-xs bg-muted/50 border-border/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          {!searchQuery && (
            <div className="flex gap-0.5 px-1.5 py-1.5 border-b border-border/50 overflow-x-auto scrollbar-none">
              {/* Recent tab */}
              {recentEmojis.length > 0 && (
                <button
                  onClick={() => setActiveCategory('recent')}
                  className={cn(
                    'flex-shrink-0 p-1.5 rounded-md transition-colors',
                    activeCategory === 'recent'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  title="Recentes"
                >
                  <Clock className="h-4 w-4" />
                </button>
              )}
              {Object.entries(emojiDatabase).map(([key, category]) => {
                const Icon = categoryIcons[key] || Smile;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveCategory(key)}
                    className={cn(
                      'flex-shrink-0 p-1.5 rounded-md transition-colors',
                      activeCategory === key
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    title={category.label}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Emoji grid */}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {/* Recent section */}
              {!searchQuery && activeCategory === 'recent' && recentEmojis.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-0.5 uppercase tracking-wider">
                    Recentes
                  </h4>
                  <div className="grid grid-cols-8 gap-0.5">
                    {recentEmojis.map((emoji, idx) => (
                      <EmojiButton
                        key={`recent-${idx}`}
                        emoji={emoji}
                        onSelect={handleSelect}
                        onHover={() => setHoveredEmoji(emoji)}
                        onLeave={() => setHoveredEmoji(null)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Search results or category */}
              {activeCategory !== 'recent' || searchQuery ? (
                <div>
                  {!searchQuery && (
                    <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-0.5 uppercase tracking-wider">
                      {emojiDatabase[activeCategory]?.label || 'Resultados'}
                    </h4>
                  )}
                  {searchQuery && (
                    <h4 className="text-[10px] font-medium text-muted-foreground mb-1.5 px-0.5 uppercase tracking-wider">
                      {searchResults?.length || 0} resultados para "{searchQuery}"
                    </h4>
                  )}
                  <div className="grid grid-cols-8 gap-0.5">
                    {currentEntries.map((entry, idx) => (
                      <EmojiButton
                        key={idx}
                        emoji={typeof entry === 'string' ? entry : entry.emoji}
                        onSelect={handleSelect}
                        onHover={() => setHoveredEmoji(typeof entry === 'string' ? entry : entry.emoji)}
                        onLeave={() => setHoveredEmoji(null)}
                      />
                    ))}
                  </div>
                  {searchQuery && currentEntries.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Smile className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">Nenhum emoji encontrado</p>
                      <p className="text-xs mt-1">Tente buscar por "feliz", "coração" ou "comida"</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </ScrollArea>

          {/* Preview footer */}
          <AnimatePresence>
            {hoveredEmoji && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-border overflow-hidden"
              >
                <div className="flex items-center gap-3 px-3 py-1.5">
                  <span className="text-2xl">{hoveredEmoji}</span>
                  <span className="text-[10px] text-muted-foreground">Clique para adicionar</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Individual emoji button
interface EmojiButtonProps {
  emoji: string;
  onSelect: (emoji: string) => void;
  onHover: () => void;
  onLeave: () => void;
}

function EmojiButton({ emoji, onSelect, onHover, onLeave }: EmojiButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      onClick={() => onSelect(emoji)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="w-8 h-8 flex items-center justify-center rounded-md text-xl transition-colors hover:bg-muted"
    >
      {emoji}
    </motion.button>
  );
}

// Quick reaction picker (compact version for messages)
interface QuickReactionPickerProps {
  onReact: (emoji: string) => void;
  currentReaction?: string;
  className?: string;
}

export function QuickReactionPicker({
  onReact,
  currentReaction,
  className,
}: QuickReactionPickerProps) {
  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 10 }}
      className={cn(
        'flex items-center gap-1 p-1.5 rounded-full bg-popover border border-border shadow-lg',
        className
      )}
    >
      {quickEmojis.map((emoji) => (
        <motion.button
          key={emoji}
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onReact(emoji)}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full text-lg',
            'transition-colors hover:bg-muted',
            currentReaction === emoji && 'bg-primary/10 ring-2 ring-primary'
          )}
        >
          {emoji}
        </motion.button>
      ))}

      <EmojiPicker
        onEmojiSelect={onReact}
        trigger={
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted"
          >
            <Smile className="h-4 w-4 text-muted-foreground" />
          </motion.button>
        }
      />
    </motion.div>
  );
}

// Floating reaction animation
interface FloatingReactionProps {
  emoji: string;
  onComplete: () => void;
}

export function FloatingReaction({ emoji, onComplete }: FloatingReactionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.5, 1.5, 1.2, 1],
        y: -100,
      }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
      onAnimationComplete={onComplete}
      className="fixed pointer-events-none text-4xl z-50"
      style={{ left: '50%', bottom: '50%', transform: 'translateX(-50%)' }}
    >
      {emoji}
    </motion.div>
  );
}
