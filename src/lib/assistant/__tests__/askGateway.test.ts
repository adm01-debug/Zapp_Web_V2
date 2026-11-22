import { describe, it, expect, vi } from 'vitest';
import { askGateway } from '@/lib/assistant/askGateway';

describe('askGateway', () => {
  it('normaliza a resposta com fontes e proveniência', async () => {
    const callApi = vi.fn().mockResolvedValue({
      status: 200,
      body: {
        answer: 'Agenda: ligar. resumo da conversa: quer 500 canecas.',
        capabilities: ['agenda', 'resumo_conversa'],
        sources: [
          { kind: 'perfil', origin: 'assistant_profiles', rows: 1 },
          { kind: 'agenda', origin: 'conversation_tasks', rows: 2 },
          { kind: 'conversa', origin: 'messages', rows: 6 },
        ],
        errors: [],
      },
    });

    const r = await askGateway({ query: '  como estou com o João?  ', contactId: 'c-1', callApi });

    expect(callApi).toHaveBeenCalledWith({ query: 'como estou com o João?', contactId: 'c-1' });
    expect(r.answer).toContain('500 canecas');
    expect(r.sources.map((s) => s.origin)).toEqual(['assistant_profiles', 'conversation_tasks', 'messages']);
    expect(r.errors).toEqual([]);
  });

  it('fonte com erro preserva o motivo (não vira vazio)', async () => {
    const callApi = vi.fn().mockResolvedValue({
      status: 200,
      body: {
        answer: 'ok',
        sources: [{ kind: 'conversa', origin: 'messages', rows: 0, error: 'permission denied' }],
      },
    });
    const r = await askGateway({ query: 'resuma', contactId: 'c-1', callApi });
    expect(r.sources[0].error).toBe('permission denied');
  });

  it('401 vira mensagem de sessão expirada', async () => {
    const callApi = vi.fn().mockResolvedValue({ status: 401, body: { error: 'Unauthorized' } });
    await expect(askGateway({ query: 'oi', contactId: null, callApi })).rejects.toThrow(/sess[ãa]o expirou/i);
  });

  it('503 vira aviso de assistente desligado', async () => {
    const callApi = vi.fn().mockResolvedValue({ status: 503, body: { code: 'AI_CAPABILITY_DISABLED' } });
    await expect(askGateway({ query: 'oi', contactId: null, callApi })).rejects.toThrow(/desligado/i);
  });

  it('erro do servidor usa a mensagem devolvida', async () => {
    const callApi = vi.fn().mockResolvedValue({ status: 500, body: { error: 'leitor de contexto' } });
    await expect(askGateway({ query: 'oi', contactId: null, callApi })).rejects.toThrow('leitor de contexto');
  });

  it('resposta sem answer cai no motivo do erro, não em branco', async () => {
    const callApi = vi.fn().mockResolvedValue({
      status: 200,
      body: { answer: '', errors: ['temperatura do lead: desligada'], sources: [] },
    });
    const r = await askGateway({ query: 'oi', contactId: null, callApi });
    expect(r.answer).toContain('desligada');
  });

  it('recusa pergunta vazia sem chamar a edge', async () => {
    const callApi = vi.fn();
    await expect(askGateway({ query: '   ', contactId: null, callApi })).rejects.toThrow(/Escreva/);
    expect(callApi).not.toHaveBeenCalled();
  });
});