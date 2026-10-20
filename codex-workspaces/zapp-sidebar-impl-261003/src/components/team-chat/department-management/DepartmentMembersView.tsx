import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserPlus, UserMinus, Search, User } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useDepartmentProfiles, useAddDepartmentMember, useRemoveDepartmentMember } from '@/hooks/team-chat/useDepartmentManagement';

interface Props {
  departmentId: string;
  currentUserName: string;
  isAdmin: boolean;
}

export function DepartmentMembersView({ departmentId, currentUserName, isAdmin }: Props) {
  const [search, setSearch] = useState('');
  const { data: allProfiles = [], isLoading } = useDepartmentProfiles();
  const addMutation = useAddDepartmentMember(departmentId);
  const removeMutation = useRemoveDepartmentMember(departmentId);

  const members = allProfiles.filter(p => p.department_id === departmentId);
  const others = allProfiles.filter(p => p.department_id !== departmentId);

  const q = search.toLowerCase();
  const filteredMembers = members.filter(p =>
    p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
  );
  const filteredOthers = others.filter(p =>
    p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
  );

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar colaboradores..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Membros ({filteredMembers.length})
        </p>
        {filteredMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 px-1">Nenhum membro neste departamento</p>
        ) : (
          <div className="space-y-1">
            {filteredMembers.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2 px-1 rounded-md hover:bg-muted/40">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {p.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                </div>
                {isAdmin && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate({ profileId: p.id, profileName: p.name, actorName: currentUserName })}
                    aria-label={`Remover ${p.name} do departamento`}
                  >
                    <UserMinus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          <Separator />
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Outros Colaboradores ({filteredOthers.length})
            </p>
            {filteredOthers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-1">Nenhum colaborador disponível</p>
            ) : (
              <div className="space-y-1">
                {filteredOthers.map(p => (
                  <div key={p.id} className="flex items-center gap-3 py-2 px-1 rounded-md hover:bg-muted/40">
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={p.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        <User className="w-3 h-3" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        {p.department_id && (
                          <Badge variant="secondary" className="text-3xs shrink-0">Outro Depto</Badge>
                        )}
                      </div>
                      {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                      disabled={addMutation.isPending}
                      onClick={() => addMutation.mutate({ profileId: p.id, profileName: p.name, actorName: currentUserName })}
                      aria-label={`Adicionar ${p.name} ao departamento`}
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
