import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, User, Users, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCreateTeamConversation } from '@/hooks/chat/useTeamChat';
import { cn } from '@/lib/utils';

import { getLogger } from '@/lib/logger';
const log = getLogger('NewConversationDialog');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const createMutation = useCreateTeamConversation();

  const { data: teammates = [], isLoading } = useQuery({
    queryKey: ['team-profiles-for-chat'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, is_active')
        .neq('id', profile?.id || '')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!profile,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return teammates;
    const q = search.toLowerCase();
    return teammates.filter(t =>
      t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [teammates, search]);

  const toggleMember = (id: string) => {
    if (tab === 'direct') {
      setSelectedIds([id]);
    } else {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  };

  const handleCreate = async () => {
    if (selectedIds.length === 0) return;
    if (tab === 'group' && selectedIds.length < 2) {
      return; // Groups need at least 2 other members
    }
    try {
      const result = await createMutation.mutateAsync({
        type: tab,
        name: tab === 'group' ? groupName.trim() || undefined : undefined,
        memberIds: selectedIds,
      });
      setSelectedIds([]);
      setGroupName('');
      setSearch('');
      onCreated(result.id);
    } catch (err) { log.error('Unexpected error in NewConversationDialog:', err); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => { setTab(v as 'direct' | 'group'); setSelectedIds([]); }}>
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1 gap-1.5">
              <User className="w-3.5 h-3.5" /> Direto
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1 gap-1.5">
              <Users className="w-3.5 h-3.5" /> Grupo
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 space-y-3">
            {tab === 'group' && (
              <Input
                placeholder="Nome do grupo (ex: Marketing, Suporte...)"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                maxLength={60}
                aria-label="Nome do grupo"
                autoFocus
              />
            )}

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar colegas..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
                aria-label="Buscar colegas"
              />
            </div>

            <div className="max-h-60 overflow-auto space-y-0.5 border rounded-lg p-1" role="listbox" aria-label="Lista de colegas">
              {isLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Nenhum colega encontrado</div>
              ) : (
                filtered.map(t => {
                  const isSelected = selectedIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleMember(t.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-2.5 rounded-md transition-colors",
                        "hover:bg-accent/50",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={t.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-muted">{t.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                      </div>
                      {tab === 'group' ? (
                        <Checkbox checked={isSelected} className="shrink-0" />
                      ) : (
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0",
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                        )} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Tabs>

        <Button
          onClick={handleCreate}
          disabled={selectedIds.length === 0 || createMutation.isPending || (tab === 'group' && selectedIds.length < 2)}
          className="w-full mt-2 rounded-xl"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          {tab === 'direct' ? 'Iniciar Conversa' : `Criar Grupo (${selectedIds.length} membro${selectedIds.length !== 1 ? 's' : ''})`}
        </Button>
        {tab === 'group' && selectedIds.length > 0 && selectedIds.length < 2 && (
          <p className="text-xs text-muted-foreground text-center mt-1">Selecione pelo menos 2 membros para criar um grupo</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
