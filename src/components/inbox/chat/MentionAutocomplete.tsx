import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface AgentMention {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

interface MentionAutocompleteProps {
  inputValue: string;
  cursorPosition: number;
  onSelect: (agent: AgentMention, startPos: number) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function MentionAutocomplete({ inputValue, cursorPosition, onSelect, onClose, isOpen }: MentionAutocompleteProps) {
  const [agents, setAgents] = useState<AgentMention[]>([]);
  const [filtered, setFiltered] = useState<AgentMention[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);

  // Fetch agents once
  useEffect(() => {
    const fetchAgents = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url')
        .limit(50);
      if (data) setAgents(data as AgentMention[]);
    };
    fetchAgents();
  }, []);

  // Detect @ mention
  useEffect(() => {
    if (!isOpen) return;
    
    const textBeforeCursor = inputValue.substring(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex === -1 || (atIndex > 0 && textBeforeCursor[atIndex - 1] !== ' ' && textBeforeCursor[atIndex - 1] !== '\n')) {
      onClose();
      return;
    }
    
    const query = textBeforeCursor.substring(atIndex + 1).toLowerCase();
    setMentionQuery(query);
    setMentionStart(atIndex);
    
    const results = agents.filter(a => 
      a.name.toLowerCase().includes(query) || 
      a.email.toLowerCase().includes(query)
    ).slice(0, 5);
    
    setFiltered(results);
    setSelectedIndex(0);
    
    if (results.length === 0 && query.length > 3) {
      onClose();
    }
  }, [inputValue, cursorPosition, isOpen, agents, onClose]);

  const handleSelect = useCallback((agent: AgentMention) => {
    onSelect(agent, mentionStart);
  }, [onSelect, mentionStart]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="absolute bottom-full left-0 mb-1 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
      >
        <div className="p-2 border-b border-border/50">
          <span className="text-xs text-muted-foreground">Mencionar agente</span>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.map((agent, i) => (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors text-sm",
                i === selectedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover"  loading="lazy" decoding="async"/>
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <span className="font-medium text-foreground block truncate">{agent.name}</span>
                <span className="text-xs text-muted-foreground truncate block">{agent.email}</span>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Hook to manage mention state in a textarea
 */
export function useMentions(inputRef: React.RefObject<HTMLTextAreaElement | null>) {
  const [isOpen, setIsOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);

  const checkForMention = useCallback((value: string, position: number) => {
    const textBefore = value.substring(0, position);
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex >= 0 && (atIndex === 0 || textBefore[atIndex - 1] === ' ' || textBefore[atIndex - 1] === '\n')) {
      setIsOpen(true);
      setCursorPos(position);
    } else {
      setIsOpen(false);
    }
  }, []);

  const handleSelect = useCallback((agent: { name: string }, startPos: number) => {
    const el = inputRef.current;
    if (!el) return;
    
    const before = el.value.substring(0, startPos);
    const after = el.value.substring(cursorPos);
    const newValue = `${before}@${agent.name} ${after}`;
    
    // Update via native setter for React compatibility
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, newValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      const newPos = startPos + agent.name.length + 2;
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }, 0);
    }
    
    setIsOpen(false);
  }, [inputRef, cursorPos]);

  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, cursorPos, checkForMention, handleSelect, close };
}
