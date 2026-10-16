import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const eq = vi.fn();
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const invoke = vi.fn();
  return { eq, update, from, invoke };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: h.invoke }, from: h.from },
}));

import {
  enrichSentMessageLinkPreview,
  extractFirstLink,
  LINK_PREVIEW_TIMEOUT_MS,
} from '../link-preview.service';

/**
 * PK-24 — prévia de link das mensagens ENVIADAS. O webhook já enriquece as
 * recebidas; o envio passou a enriquecer pelo mesmo caminho, depois do aceite.
 * Estas provas são do serviço de enriquecimento (a ligação dele ao envio real é
 * provada em `outbound-message.service.test.ts`).
 */
describe('prévia de link das mensagens enviadas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.eq.mockResolvedValue({ error: null });
    h.update.mockImplementation(() => ({ eq: h.eq }));
    h.from.mockImplementation(() => ({ update: h.update }));
  });

  it('grava a prévia do primeiro link, com teto de tempo no egresso', async () => {
    const preview = { url: 'https://exemplo.com/materia', title: 'Matéria' };
    h.invoke.mockResolvedValue({ data: { preview }, error: null });

    await enrichSentMessageLinkPreview('msg-1', 'olha isso https://exemplo.com/materia, vale a pena');

    expect(h.invoke).toHaveBeenCalledWith('fetch-link-preview', {
      body: { url: 'https://exemplo.com/materia' },
      signal: expect.any(AbortSignal),
    });
    expect(h.from).toHaveBeenCalledWith('messages');
    expect(h.update).toHaveBeenCalledWith({ link_preview: preview });
    expect(h.eq).toHaveBeenCalledWith('id', 'msg-1');
  });

  it('a URL perde a pontuação que colou nela no texto', async () => {
    expect(extractFirstLink('veja (https://exemplo.com/materia).')).toBe('https://exemplo.com/materia');
    expect(extractFirstLink('sem link aqui')).toBeNull();
  });

  it('texto sem link não chama o buscador nem grava nada', async () => {
    await enrichSentMessageLinkPreview('msg-2', 'bom dia, tudo certo?');

    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.from).not.toHaveBeenCalled();
  });

  it('resposta sem prévia (link inacessível) não grava nada e não lança', async () => {
    h.invoke.mockResolvedValue({ data: { preview: null }, error: null });

    await expect(enrichSentMessageLinkPreview('msg-3', 'https://exemplo.com/x')).resolves.toBeUndefined();
    expect(h.from).not.toHaveBeenCalled();
  });

  it('buscador indisponível não lança: a mensagem fica só sem prévia', async () => {
    h.invoke.mockRejectedValue(new Error('edge fora do ar'));

    await expect(enrichSentMessageLinkPreview('msg-4', 'https://exemplo.com/x')).resolves.toBeUndefined();
    expect(h.from).not.toHaveBeenCalled();
  });

  it('falha ao gravar não lança para quem chamou', async () => {
    h.invoke.mockResolvedValue({ data: { preview: { url: 'https://exemplo.com/x' } }, error: null });
    h.eq.mockRejectedValue(new Error('update recusado'));

    await expect(enrichSentMessageLinkPreview('msg-5', 'https://exemplo.com/x')).resolves.toBeUndefined();
  });

  it('a espera é cortada pelo teto de tempo', () => {
    expect(LINK_PREVIEW_TIMEOUT_MS).toBe(8_000);
  });
});
