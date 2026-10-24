import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Users,
  Clock,
  MessageSquare,
  UserMinus,
  Eye,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueWithMembers } from '@/hooks/business/useQueues';

interface QueueCardProps {
  queue: QueueWithMembers;
  alertCount: number;
  onAddMember: (queue: QueueWithMembers) => void;
  onRemoveMember: (queueId: string, profileId: string) => void;
  onSetGoals: (queue: QueueWithMembers) => void;
  onEdit: (queue: QueueWithMembers) => void;
  onDelete: (queue: QueueWithMembers) => void;
}

export function QueueCard({
  queue,
  alertCount,
  onAddMember,
  onRemoveMember,
  onSetGoals,
  onEdit,
  onDelete,
}: QueueCardProps) {
  const navigate = useNavigate();
  const activeMembers = queue.members.filter((m) => m.is_active && m.profile?.is_active);

  return (
    <Card className="relative overflow-hidden border border-secondary/20 bg-card transition-all hover:border-secondary/40 hover:shadow-glow-secondary-sm">
      <div className="absolute left-0 right-0 top-0 h-1" style={{ backgroundColor: queue.color }} />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${queue.color}15` }}
            >
              <MessageSquare className="h-5 w-5" style={{ color: queue.color }} />
            </div>
            <div>
              <CardTitle className="text-lg text-foreground">{queue.name}</CardTitle>
              {queue.description && (
                <p className="text-sm text-muted-foreground">{queue.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-muted/30"
                aria-label={`Ações da fila ${queue.name}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border/30 bg-card">
              <DropdownMenuItem
                className="hover:bg-primary/10"
                onClick={() => navigate(`/queue/${queue.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver Detalhes
              </DropdownMenuItem>
              <DropdownMenuItem className="hover:bg-primary/10" onClick={() => onSetGoals(queue)}>
                <Target className="mr-2 h-4 w-4" />
                Metas e Alertas
                {alertCount > 0 && (
                  <Badge variant="destructive" className="ml-auto px-1.5 text-xs">
                    {alertCount}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="hover:bg-primary/10" onClick={() => onEdit(queue)}>
                <Edit className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(queue)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/20 bg-muted/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Aguardando</span>
            </div>
            <span className="text-xl font-bold text-foreground">{queue.waiting_count}</span>
          </div>
          <div className="rounded-lg border border-border/20 bg-muted/20 p-3">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs">Atendentes</span>
            </div>
            <span className="text-xl font-bold text-foreground">{activeMembers.length}</span>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Atendentes</p>
          <div className="flex items-center">
            {activeMembers.length > 0 ? (
              <>
                <div className="flex -space-x-2">
                  {activeMembers.slice(0, 4).map((member) => (
                    <div key={member.id} className="group relative">
                      <Avatar className="h-8 w-8 border-2 border-card ring-1 ring-border/30">
                        <AvatarImage
                          src={member.profile?.avatar_url || undefined}
                          alt={member.profile?.name || 'Membro'}
                        />
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {member.profile?.name?.[0] || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <button
                        aria-label={`Remover ${member.profile?.name || 'atendente'} da fila`}
                        onClick={() => onRemoveMember(queue.id, member.profile_id)}
                        className={cn(
                          'pointer-events-none absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity',
                          // N-180.6: sem ponteiro com hover (celular/tablet) `group-hover` nunca
                          // dispara — fica visível e alcançável por toque e por foco também.
                          '[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100',
                          'group-hover:pointer-events-auto group-hover:opacity-100',
                          'focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          // Área de toque ampliada (44px) sem mudar o tamanho visível (16px):
                          // largura 24px (after:w-6) — o avatar vizinho fica a 24px de passo
                          // (w-8 = 32px sobreposto em 8px pelo -space-x-2 do container); maior
                          // que isso cobriria o botão do vizinho e removeria o atendente errado.
                          "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:left-1/2 [@media(pointer:coarse)]:after:top-1/2 [@media(pointer:coarse)]:after:h-11 [@media(pointer:coarse)]:after:w-6 [@media(pointer:coarse)]:after:-translate-x-1/2 [@media(pointer:coarse)]:after:-translate-y-1/2 [@media(pointer:coarse)]:after:content-['']"
                        )}
                      >
                        <UserMinus className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {activeMembers.length > 4 && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    +{activeMembers.length - 4} mais
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Nenhum atendente</span>
            )}
            <Button
              aria-label={`Adicionar atendente à fila ${queue.name}`}
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 hover:bg-primary/10 hover:text-primary"
              onClick={() => onAddMember(queue)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border/20 pt-2">
          <span className="text-sm text-muted-foreground">Tempo máximo de espera</span>
          <Badge variant="secondary" className="bg-muted/30 text-foreground">
            {queue.max_wait_time_minutes} min
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
