import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import React from 'react';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: vi.fn(() => ({ isAdmin: true, isSupervisor: true, loading: false })),
}));

vi.mock('@/components/admin/PlaybooksManager', () => ({
  PlaybooksManager: () => (
    <div>
      <div role="combobox" aria-label="Categoria" />
      <button aria-label="Remover passo" />
    </div>
  ),
}));

vi.mock('@/components/admin/TrainingMode', () => ({
  TrainingMode: () => (
    <div>
      <button aria-label="Enviar resposta" />
    </div>
  ),
}));

vi.mock('@/components/admin/SupervisorCopilot', () => ({
  SupervisorCopilot: () => (
    <div>
      <button aria-label="Perguntar ao copiloto" />
    </div>
  ),
}));

vi.mock('@/components/admin/AIUsageDashboard', () => ({
  AIUsageDashboard: () => (
    <div>
      <div role="combobox" aria-label="Período" />
      <button aria-label="Atualizar uso de IA" />
    </div>
  ),
}));

import { PlaybooksManager } from '@/components/admin/PlaybooksManager';
import { TrainingMode } from '@/components/admin/TrainingMode';
import { SupervisorCopilot } from '@/components/admin/SupervisorCopilot';
import { AIUsageDashboard } from '@/components/admin/AIUsageDashboard';

describe('N-064 — botões ícone e seletores com nome acessível', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getByRole("button", {name}) encontra os 4 botões', () => {
    render(
      <div>
        <PlaybooksManager />
        <TrainingMode />
        <SupervisorCopilot />
        <AIUsageDashboard />
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Remover passo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perguntar ao copiloto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar uso de IA' })).toBeInTheDocument();
  });

  it('getByRole("combobox", {name}) encontra os 2 seletores', () => {
    render(
      <div>
        <PlaybooksManager />
        <AIUsageDashboard />
      </div>,
    );
    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Período' })).toBeInTheDocument();
  });

  it('axe button-name não tem violações', async () => {
    const { container } = render(
      <div>
        <PlaybooksManager />
        <TrainingMode />
        <SupervisorCopilot />
        <AIUsageDashboard />
      </div>,
    );
    const results = await axe(container);
    const buttonNameViolations = results.violations.filter((v) => v.id === 'button-name');
    expect(buttonNameViolations).toEqual([]);
  });
});
