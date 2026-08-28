import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Eye, Edit3 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/auth/useAuth';

interface Viewer {
  id: string;
  name: string;
  avatar_url: string | null;
  is_typing: boolean;
  last_seen: Date;
}

export function useConversationViewers(contactId: string) {
  const { user } = useAuth();
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    if (!user?.id || !contactId) return;

    const channel = supabase.channel(`conversation:${contactId}`, {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presentViewers: Viewer[] = [];
        Object.entries(state).forEach(([userId, presences]) => {
          if (userId !== user.id && Array.isArray(presences) && presences.length > 0) {
            const presence = presences[0] as Record<string, unknown>;
            presentViewers.push({
              id: userId,
              name: (presence.name as string) || 'Agente',
              avatar_url: (presence.avatar_url as string) || null,
              is_typing: (presence.is_typing as boolean) || false,
              last_seen: new Date(),
            });
          }
        });
        setViewers(presentViewers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, avatar_url')
            .eq('user_id', user.id)
            .maybeSingle();
          await channel.track({
            name: profile?.name || 'Agente',
            avatar_url: profile?.avatar_url || null,
            is_typing: false,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [contactId, user?.id]);

  return viewers;
}

export function ViewersIndicator({ contactId }: { contactId: string }) {
  const viewers = useConversationViewers(contactId);
  const [isOpen, setIsOpen] = useState(false);

  if (viewers.length === 0) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-8">
          <div className="flex -space-x-2">
            {viewers.slice(0, 3).map((viewer) => (
              <Avatar key={viewer.id} className="w-6 h-6 border-2 border-background">
                <AvatarImage src={viewer.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/20">
                  {viewer.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{viewers.length} visualizando</span>
          {viewers.some(v => v.is_typing) && (
            <Badge variant="secondary" className="text-xs animate-pulse">
              <Edit3 className="w-3 h-3 mr-1" />Digitando...
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-2">
            <Eye className="w-4 h-4" />Visualizando agora
          </h4>
          <div className="space-y-2">
            {viewers.map((viewer) => (
              <div key={viewer.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={viewer.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">{viewer.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{viewer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {viewer.is_typing ? (
                      <span className="flex items-center gap-1 text-primary"><Edit3 className="w-3 h-3" />Digitando...</span>
                    ) : `Visto ${format(viewer.last_seen, 'HH:mm', { locale: ptBR })}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
