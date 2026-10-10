import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { SettingsTabContent } from '../InstanceSettingsTabContent';

const settingsItems = [
  { key: 'rejectCall', label: 'Rejeitar chamadas', desc: 'Bloqueia chamadas recebidas' },
  { key: 'showReadReceipts', label: 'Confirmação de leitura', desc: 'Mostra quando a mensagem foi lida' },
] as const;

const settingsData = { rejectCall: true, showReadReceipts: false };

describe('InstanceSettingsTabContent — aria-label no interruptor de configuração', () => {
  it('cada switch de configuração tem aria-label com o label do item', () => {
    render(
      <SettingsTabContent
        settingsData={settingsData}
        settingsItems={settingsItems}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isLoading={false}
      />,
    );
    expect(screen.getByRole('switch', { name: 'Rejeitar chamadas' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Confirmação de leitura' })).toBeTruthy();
  });

  it('axe não acusa interruptor sem nome (aria-toggle-field-name)', async () => {
    const { container } = render(
      <SettingsTabContent
        settingsData={settingsData}
        settingsItems={settingsItems}
        onChange={vi.fn()}
        onSave={vi.fn()}
        isLoading={false}
      />,
    );
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});