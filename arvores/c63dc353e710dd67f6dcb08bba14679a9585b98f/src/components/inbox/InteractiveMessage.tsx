import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Phone, MessageSquare, ChevronRight, List, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { InteractiveMessage as InteractiveMessageType, InteractiveButton, InteractiveListSection } from '@/types/chat';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InteractiveMessageProps {
  interactive: InteractiveMessageType;
  isSent: boolean;
  onButtonClick?: (button: InteractiveButton) => void;
  onListItemClick?: (sectionTitle: string, rowId: string, rowTitle: string) => void;
  disabled?: boolean;
}

export function InteractiveMessageDisplay({ 
  interactive, 
  isSent,
  onButtonClick,
  onListItemClick,
  disabled = false
}: InteractiveMessageProps) {
  const [listOpen, setListOpen] = useState(false);

  const handleButtonClick = (button: InteractiveButton) => {
    if (disabled) return;
    
    if (button.type === 'url' && button.url) {
      window.open(button.url, '_blank', 'noopener,noreferrer');
    } else if (button.type === 'phone' && button.phoneNumber) {
      window.open(`tel:${button.phoneNumber}`, '_self');
    } else if (button.type === 'reply') {
      onButtonClick?.(button);
    }
  };

  const handleListItemClick = (section: InteractiveListSection, rowId: string, rowTitle: string) => {
    if (disabled) return;
    onListItemClick?.(section.title, rowId, rowTitle);
    setListOpen(false);
  };

  const getButtonIcon = (button: InteractiveButton) => {
    switch (button.type) {
      case 'url':
        return <ExternalLink className="w-3.5 h-3.5" />;
      case 'phone':
        return <Phone className="w-3.5 h-3.5" />;
      case 'reply':
        return <MessageSquare className="w-3.5 h-3.5" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-2">
        {/* Header */}
        {interactive.header && (
          <div className="mb-2">
            {interactive.header.type === 'text' && (
              <p className={cn(
                "font-semibold text-sm",
                isSent ? "text-primary-foreground" : "text-foreground"
              )}>
                {interactive.header.text}
              </p>
            )}
            {interactive.header.type === 'image' && interactive.header.mediaUrl && (
              <img 
                src={interactive.header.mediaUrl} 
                alt="Header" 
                className="rounded-lg max-w-full h-auto mb-2"
              />
            )}
          </div>
        )}

        {/* Body */}
        <p className={cn(
          "text-sm whitespace-pre-wrap",
          isSent ? "text-primary-foreground" : "text-foreground"
        )}>
          {interactive.body}
        </p>

        {/* Footer */}
        {interactive.footer && (
          <p className={cn(
            "text-xs mt-1",
            isSent ? "text-primary-foreground/70" : "text-muted-foreground"
          )}>
            {interactive.footer}
          </p>
        )}

        {/* Buttons */}
        {interactive.type === 'buttons' && interactive.buttons && (
          <div className="flex flex-col gap-1.5 mt-3 pt-2 border-t border-current/10">
            {interactive.buttons.map((button, index) => (
              <motion.button
                key={button.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: disabled ? 1 : 1.02 }}
                whileTap={{ scale: disabled ? 1 : 0.98 }}
                onClick={() => handleButtonClick(button)}
                disabled={disabled}
                className={cn(
                  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  isSent 
                    ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground" 
                    : "bg-primary/10 hover:bg-primary/20 text-primary",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {getButtonIcon(button)}
                <span>{button.title}</span>
                {button.type === 'url' && <ChevronRight className="w-3 h-3 ml-auto" />}
              </motion.button>
            ))}
          </div>
        )}

        {/* List Button */}
        {interactive.type === 'list' && interactive.listButtonText && (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            whileTap={{ scale: disabled ? 1 : 0.98 }}
            onClick={() => !disabled && setListOpen(true)}
            disabled={disabled}
            className={cn(
              "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium mt-3 border transition-all",
              isSent 
                ? "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" 
                : "border-primary/30 text-primary hover:bg-primary/5",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <List className="w-4 h-4" />
            {interactive.listButtonText}
          </motion.button>
        )}
      </div>

      {/* List Dialog */}
      {interactive.type === 'list' && interactive.sections && (
        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-md p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-4 pb-2 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-base">
                <List className="w-5 h-5 text-primary" />
                {interactive.header?.text || 'Selecione uma opção'}
              </DialogTitle>
              {interactive.body && (
                <p className="text-sm text-muted-foreground mt-1">{interactive.body}</p>
              )}
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="p-2">
                {interactive.sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="mb-2 last:mb-0">
                    {/* Section Header */}
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.title}
                    </div>

                    {/* Section Items */}
                    <div className="space-y-1">
                      <AnimatePresence>
                        {section.rows.map((row, rowIndex) => (
                          <motion.button
                            key={row.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: rowIndex * 0.03 }}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handleListItemClick(section, row.id, row.title)}
                            className="w-full p-3 rounded-lg hover:bg-muted/80 transition-colors text-left group"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                                  {row.title}
                                </p>
                                {row.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                    {row.description}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-primary transition-colors" />
                            </div>
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {interactive.footer && (
              <div className="p-3 border-t border-border bg-muted/30">
                <p className="text-xs text-muted-foreground text-center">{interactive.footer}</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// List Item Response Badge (when user selects a list item)
interface ListResponseBadgeProps {
  sectionTitle: string;
  itemTitle: string;
  isSent: boolean;
}

export function ListResponseBadge({ sectionTitle, itemTitle, isSent }: ListResponseBadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs mb-1",
      isSent 
        ? "bg-primary-foreground/20 text-primary-foreground" 
        : "bg-primary/10 text-primary"
    )}>
      <Check className="w-3 h-3" />
      <span className="opacity-70">{sectionTitle}:</span>
      <span className="font-medium">{itemTitle}</span>
    </div>
  );
}

// Button Response Badge (when user clicks a button)
interface ButtonResponseBadgeProps {
  buttonTitle: string;
  isSent: boolean;
}

export function ButtonResponseBadge({ buttonTitle, isSent }: ButtonResponseBadgeProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs mb-1",
      isSent 
        ? "bg-primary-foreground/20 text-primary-foreground" 
        : "bg-primary/10 text-primary"
    )}>
      <MessageSquare className="w-3 h-3" />
      <span>Resposta: {buttonTitle}</span>
    </div>
  );
}
