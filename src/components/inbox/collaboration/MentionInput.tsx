import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MentionInput({ value, onChange, onSubmit, placeholder, disabled }: MentionInputProps) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const { data: agents } = useQuery({
    queryKey: ['agents-for-mention'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, name, avatar_url').eq('is_active', true).limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    const lastAtIndex = newValue.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const afterAt = newValue.slice(lastAtIndex + 1);
      if (!afterAt.includes(' ')) {
        setMentionFilter(afterAt.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const handleSelectMention = (agent: { id: string; name: string }) => {
    const lastAtIndex = value.lastIndexOf('@');
    onChange(value.slice(0, lastAtIndex) + `@${agent.name} `);
    setShowMentions(false);
  };

  const filteredAgents = agents?.filter(a => a.name.toLowerCase().includes(mentionFilter)) || [];

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input value={value} onChange={handleInputChange} placeholder={placeholder} disabled={disabled}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !showMentions) { e.preventDefault(); onSubmit(); } }}
          className="flex-1" />
        <Button onClick={onSubmit} disabled={disabled || !value.trim()} size="icon">
          <Send className="w-4 h-4" />
        </Button>
      </div>
      <AnimatePresence>
        {showMentions && filteredAgents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute bottom-full left-0 right-0 mb-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
            <ScrollArea className="max-h-48">
              {filteredAgents.map((agent) => (
                <button key={agent.id} className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                  onClick={() => handleSelectMention(agent)}>
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={agent.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{agent.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{agent.name}</span>
                </button>
              ))}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
