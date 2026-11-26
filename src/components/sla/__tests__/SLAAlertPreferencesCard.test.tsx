/**
 * Cartão de preferências de alerta de SLA.
 *
 * O hook é dublado; o que se prova é a tela: carregando ≠ erro ≠ formulário, o valor do servidor é o
 * que aparece, a chave geral desliga os filhos e cada interruptor grava o objeto completo (upsert da
 * própria linha), não um campo solto.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SlaAlertPreferences } from '@/hooks/sla/slaAlertPreferences';

const estado = {
  preferences: {
    enabled: true,
    alertFirstResponse: true,
    alertResolution: true,
    severityWarning: true,
    severityBreached: true,
  } as SlaAlertPreferences,
  isLoading: false,
  isError: false,
  isSaving: false,
  save: vi.fn(),
  refetch: vi.fn(),
};

vi.mock('@/hooks/sla/useSlaAlertPreferences', () => ({
  useSlaAlertPreferences: () => estado,
}));

import { SLAAlertPreferencesCard } from '../SLAAlertPreferencesCard';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  estado.preferences = {
    enabled: true,
    alertFirstResponse: true,
    alertResolution: true,
    severityWarning: true,
    severityBreached: true,
  };
  estado.isLoading = false;
  estado.isError = false;
  estado.isSaving = false;
  estado.save.mockClear();
  estado.refetch.mockClear();
});

describe.each([['claro', false], ['escuro', true]] as const)('SLAAlertPreferencesCard (%s)', (_tema, escuro) => {
  const montar = () => {
    if (escuro) document.documentElement.classList.add('dark');
    render(<SLAAlertPreferencesCard />);
  };

  it('CARREGANDO: esqueleto', () => {
    estado.isLoading = true;
    montar();
    expect(screen.getByTestId('sla-preferencias-carregando')).toBeInTheDocument();
  });

  it('ERRO: avisa que a leitura falhou e refaz', () => {
    estado.isError = true;
    montar();
    expect(screen.getByTestId('sla-preferencias-erro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(estado.refetch).toHaveBeenCalled();
  });

  it('FORMULÁRIO: parte do valor do servidor', () => {
    estado.preferences = { ...estado.preferences, severityWarning: false };
    montar();
    expect(screen.getByTestId('sla-pref-enabled')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('sla-pref-severityWarning')).toHaveAttribute('data-state', 'unchecked');
  });

  it('CHAVE GERAL desligada desabilita os filhos', () => {
    estado.preferences = { ...estado.preferences, enabled: false };
    montar();
    expect(screen.getByTestId('sla-pref-alertFirstResponse')).toBeDisabled();
    expect(screen.getByTestId('sla-pref-severityBreached')).toBeDisabled();
    expect(screen.getByTestId('sla-pref-enabled')).not.toBeDisabled();
  });

  it('ALTERAR grava o objeto completo (upsert da própria linha)', () => {
    montar();
    fireEvent.click(screen.getByTestId('sla-pref-alertFirstResponse'));
    expect(estado.save).toHaveBeenCalledWith({
      enabled: true,
      alertFirstResponse: false,
      alertResolution: true,
      severityWarning: true,
      severityBreached: true,
    });
  });

  it('SALVANDO: interruptores travados durante a gravação', () => {
    estado.isSaving = true;
    montar();
    expect(screen.getByTestId('sla-pref-enabled')).toBeDisabled();
  });
});
