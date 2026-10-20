import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// R2-GOV-002 — o catálogo histórico (docs/COMPLETE_SYSTEM_FEATURES.md, 2026-03-15)
// marca 349 itens como concluídos, mas a tela ativa (SystemFeaturesView) exibe um
// selo literal "100% Implementado" e continua anunciando push e Service Worker.
// O estado mostrado tem de sair da configuração ATIVA do produto
// (src/config/service_worker.ts), que desliga as duas capacidades por decisão.
const flags = vi.hoisted(() => ({ serviceWorkerEnabled: false }));

vi.mock('@/config/service_worker', () => ({
  get SERVICE_WORKER_ENABLED() {
    return flags.serviceWorkerEnabled;
  },
  get PUSH_NOTIFICATIONS_ENABLED() {
    return flags.serviceWorkerEnabled;
  },
}));

import { SystemFeaturesView } from '@/components/docs/SystemFeaturesView';

function abrirCatalogo() {
  render(<SystemFeaturesView />);
  fireEvent.click(screen.getByRole('button', { name: /expandir tudo/i }));
}

describe('SystemFeaturesView — estado real do catálogo (R2-GOV-002)', () => {
  beforeEach(() => {
    flags.serviceWorkerEnabled = false;
  });

  it('com o Service Worker desligado no produto, marca os itens dependentes e não anuncia 100%', () => {
    abrirCatalogo();

    const marcados = screen.getAllByText(/^desativado$/i);
    expect(marcados.length).toBeGreaterThan(0);

    const selo = screen.getByTestId('catalog-status-badge');
    expect(selo).toHaveTextContent(`${marcados.length} desativada`);

    expect(screen.queryByText(/100% implementado/i)).toBeNull();
  });

  it('com o Service Worker ligado, os mesmos itens deixam de ser marcados como desativados', () => {
    flags.serviceWorkerEnabled = true;
    abrirCatalogo();

    expect(screen.queryAllByText(/^desativado$/i)).toHaveLength(0);
    expect(screen.getByTestId('catalog-status-badge')).not.toHaveTextContent(/desativada/i);
  });
});
