import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const MOCK_HOURS = [
  { day_of_week: 0, is_open: false, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 6, is_open: false, open_time: '09:00', close_time: '18:00' },
];

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));
vi.mock('@/hooks/business/useBusinessHours', () => ({
  useBusinessHours: () => ({
    businessHours: MOCK_HOURS,
    awayMessage: null,
    isLoading: false,
    isSaving: false,
    saveSettings: vi.fn(),
  }),
}));

import { BusinessHoursDialog } from '../BusinessHoursDialog';

const props = {
  open: true,
  onOpenChange: vi.fn(),
  connectionId: 'conn-1',
  connectionName: 'Principal',
};

describe('BusinessHoursDialog — aria-label nos interruptores', () => {
  it('cada switch de dia tem aria-label com o nome do dia', () => {
    render(<BusinessHoursDialog {...props} />);
    expect(screen.getByLabelText('Aberto Domingo')).toBeTruthy();
    expect(screen.getByLabelText('Aberto Segunda-feira')).toBeTruthy();
  });

  it('o switch da mensagem de ausência tem aria-label descritivo', () => {
    render(<BusinessHoursDialog {...props} />);
    expect(screen.getByLabelText('Ativar mensagem automática fora do horário')).toBeTruthy();
  });
});