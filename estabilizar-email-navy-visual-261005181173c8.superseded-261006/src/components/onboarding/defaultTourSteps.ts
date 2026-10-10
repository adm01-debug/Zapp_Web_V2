import type { TourStep } from './OnboardingTour';

export const DEFAULT_ONBOARDING_STEPS: TourStep[] = [
  {
    id: 'inbox',
    target: '[data-tour="inbox"]',
    title: 'Inbox de Conversas',
    description: 'Aqui você encontra todas as suas conversas em tempo real. Veja mensagens não lidas, responda clientes e gerencie seus atendimentos.',
    position: 'right',
  },
  {
    id: 'contacts',
    target: '[data-tour="contacts"]',
    title: 'Gestão de Contatos',
    description: 'Acesse sua base de contatos, adicione novas informações e visualize o histórico completo de cada cliente.',
    position: 'right',
  },
  {
    id: 'dashboard',
    target: '[data-tour="dashboard"]',
    title: 'Dashboard & Métricas',
    description: 'Acompanhe suas metas, visualize estatísticas de atendimento e monitore seu desempenho em tempo real.',
    position: 'right',
  },
  {
    id: 'queues',
    target: '[data-tour="queues"]',
    title: 'Filas de Atendimento',
    description: 'Organize seus atendimentos em filas por departamento ou prioridade para melhor distribuição.',
    position: 'right',
  },
  {
    id: 'notifications',
    target: '[data-tour="notifications"]',
    title: 'Central de Notificações',
    description: 'Receba alertas importantes sobre SLAs, metas alcançadas e atualizações do sistema.',
    position: 'right',
  },
  {
    id: 'theme',
    target: '[data-tour="theme"]',
    title: 'Personalização',
    description: 'Alterne entre tema claro e escuro conforme sua preferência. Sua experiência, suas regras!',
    position: 'right',
  },
];
