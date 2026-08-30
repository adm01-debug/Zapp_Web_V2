import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { EyeOff, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface WhisperModeProps {
  contactId: string;
  targetAgentId?: string;
  className?: string;
}

interface WhisperMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  is_read: boolean;
  created_at: string;
}

export function WhisperMode({ contactId, targetAgentId, className }: WhisperModeProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // STEP 12: useUserRole() é a fonte de verdade — profiles.role é cache sem garantia (F05)
  const { isSupervisor } = useUserRole();

  // Fetch whisper messages for this contact
  const { data: whispers = [] } = useQuery({
    queryKey: ['whispers', contactId],
    queryFn: async () => {
      const { data } = await supabase
        .from('whisper_messages')
        .select('id, content, sender_id, is_read, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (!data) return [];

      // Get sender names
      const senderIds = [...new Set(data.map(w => w.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', senderIds);

      const nameMap = new Map((profiles || []).map(p => [p.id, p.name]));
      
      return data.map(w => ({
        ...w,
        sender_name: nameMap.get(w.sender_id) || 'Supervisor',
      })) as WhisperMessage[];
    },
    refetchInterval: 10000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`whisper-${contactId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whisper_messages',
        filter: `contact_id=eq.${contactId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
        setIsExpanded(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId, queryClient]);

  // Mark as read when viewing
  useEffect(() => {
    if (isExpanded && whispers.some(w => !w.is_read)) {
      supabase
        .from('whisper_messages')
        .update({ is_read: true })
        .eq('contact_id', contactId)
        .eq('is_read', false)
        .then();
    }
  }, [isExpanded, whispers, contactId]);

  const unreadCount = whispers.filter(w => !w.is_read).length;

  const sendWhisper = async () => {
    if (!message.trim() || !profile?.id) return;

    const agentId = targetAgentId || '';
    if (!agentId) return;

    await supabase.from('whisper_messages').insert({
      contact_id: contactId,
      sender_id: profile.id,
      target_agent_id: agentId,
      content: message.trim(),
    });

    setMessage('');
    queryClient.invalidateQueries({ queryKey: ['whispers', contactId] });
  };

  if (!isSupervisor && whispers.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      {/* Whisper toggle button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <EyeOff className="w-3.5 h-3.5" />
        Sussurro
        {unreadCount > 0 && (
          <Badge variant="destructive" className="h-4 w-4 p-0 text-[10px] flex items-center justify-center">
            {unreadCount}
          </Badge>
        )}
      </Button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-card border border-dashed border-warning/50 rounded-lg shadow-lg overflow-hidden"
            style={{ minWidth: 300 }}
          >
            <div className="p-2 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <EyeOff className="w-3 h-3" />
                Modo Sussurro — Invisível ao cliente
              </div>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsExpanded(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            {/* Messages */}
            <div className="max-h-40 overflow-auto p-2 space-y-1.5">
              {whispers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum sussurro ainda</p>
              ) : (
                whispers.slice().reverse().map(w => (
                  <div key={w.id} className="text-xs p-1.5 rounded bg-muted/50">
                    <span className="font-medium text-warning">{w.sender_name}:</span>{' '}
                    <span className="text-foreground">{w.content}</span>
                  </div>
                ))
              )}
            </div>

            {/* Input (supervisor only) */}
            {isSupervisor && (
              <div className="p-2 border-t border-border/30 flex gap-1.5">
                <Input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Orientação para o agente..."
                  className="h-7 text-xs"
                  onKeyDown={e => e.key === 'Enter' && sendWhisper()}
                />
                <Button size="icon" className="h-7 w-7 shrink-0" onClick={sendWhisper} disabled={!message.trim()}>
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
