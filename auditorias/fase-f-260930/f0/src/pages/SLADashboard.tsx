import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { SLADashboard as SLADashboardComponent } from '@/components/queues/SLADashboard';

const SLADashboardPage = () => {
  const [currentView, setCurrentView] = useState('sla');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-auto p-6">
        <SLADashboardComponent />
      </main>
    </div>
  );
};

export default SLADashboardPage;
