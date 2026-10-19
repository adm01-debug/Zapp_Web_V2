import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Send, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/auth/useAuth';
import { contactNotesKey } from '@/hooks/crm/useContactNotes';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { MentionInput } from './MentionInput';
import { useMentionableProfileNames } from '@/hooks/inbox/useMentionableProfiles';

export function InternalNotesPanel({ contactId }: { contactId: string }) {
  const [newNote, setNewNote] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: mentionableNames } = useMentionableProfileNames();

  const { data: notes, isLoading, error, refetch } = useQuery({
    queryKey: ['internal-notes', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_notes')
        .select(`id, content, created_at, author:author_id (id, name, avatar_url)`)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('user_id', user?.id ?? '').single();
      if (!profile) throw new Error('Profile not found');
      const { error } = await supabase.from('contact_notes').insert({
        contact_id: contactId, content, author_id: profile.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal-notes', contactId] });
      // O painel grava `contact_notes` direto: sem invalidar as chaves dos
      // outros consumidores, a aba de notas do contato e a contagem das abas
      // ficam velhas até um refetch manual.
      queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId, user?.id) });
      queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
      setNewNote('');
      toast.success('Nota adicionada!');
    },
    onError: () => toast.error('Erro ao adicionar nota'),
  });

  const renderNoteContent = (content: string) => {
    // Com a lista de nomes disponível, reconhece nomes multi-palavra (@Ana Lima vira um único selo).
    if (mentionableNames && mentionableNames.length > 0) {
      const sorted = [...mentionableNames].sort((a, b) => b.length - a.length);
      const escaped = sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp(`(@(?:${escaped.join('|')})|@\\w+)`, 'g');
      const parts = content.split(regex).filter(Boolean);
      return parts.map((part, i) => {
        if (part.startsWith('@')) {
          return <Badge key={i} variant="secondary" className="text-xs mx-0.5">{part}</Badge>;
        }
        return <span key={i}>{part}</span>;
      });
    }
    // Fallback: quando a lista ainda não carregou, @palavra simples vira selo.
    const parts = content.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <Badge key={i} variant="secondary" className="text-xs mx-0.5">{part}</Badge>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="w-4 h-4" />
          Notas Internas
          <Badge variant="secondary" className="ml-auto">{notes?.length || 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 space-y-3">
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
              <p className="text-sm">Não foi possível carregar as notas</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : notes?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma nota ainda</p>
              <p className="text-xs">Use @ para mencionar colegas</p>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              <AnimatePresence>
                {notes?.map((note, index) => (
                  <motion.div key={note.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }} className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={note.author?.avatar_url ?? undefined} alt={note.author?.name || 'Autor'} />
                        <AvatarFallback className="text-xs">{note.author?.name?.substring(0, 2).toUpperCase() || 'NA'}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{note.author?.name || 'Anônimo'}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(note.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm">{renderNoteContent(note.content)}</p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
        <div className="pt-2 border-t">
          <MentionInput value={newNote} onChange={setNewNote}
            onSubmit={() => newNote.trim() && addNoteMutation.mutate(newNote)}
            placeholder="Adicionar nota... (@nome para mencionar)" disabled={addNoteMutation.isPending} />
        </div>
      </CardContent>
    </Card>
  );
}
