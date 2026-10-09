/**
 * #438 (R2-MOD-077, P2) — "Histórico de transcrições oferece Todo período e busca sobre uma
 * única página implícita".
 *
 * `fetchTranscriptions` fazia UM único `select()` sem `range`: o PostgREST devolve apenas a
 * primeira página (teto do projeto = 1000 linhas). "Todo período", a busca (texto, nome,
 * telefone) e o agrupamento por contato eram aplicados só sobre esse recorte, sem próxima
 * página e sem qualquer sinal de truncamento — uma transcrição antiga simplesmente deixava
 * de existir para a tela.
 *
 * O mock reproduz o teto do PostgREST: SEM `.range()` devolve no máximo 1000 linhas; COM
 * `.range()` devolve a fatia pedida. O dataset tem 1200 transcrições e o `Contato Antigo`
 * (telefone 5511988887777, texto "assunto raro de arquivo") só aparece a partir do índice
 * 1000 — fora da primeira página.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => {
  const PAGE_CAP = 1000;
  const TOTAL = 1200;
  const ANTIGO_FROM = 1000;

  const rows = Array.from({ length: TOTAL }, (_, i) => {
    const antigo = i >= ANTIGO_FROM;
    const contact_id = antigo ? 'c-antigo' : 'c-recente';
    return {
      id: `m${String(i).padStart(5, '0')}`,
      content: '',
      transcription: antigo ? `assunto raro de arquivo — áudio ${i}` : `mensagem comum — áudio ${i}`,
      media_url: null,
      // mais recente primeiro (a tela ordena por created_at desc)
      created_at: new Date(Date.UTC(2026, 9, 6, 12, 0, 0) - i * 60_000).toISOString(),
      contact_id,
      contacts: {
        id: contact_id,
        name: antigo ? 'Contato Antigo' : 'Contato Recente',
        phone: antigo ? '5511988887777' : '5511900000000',
        avatar_url: null,
      },
    };
  });

  const state = { fail: false };

  function makeQuery() {
    let from: number | null = null;
    let to: number | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      not: () => q,
      order: () => q,
      range: (f: number, t: number) => { from = f; to = t; return q; },
      then: (resolve: (v: unknown) => unknown) => {
        if (state.fail) return Promise.resolve(resolve({ data: null, error: { message: 'timeout na consulta' } }));
        const data = from === null
          ? rows.slice(0, PAGE_CAP) // teto implícito do PostgREST quando não há `range`
          : rows.slice(from, (to ?? 0) + 1);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return q;
  }

  return { makeQuery, state, TOTAL };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => h.makeQuery() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));

import { TranscriptionsHistoryView } from '../TranscriptionsHistoryView';

describe('TranscriptionsHistoryView — Todo período e busca cobrem TODAS as páginas (#438)', () => {
  beforeEach(() => {
    h.state.fail = false;
  });

  it('alcança a transcrição que está fora da primeira página por texto, nome e telefone', async () => {
    render(<TranscriptionsHistoryView />);

    // Sem paginação o cabeçalho anuncia só a 1ª página: "1000 transcrições de 1 contatos".
    // (1200 / 2 contatos prova que as duas páginas foram lidas.)
    await waitFor(() =>
      expect(screen.getByText(`${h.TOTAL} transcrições de 2 contatos`)).toBeInTheDocument(),
    );

    const input = screen.getByPlaceholderText('Buscar em transcrições...');

    // Por nome do contato.
    fireEvent.change(input, { target: { value: 'antigo' } });
    await waitFor(() => expect(screen.getByText('Contato Antigo')).toBeInTheDocument());
    expect(screen.queryByText('Nenhum resultado encontrado')).not.toBeInTheDocument();

    // Por telefone do contato.
    fireEvent.change(input, { target: { value: '5511988887777' } });
    await waitFor(() => expect(screen.getByText('Contato Antigo')).toBeInTheDocument());

    // Por texto da transcrição.
    fireEvent.change(input, { target: { value: 'assunto raro de arquivo' } });
    await waitFor(() => expect(screen.getByText('200 transcrições')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Expandir todos'));
    await waitFor(() =>
      expect(screen.getByText(/assunto raro de arquivo — áudio 1199/)).toBeInTheDocument(),
    );
  });

  it('falha de consulta não é apresentada como ausência de transcrições', async () => {
    h.state.fail = true;
    render(<TranscriptionsHistoryView />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar as transcrições')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Nenhuma transcrição ainda')).not.toBeInTheDocument();
  });
});
