import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { SLAHistoryDashboard } from '@/components/sla/SLAHistoryDashboard';
import { SLAAlertHistoryPanel } from '@/components/sla/SLAAlertHistoryPanel';
import { SLAAlertPreferencesCard } from '@/components/sla/SLAAlertPreferencesCard';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';

/**
 * R2-PLAT-012 (#450): a Sidebar destas rotas precisa do contrato de navegação
 * compartilhado do Index (`/?view=<id>`, lido por `useNavigationHistory`). Antes o
 * item clicado só trocava um `useState` local: a seleção acendia e o corpo de SLA
 * continuava na tela, sem abrir o módulo escolhido. Sem estado local — quem indica
 * o módulo ativo é a rota em que o usuário está.
 */
const SLAHistory = () => {
  const navigate = useNavigate();

  const handleViewChange = useCallback((view: string) => {
    navigate(`/?view=${view}`);
  }, [navigate]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView="sla-history" onViewChange={handleViewChange} />
      <main className="flex-1 overflow-auto p-6 relative">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="relative z-10">
          <SLAHistoryDashboard />
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <SLAAlertHistoryPanel />
            <SLAAlertPreferencesCard />
          </div>
        </div>
      </main>
    </div>
  );
};

export default SLAHistory;
