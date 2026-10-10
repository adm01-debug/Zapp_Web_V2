import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'vitest-axe';

expect.extend({ toHaveNoViolations });

vi.mock('@/components/ui/collapsible', () => {
  const CollapsiblePrimitive = require('@radix-ui/react-collapsible');
  const Collapsible = CollapsiblePrimitive.Root;
  const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
  const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;
  return { Collapsible, CollapsibleTrigger, CollapsibleContent };
});

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ 'aria-label': ariaLabel, value, className, ...props }: React.JSX.IntrinsicElements['div'] & { value?: number }) => (
    <div role="progressbar" aria-label={ariaLabel} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className={className} {...props} />
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.JSX.IntrinsicElements['button']) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.JSX.IntrinsicElements['span']) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
  AvatarFallback: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
  AvatarImage: ({ ...props }: React.JSX.IntrinsicElements['img']) => <img {...props} />,
}));

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock('@/components/ui/motion', () => ({
  motion: {
    div: ({ children, ...props }: React.JSX.IntrinsicElements['div']) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.JSX.IntrinsicElements['span']) => <span {...props}>{children}</span>,
  },
  StaggeredList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StaggeredItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/avatar-colors', () => ({
  getAvatarColor: () => ({ bg: '', text: '' }),
  getInitials: (name: string) => name.charAt(0),
}));

vi.mock('@/hooks/analytics/useDashboardWidgets', () => ({
  useDashboardWidgets: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/analytics/useDashboardData', () => ({
  useDashboardData: () => ({ stats: null, isLoading: false }),
}));

vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns');
  return {
    ...actual,
    formatDistanceToNow: () => 'há 5 min',
  };
});

vi.mock('date-fns/locale', () => ({
  ptBR: {},
}));

vi.mock('./GamificationEffects', () => ({
  AnimatedBadge: () => <span />,
  StatCardWithGamification: () => <div />,
}));

vi.mock('@/components/leaderboard/Leaderboard', () => ({
  Leaderboard: () => <div />,
}));

vi.mock('@/components/gamification/DemoAchievements', () => ({
  DemoAchievements: () => <div />,
}));

vi.mock('@/components/gamification/TrainingMiniGames', () => ({
  TrainingMiniGames: () => <div />,
}));

vi.mock('./AIStatsWidget', () => ({
  AIStatsWidget: () => <div />,
}));

vi.mock('./DashboardToolbar', () => ({
  DashboardToolbar: () => <div />,
}));

vi.mock('./DashboardSectionHeader', () => ({
  SectionHeader: ({ section, isOpen }: { section: { title: string; description: string; icon: React.ElementType }; isOpen: boolean }) => (
    <div data-testid="section-header">
      <span>{section.title}</span>
      <span>{isOpen ? 'aberto' : 'fechado'}</span>
    </div>
  ),
}));

import { EnhancedProgressiveDisclosure } from '../ProgressiveDisclosureDashboard';
import { DashboardWidgetRenderer } from '../DashboardWidgetRenderer';

describe('A11Y — N-050: gatilho de seção como botão e nome na barra de metas', () => {
  it('CollapsibleTrigger renderiza <button type=button> com aria-expanded', () => {
    const sections = [
      { id: 's1', title: 'Seção 1', description: 'desc', icon: () => null, widgets: [], defaultOpen: true },
    ];
    render(
      <EnhancedProgressiveDisclosure
        sections={sections}
        renderWidget={() => <div>widget</div>}
      />
    );

    const trigger = screen.getByRole('button', { name: /seção 1/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('progressbar do widget tem nome da meta (aria-label)', () => {
    const stats = {
      openConversations: 10,
      totalConversations: 20,
      avgResponseTime: 120,
      onlineAgents: 3,
      totalAgents: 5,
      resolvedToday: 8,
      pendingConversations: 2,
      queuesStats: [
        { id: 'q1', name: 'Suporte', color: '#22c55e', waitingCount: 5, onlineAgents: 2, totalAgents: 3 },
      ],
      recentActivity: [],
    };

    render(
      <DashboardWidgetRenderer
        widget={{ id: 'w1', type: 'queues' } as any}
        stats={stats}
      />
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-label', expect.stringContaining('Suporte'));
  });

  it('axe: aria-allowed-attr e aria-progressbar-name zerados', async () => {
    const sections = [
      { id: 's1', title: 'Seção 1', description: 'desc', icon: () => null, widgets: [], defaultOpen: true },
    ];
    const { container } = render(
      <EnhancedProgressiveDisclosure
        sections={sections}
        renderWidget={() => <div>widget</div>}
      />
    );

    const results = await axe(container);
    const relevant = results.violations.filter(
      v => v.id === 'aria-allowed-attr' || v.id === 'aria-progressbar-name'
    );
    expect(relevant).toHaveLength(0);
  });
});