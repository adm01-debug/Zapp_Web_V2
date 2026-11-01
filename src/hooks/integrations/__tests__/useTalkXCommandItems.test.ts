/**
 * X054 — useTalkXCommandItems: status e ação dos itens de campanha.
 *
 * O que esta prova cobre:
 * 1. status `sending` → descrição "Em andamento";
 * 2. ação do item grava `campaign=<id>` na URL (via replaceTalkXRoute).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock talkxRoute para capturar a chamada
const capturedRoutes: { campaignId?: string }[] = [];
vi.mock('@/components/talkx/talkxRoute', () => ({
  replaceTalkXRoute: (args: { campaignId?: string }) => {
    capturedRoutes.push(args);
  },
  replaceTalkXOpenRoute: vi.fn(),
  replaceTalkXTabRoute: vi.fn(),
}));

import { useTalkXCommandItems } from '../useTalkXCommandItems';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(['talkx-campaigns'], [
    {
      id: 'c-sending', name: 'Camp Em Andamento', status: 'sending',
      started_at: '2026-10-09T10:00:00.000Z',
    },
  ]);
  qc.setQueryData(['talkx-segments'], []);
  qc.setQueryData(['talkx-templates'], []);
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('X054 · useTalkXCommandItems', () => {
  beforeEach(() => {
    capturedRoutes.length = 0;
    // jsdom URL base
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: 'http://localhost/?view=talkx', search: '?view=talkx', pathname: '/' },
    });
    window.history.replaceState = vi.fn();
    window.dispatchEvent = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('status "sending" → descrição "Em andamento"', () => {
    const { result } = renderHook(() => useTalkXCommandItems(), { wrapper });
    const item = result.current.find((i) => i.id === 'talkx-campaign-c-sending');
    expect(item).toBeDefined();
    expect(item?.description).toBe('Em andamento');
  });

  it('ação do item grava campaignId na rota', () => {
    const { result } = renderHook(() => useTalkXCommandItems(), { wrapper });
    const item = result.current.find((i) => i.id === 'talkx-campaign-c-sending');
    expect(item?.action).toBeDefined();
    item!.action!();
    expect(capturedRoutes[0]?.campaignId).toBe('c-sending');
  });
});
