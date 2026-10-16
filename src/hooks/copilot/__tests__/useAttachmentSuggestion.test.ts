/**
 * CV-067 — testes do hook useAttachmentSuggestion.
 *
 * Verifica:
 *  - Só sugere ativos que realmente existem no sistema
 *  - Detecta keywords corretas para cada tipo de anexo
 *  - Limita ao maxSuggestions
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAttachmentSuggestion } from '../useAttachmentSuggestion';
import type { AttachmentAsset } from '../useAttachmentSuggestion';

const AVAILABLE_ASSETS: AttachmentAsset[] = [
  { type: 'catalog', fileRef: 'catalog-2026.pdf', label: 'Catálogo 2026' },
  { type: 'price_table', fileRef: 'tabela-precos.xlsx', label: 'Tabela de preços' },
  { type: 'product_photo', fileRef: 'foto-caneta.jpg', label: 'Foto Caneta' },
  { type: 'mockup', fileRef: 'mockup-cliente.png', label: 'Mockup' },
];

describe('useAttachmentSuggestion', () => {
  it('não sugere nada se não há mensagem do cliente', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: '',
        availableAssets: AVAILABLE_ASSETS,
      }),
    );
    expect(result.current).toHaveLength(0);
  });

  it('sugere catálogo quando cliente menciona "produtos"', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: 'vocês têm catálogo de produtos?',
        availableAssets: AVAILABLE_ASSETS,
      }),
    );
    const types = result.current.map((s) => s.type);
    expect(types).toContain('catalog');
  });

  it('sugere tabela de preços quando cliente perguntar "quanto custa"', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: 'quanto custa o kit completo?',
        availableAssets: AVAILABLE_ASSETS,
      }),
    );
    const types = result.current.map((s) => s.type);
    expect(types).toContain('price_table');
  });

  it('sugere mockup quando cliente pede "como ficaria"', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: 'como ficaria com a nossa logo?',
        availableAssets: AVAILABLE_ASSETS,
      }),
    );
    const types = result.current.map((s) => s.type);
    expect(types).toContain('mockup');
  });

  it('não sugere tipo de ativo inexistente nos assets disponíveis', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: 'quero ver uma foto do produto',
        // Foto não está disponível
        availableAssets: [{ type: 'catalog', fileRef: 'cat.pdf' }],
      }),
    );
    const types = result.current.map((s) => s.type);
    expect(types).not.toContain('product_photo');
  });

  it('limita ao maxSuggestions', () => {
    const { result } = renderHook(() =>
      useAttachmentSuggestion({
        lastClientMessage: 'preciso do catálogo com tabela e foto e mockup de arte',
        availableAssets: AVAILABLE_ASSETS,
        maxSuggestions: 1,
      }),
    );
    expect(result.current.length).toBeLessThanOrEqual(1);
  });
});
