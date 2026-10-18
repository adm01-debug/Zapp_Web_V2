import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { useUserRole } from '@/hooks/system/useUserRole';
import { QueuesView } from '@/components/queues/QueuesView';
import { SupervisorCopilot } from './SupervisorCopilot';
import { CrisisRoom } from './CrisisRoom';
import { PlaybooksManager } from './PlaybooksManager';
import { TrainingMode } from './TrainingMode';

type SupervisorTab = 'queue' | 'copilot' | 'crisis' | 'playbooks' | 'training';

/**
 * SupervisaoView — ferramentas do supervisor (supervisor e admin).
 *
 * Antes elas viviam como abas do `AdminView`, atras da visao `admin`
 * (ADMIN_ONLY): o supervisor nao alcancava Copiloto, Sala de Crise, Playbooks
 * nem Treinamento. Aqui a visao de navegacao `supervisao` (STAFF_ROLES) as
 * libera, e `admin` ficou com Usuarios e Auditoria.
 *
 * A Fila usa a visao de filas que o produto ja tem (`QueuesView`) — o mesmo
 * item `queues` do menu, sem rota nem entrada nova.
 */
export function SupervisaoView() {
  const { isSupervisor, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState<SupervisorTab>('queue');

  if (roleLoading) {
    return <div className="flex items-center justify-center h-full w-full"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent motion-safe:animate-spin" /></div>;
  }

  if (!isSupervisor) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-whatsapp" /> Supervisão
        </h1>
        <p className="text-muted-foreground">
          Fila de atendimento, copiloto, playbooks, treinamento e sala de crise
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SupervisorTab)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="queue">Filas</TabsTrigger>
          <TabsTrigger value="copilot">Copiloto IA</TabsTrigger>
          <TabsTrigger value="crisis">Sala de Crise</TabsTrigger>
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
          <TabsTrigger value="training">Treinamento</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <SectionErrorBoundary key="queue" sectionName="Filas">
            <QueuesView />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="copilot" className="mt-4">
          <SectionErrorBoundary key="copilot" sectionName="Copiloto">
            <SupervisorCopilot />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="crisis" className="mt-4">
          <SectionErrorBoundary key="crisis" sectionName="Sala de Crise">
            <CrisisRoom />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="playbooks" className="mt-4">
          <SectionErrorBoundary key="playbooks" sectionName="Playbooks">
            <PlaybooksManager />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          <SectionErrorBoundary key="training" sectionName="Modo Treinamento">
            <TrainingMode />
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
