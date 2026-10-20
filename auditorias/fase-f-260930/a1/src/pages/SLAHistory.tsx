import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SLAHistoryDashboard } from '@/components/sla/SLAHistoryDashboard';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';

const SLAHistory = () => {
  const [currentView, setCurrentView] = useState('sla-history');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-auto p-6 relative">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="relative z-10">
          <SLAHistoryDashboard />
        </div>
      </main>
    </div>
  );
};

export default SLAHistory;
