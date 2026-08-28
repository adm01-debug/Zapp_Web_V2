import { useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { AgentsEmptyState } from '@/components/ui/contextual-empty-states';
import { InviteAgentDialog } from '@/components/agents/InviteAgentDialog';
import { ConfigurePermissionsDialog } from '@/components/agents/ConfigurePermissionsDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAgents } from '@/hooks/crm/useAgents';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { motion, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Plus,
  MoreVertical,
  MessageSquare,
  Settings,
  UserX,
  Edit,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';

export function AgentsView() {
  const { agents, stats, isLoading, refetch } = useAgents();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(search.toLowerCase()) ||
    (agent.email?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const statsData = [
    { label: 'Online', value: stats.onlineCount, color: 'bg-status-online', icon: undefined as React.ElementType | undefined },
    { label: 'Ausente', value: stats.awayCount, color: 'bg-status-away', icon: undefined as React.ElementType | undefined },
    { label: 'Offline', value: stats.offlineCount, color: 'bg-status-offline', icon: undefined as React.ElementType | undefined },
    { label: 'Chats Ativos', value: stats.totalActiveChats, color: undefined as string | undefined, icon: MessageSquare as React.ElementType },
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis />
      <FloatingParticles />
      {/* Header with Breadcrumbs */}
      <PageHeader
        title="Atendentes"
        subtitle={`Gerencie sua equipe de atendimento (${stats.totalAgents} atendentes)`}
        breadcrumbs={[
          { label: 'Gestão' },
          { label: 'Atendentes' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} className="border-secondary/30">
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setInviteOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Atendente
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statsData.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="border border-secondary/20 bg-card hover:border-secondary/40 hover:-translate-y-0.5 transition-all duration-200 card-glow-purple">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {stat.color ? (
                    <div className="relative">
                      <div className={cn('w-3.5 h-3.5 rounded-full', stat.color)} />
                      <div className={cn('absolute inset-0 w-3.5 h-3.5 rounded-full animate-ping opacity-30', stat.color)} />
                    </div>
                  ) : stat.icon ? (
                    <stat.icon className="w-5 h-5 text-primary" />
                  ) : null}
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search and Filter */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-4"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar atendentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/20 border-border/30 focus:border-primary/50"
          />
        </div>
        <Button variant="outline" className="border-secondary/30 hover:border-secondary/50 hover:bg-secondary/10">
          <Filter className="w-4 h-4 mr-2" />
          Filtrar
        </Button>
      </motion.div>

      {/* Agents Grid */}
      {filteredAgents.length === 0 ? (
        <AgentsEmptyState
          onInviteAgent={() => setInviteOpen(true)}
          onConfigurePermissions={() => setPermissionsOpen(true)}
        />
      ) : (
        <StaggeredList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAgents.map((agent) => {
            const maxChats = agent.max_chats || 5;
            const capacityPercent = (agent.activeChats / maxChats) * 100;

            return (
              <StaggeredItem key={agent.id}>
                <Card className="cursor-pointer border border-secondary/20 bg-card hover:border-secondary/40 transition-all duration-200 hover:shadow-glow-secondary-sm hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className={cn(
                            "w-12 h-12 ring-2 transition-all duration-200",
                            agent.status === 'online' && 'ring-status-online/50',
                            agent.status === 'away' && 'ring-status-away/50',
                            agent.status === 'offline' && 'ring-border/30'
                          )}>
                            <AvatarImage src={agent.avatar_url || undefined} />
                            <AvatarFallback className={cn('font-semibold', getAvatarColor(agent.name).bg, getAvatarColor(agent.name).text)}>
                              {getInitials(agent.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              'absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card',
                              agent.status === 'online' && 'bg-status-online',
                              agent.status === 'away' && 'bg-status-away',
                              agent.status === 'offline' && 'bg-status-offline'
                            )}
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{agent.name}</h3>
                          <p className="text-sm text-muted-foreground capitalize">
                            {agent.role === 'admin' ? 'Administrador' : 
                             agent.role === 'supervisor' ? 'Supervisor' : 'Atendente'}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-muted/30">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-card border-border/30">
                          <DropdownMenuItem className="hover:bg-primary/10">
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="hover:bg-primary/10">
                            <Settings className="w-4 h-4 mr-2" />
                            Configurações
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive hover:bg-destructive/10">
                            <UserX className="w-4 h-4 mr-2" />
                            Desativar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Capacity */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Capacidade</span>
                        <span className="font-medium text-foreground">
                          {agent.activeChats}/{maxChats} chats
                        </span>
                      </div>
                      <Progress
                        value={capacityPercent}
                        aria-label={`Capacidade: ${capacityPercent}% — ${agent.activeChats} de ${maxChats} chats`}
                        className={cn(
                          'h-2',
                          capacityPercent <= 50 && '[&>div]:bg-success',
                          capacityPercent > 50 && capacityPercent <= 80 && '[&>div]:bg-warning',
                          capacityPercent > 80 && '[&>div]:bg-destructive'
                        )}
                      />
                    </div>

                    {/* Queues */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Filas</p>
                      <div className="flex flex-wrap gap-1">
                        {agent.queues.length > 0 ? (
                          agent.queues.map((queue) => (
                            <Badge
                              key={queue.id}
                              variant="outline"
                              className="text-xs font-medium"
                              style={{ 
                                borderColor: queue.color, 
                                color: queue.color,
                                backgroundColor: `${queue.color}15`
                              }}
                            >
                              {queue.name}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem filas atribuídas</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggeredItem>
            );
          })}
        </StaggeredList>
      )}

      {/* Dialogs */}
      <InviteAgentDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ConfigurePermissionsDialog open={permissionsOpen} onOpenChange={setPermissionsOpen} />
    </div>
  );
}
