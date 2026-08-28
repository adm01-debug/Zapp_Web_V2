import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, Edit, Trash2, Users, Clock, MessageSquare, UserMinus, Eye, Target } from 'lucide-react';
import type { QueueWithMembers } from '@/hooks/business/useQueues';

interface QueueCardProps {
  queue: QueueWithMembers;
  alertCount: number;
  onAddMember: (queue: QueueWithMembers) => void;
  onRemoveMember: (queueId: string, profileId: string) => void;
  onSetGoals: (queue: QueueWithMembers) => void;
  onDelete: (queue: QueueWithMembers) => void;
}

export function QueueCard({ queue, alertCount, onAddMember, onRemoveMember, onSetGoals, onDelete }: QueueCardProps) {
  const navigate = useNavigate();
  const activeMembers = queue.members.filter(m => m.is_active && m.profile?.is_active);

  return (
    <Card className="relative overflow-hidden border border-secondary/20 bg-card hover:border-secondary/40 transition-all hover:shadow-glow-secondary-sm">
      <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: queue.color }} />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${queue.color}15` }}>
              <MessageSquare className="w-5 h-5" style={{ color: queue.color }} />
            </div>
            <div>
              <CardTitle className="text-lg text-foreground">{queue.name}</CardTitle>
              {queue.description && <p className="text-sm text-muted-foreground">{queue.description}</p>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-muted/30"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border/30">
              <DropdownMenuItem className="hover:bg-primary/10" onClick={() => navigate(`/queue/${queue.id}`)}><Eye className="w-4 h-4 mr-2" />Ver Detalhes</DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-primary/10" onClick={() => onSetGoals(queue)}>
                <Target className="w-4 h-4 mr-2" />Metas e Alertas
                {alertCount > 0 && <Badge variant="destructive" className="ml-auto text-xs px-1.5">{alertCount}</Badge>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="hover:bg-primary/10"><Edit className="w-4 h-4 mr-2" />Editar</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive hover:bg-destructive/10" onClick={() => onDelete(queue)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/20 rounded-lg p-3 border border-border/20">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-4 h-4" /><span className="text-xs">Aguardando</span></div>
            <span className="text-xl font-bold text-foreground">{queue.waiting_count}</span>
          </div>
          <div className="bg-muted/20 rounded-lg p-3 border border-border/20">
            <div className="flex items-center gap-2 text-muted-foreground mb-1"><Users className="w-4 h-4" /><span className="text-xs">Atendentes</span></div>
            <span className="text-xl font-bold text-foreground">{activeMembers.length}</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Atendentes</p>
          <div className="flex items-center">
            {activeMembers.length > 0 ? (
              <>
                <div className="flex -space-x-2">
                  {activeMembers.slice(0, 4).map((member) => (
                    <div key={member.id} className="relative group">
                      <Avatar className="w-8 h-8 border-2 border-card ring-1 ring-border/30">
                        <AvatarImage src={member.profile?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">{member.profile?.name?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <button onClick={() => onRemoveMember(queue.id, member.profile_id)} className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <UserMinus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {activeMembers.length > 4 && <span className="ml-2 text-sm text-muted-foreground">+{activeMembers.length - 4} mais</span>}
              </>
            ) : <span className="text-sm text-muted-foreground">Nenhum atendente</span>}
            <Button variant="ghost" size="icon" className="ml-auto w-8 h-8 hover:bg-primary/10 hover:text-primary" onClick={() => onAddMember(queue)}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <span className="text-sm text-muted-foreground">Tempo máximo de espera</span>
          <Badge variant="secondary" className="bg-muted/30 text-foreground">{queue.max_wait_time_minutes} min</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
