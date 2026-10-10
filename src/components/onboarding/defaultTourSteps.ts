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

/**
 * O alvo do passo existe no DOM agora?
 *
 * Os alvos do tour são `[data-tour=...]`, atributos que só o `Sidebar` do desktop
 * produz (`SidebarNavItem`, sino de notificações e botão de tema). O casco do
 * celular monta `MobileShell` e não tem nenhum deles, então lá o tour não tem por
 * onde passar (SHELL-05).
 */
export function alvoDeTourNoDom(seletor: string): boolean {
  return typeof document !== 'undefined' && document.querySelector(seletor) !== null;
}

/**
 * Passos do tour cujo alvo existe no DOM agora (SHELL-05).
 *
 * Com a lista vazia não há o que mostrar: o overlay não abre e o `WelcomeModal`
 * esconde o botão "Iniciar Tour Guiado" — nunca um cartão de passo vazio.
 */
export function passosDoTourDisponiveis(
  steps: TourStep[] = DEFAULT_ONBOARDING_STEPS,
): TourStep[] {
  return steps.filter((passo) => alvoDeTourNoDom(passo.target));
}
