import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, User, Users, Loader2, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { useCreateTeamConversation } from '@/hooks/chat/useTeamChat';
import { useActiveDepartments } from '@/hooks/team-chat/useActiveDepartments';
import { cn } from '@/lib/utils';
import { canCreateTeamConversation } from '@/lib/teamChatRules';

import { getLogger } from '@/lib/logger';
const log = getLogger('NewConversationDialog');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'direct' | 'group' | 'department'>('direct');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const createMutation = useCreateTeamConversation();

  const { data: teamProfiles = [], isLoading: loadingTeammates } = useTeamProfiles(
    open && !!profile && tab !== 'department'
  );
  const teammates = useMemo(
    () => teamProfiles
      .filter(t => t.id !== profile?.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [teamProfiles, profile?.id]
  );

  const { data: departments = [], isLoading: loadingDepts } = useActiveDepartments(
    open && !!profile && tab === 'department'
  );

  const filteredTeammates = useMemo(() => {
    if (!search.trim()) return teammates;
    const q = search.toLowerCase();
    return teammates.filter(t =>
      t.name?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q)
    );
  }, [teammates, search]);

  const filteredDepts = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase();
    return departments.filter(d => d.name?.toLowerCase().includes(q));
  }, [departments, search]);

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
    if (!canCreateTeamConversation({
      type: tab,
      selectedMemberCount: selectedIds.length,
      selectedDepartmentId: selectedDeptId,
    })) return;
    try {
      const dept = tab === 'department'
        ? departments.find(d => d.id === selectedDeptId)
        : undefined;
      const result = await createMutation.mutateAsync({
        type: tab,
        name: tab === 'group' ? (groupName.trim() || undefined)
          : tab === 'department' ? dept?.name
          : undefined,
        memberIds: tab !== 'department' ? selectedIds : undefined,
        departmentId: tab === 'department' ? (selectedDeptId ?? undefined) : undefined,
      });
      setSelectedIds([]);
      setSelectedDeptId(null);
      setGroupName('');
      setSearch('');
      onCreated(result.id);
    } catch (err) {
      log.error('Unexpected error in NewConversationDialog:', err);
    }
  };

  const isDisabled = createMutation.isPending || !canCreateTeamConversation({
    type: tab,
    selectedMemberCount: selectedIds.length,
    selectedDepartmentId: selectedDeptId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Conversa</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={v => {
            setTab(v as 'direct' | 'group' | 'department');
            setSelectedIds([]);
            setSelectedDeptId(null);
            setSearch('');
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="direct" className="flex-1 gap-1.5">
              <User className="w-3.5 h-3.5" /> Direto
            </TabsTrigger>
            <TabsTrigger value="group" className="flex-1 gap-1.5">
              <Users className="w-3.5 h-3.5" /> Grupo
            </TabsTrigger>
            <TabsTrigger value="department" className="flex-1 gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Depto
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
                placeholder={tab === 'department' ? 'Buscar departamentos...' : 'Buscar colegas...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
                aria-label={tab === 'department' ? 'Buscar departamentos' : 'Buscar colegas'}
              />
            </div>

            <div
              className="max-h-60 overflow-auto space-y-0.5 border rounded-lg p-1"
              role="listbox"
              aria-label={tab === 'department' ? 'Lista de departamentos' : 'Lista de colegas'}
            >
              {tab === 'department' ? (
                loadingDepts ? (
                  <div className="text-center py-4 text-muted-foreground text-sm"><Loader2 className="inline w-4 h-4 animate-spin mr-1" />Carregando...</div>
                ) : filteredDepts.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">Nenhum departamento encontrado</div>
                ) : (
                  filteredDepts.map(d => {
                    const isSelected = selectedDeptId === d.id;
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setSelectedDeptId(d.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2.5 rounded-md transition-colors',
                          'hover:bg-accent/50',
                          isSelected && 'bg-primary/10'
                        )}
                        aria-pressed={isSelected}
                        aria-label={d.name}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                        </div>
                        <div className={cn(
                          'w-4 h-4 rounded-full border-2 shrink-0',
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                        )} />
                      </button>
                    );
                  })
                )
              ) : loadingTeammates ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
              ) : filteredTeammates.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Nenhum colega encontrado</div>
              ) : (
                filteredTeammates.map(t => {
                  const isSelected = selectedIds.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleMember(t.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-2.5 rounded-md transition-colors',
                        'hover:bg-accent/50',
                        isSelected && 'bg-primary/10'
                      )}
                      aria-pressed={tab !== 'direct' ? isSelected : undefined}
                    >
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={t.avatar_url || undefined} alt={t.name || 'Membro'} />
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
                          'w-4 h-4 rounded-full border-2 shrink-0',
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'
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
          type="button"
          onClick={handleCreate}
          disabled={isDisabled}
          className="w-full mt-2 rounded-xl"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
          {tab === 'department'
            ? 'Criar Grupo do Departamento'
            : tab === 'direct'
            ? 'Iniciar Conversa'
            : `Criar Grupo (${selectedIds.length} membro${selectedIds.length !== 1 ? 's' : ''})`
          }
        </Button>
        {tab === 'group' && selectedIds.length > 0 && selectedIds.length < 2 && (
          <p className="text-xs text-muted-foreground text-center mt-1">
            Selecione pelo menos 2 membros para criar um grupo
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
