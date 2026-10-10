import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TalkXMessageEditorHandle } from '../TalkXMessageEditor';
import { TalkXMessageEditor } from '../TalkXMessageEditor';
import { TalkXLinksManager } from '../links/TalkXLinksManager';
import {
  buildTalkxLinkPlaceholder,
  buildTalkxLinkUrl,
  validateTalkxLinkLabel,
  validateTalkxLinkTargetUrl,
} from '@/hooks/integrations/useTalkXLinks';

/**
 * X118 (TL-072) — gerenciador de links rastreáveis no editor de mensagem.
 *
 * O que este teste trava (vermelho sem o gerenciador):
 *   - criar link chama a RPC `talkx_upsert_link` com campanha, rótulo, destino e UTM;
 *   - "Inserir na mensagem" põe `{{link:rotulo}}` NO CURSOR do editor único (não no fim);
 *   - rótulo fora da regra do banco bloqueia o salvar (nenhuma RPC sai);
 *   - quem não é admin/supervisor vê a lista e NÃO vê "Novo link";
 *   - excluir passa por confirmação e chama `talkx_delete_link`.
 *
 * O cliente do Supabase é mockado: nenhum teste fala com o banco (a guarda de
 * rede de `src/test/setup.ts` recusa o host real).
 */

const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const linkRows: Record<string, unknown>[] = [];
const clickCounts: Record<string, number> = {};

const DESTINO = 'https://exemplo.com/oferta';

function talkxLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    campaign_id: 'c1',
    label: 'promo',
    target_url: DESTINO,
    slug: 'abc123',
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    created_at: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://projeto.supabase.co',
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'talkx_upsert_link') {
        if (args.p_link_id) {
          const alvo = linkRows.find((row) => row.id === args.p_link_id);
          if (alvo) alvo.label = String(args.p_label);
        } else {
          linkRows.push(talkxLinkRow({ id: 'l-novo', label: String(args.p_label) }));
        }
      }
      if (name === 'talkx_delete_link') {
        const index = linkRows.findIndex((row) => row.id === args.p_link_id);
        if (index >= 0) linkRows.splice(index, 1);
      }
      return Promise.resolve({ data: { id: 'l1', slug: 'abc123', event: 'link_created' }, error: null });
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (_column: string, value: unknown) => {
          if (table === 'talkx_link_clicks') {
            return Promise.resolve({ data: null, count: clickCounts[String(value)] ?? 0, error: null });
          }
          return builder;
        },
        order: () => Promise.resolve({ data: table === 'talkx_links' ? [...linkRows] : [], error: null }),
      };
      return builder;
    },
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function fillNewLink({ label = 'promo', target = DESTINO }: { label?: string; target?: string } = {}) {
  fireEvent.click(screen.getByRole('button', { name: /Novo link/ }));
  fireEvent.change(screen.getByLabelText('Rótulo'), { target: { value: label } });
  fireEvent.change(screen.getByLabelText('Destino'), { target: { value: target } });
}

beforeEach(() => {
  rpcCalls.length = 0;
  linkRows.length = 0;
  for (const key of Object.keys(clickCounts)) delete clickCounts[key];
});

describe('TalkXLinksManager (X118)', () => {
  it('cria o link pela RPC talkx_upsert_link e recarrega a lista', async () => {
    renderWithQuery(
      <TalkXLinksManager campaignId="c1" campaignName="Black Friday" canEdit onInsertPlaceholder={() => {}} />,
    );

    await screen.findByText(/Nenhum link rastreável/);
    fillNewLink();
    fireEvent.click(screen.getByRole('button', { name: /Salvar link/ }));

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0].name).toBe('talkx_upsert_link');
    expect(rpcCalls[0].args).toMatchObject({
      p_campaign_id: 'c1',
      p_label: 'promo',
      p_target_url: DESTINO,
      // sugestão recolhida de UTM preenchida a partir do nome da campanha
      p_utm_source: 'whatsapp',
      p_utm_medium: 'talkx',
      p_utm_campaign: 'black-friday',
    });

    // A lista recarrega (invalidate) e o link novo aparece com o placeholder dele.
    expect(await screen.findByText('{{link:promo}}')).toBeInTheDocument();
  });

  it('insere {{link:rotulo}} na posição do cursor do editor', async () => {
    linkRows.push(talkxLinkRow());

    function Harness() {
      const [value, setValue] = React.useState('Ola');
      const editorRef = React.useRef<TalkXMessageEditorHandle>(null);
      return (
        <div>
          <TalkXMessageEditor ref={editorRef} value={value} onChange={setValue} placeholder="mensagem" />
          <TalkXLinksManager
            campaignId="c1"
            campaignName="Black Friday"
            canEdit
            onInsertPlaceholder={(placeholder) => editorRef.current?.insertAtCursor(placeholder)}
          />
        </div>
      );
    }

    renderWithQuery(<Harness />);

    const textarea = (await screen.findByPlaceholderText('mensagem')) as HTMLTextAreaElement;
    textarea.setSelectionRange(2, 2);
    fireEvent.click(await screen.findByRole('button', { name: 'Inserir link promo na mensagem' }));

    await waitFor(() => expect(textarea.value).toBe('Ol{{link:promo}}a'));
  });

  it('bloqueia o salvar quando o rótulo não segue a regra do banco', async () => {
    renderWithQuery(
      <TalkXLinksManager campaignId="c1" campaignName="Black Friday" canEdit onInsertPlaceholder={() => {}} />,
    );

    await screen.findByText(/Nenhum link rastreável/);
    fillNewLink({ label: 'Promoção!' });

    expect(screen.getByText(/letras minúsculas/i)).toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: /Salvar link/ });
    expect(salvar).toBeDisabled();

    fireEvent.click(salvar);
    expect(rpcCalls).toHaveLength(0);
  });

  it('mostra a lista, sem truncar a contagem de cliques, mas não o "Novo link" para quem não é admin/supervisor', async () => {
    linkRows.push(talkxLinkRow());
    clickCounts.l1 = 1005;

    renderWithQuery(
      <TalkXLinksManager campaignId="c1" campaignName="Black Friday" canEdit={false} />,
    );

    expect(await screen.findByText('{{link:promo}}')).toBeInTheDocument();
    expect(await screen.findByText(/1005 cliques/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo link/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar link promo/ })).toBeNull();
  });

  it('exclui o link pela RPC talkx_delete_link depois de confirmar', async () => {
    linkRows.push(talkxLinkRow());

    renderWithQuery(
      <TalkXLinksManager campaignId="c1" campaignName="Black Friday" canEdit onInsertPlaceholder={() => {}} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir link promo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(rpcCalls).toHaveLength(1));
    expect(rpcCalls[0].name).toBe('talkx_delete_link');
    expect(rpcCalls[0].args).toMatchObject({ p_link_id: 'l1' });
  });

  it('sem rascunho salvo não há onde pendurar o link', async () => {
    renderWithQuery(
      <TalkXLinksManager campaignId={null} campaignName="Black Friday" canEdit onInsertPlaceholder={() => {}} />,
    );

    expect(await screen.findByText(/Salve o rascunho da campanha/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo link/ })).toBeNull();
  });
});

describe('helpers do link rastreável (X118)', () => {
  it('valida rótulo e destino com a MESMA regra do banco', () => {
    expect(validateTalkxLinkLabel('promo')).toBeNull();
    expect(validateTalkxLinkLabel('Promo-1_x')).toBeNull();
    expect(validateTalkxLinkLabel('Promoção')).not.toBeNull();
    expect(validateTalkxLinkLabel('-comeca-com-hifen')).not.toBeNull();
    expect(validateTalkxLinkLabel('')).not.toBeNull();
    // Borda do CHECK: 40 caracteres entram, 41 não.
    expect(validateTalkxLinkLabel('a'.repeat(40))).toBeNull();
    expect(validateTalkxLinkLabel('a'.repeat(41))).not.toBeNull();

    expect(validateTalkxLinkTargetUrl('https://exemplo.com/oferta')).toBeNull();
    expect(validateTalkxLinkTargetUrl('http://exemplo.com')).not.toBeNull();
    expect(validateTalkxLinkTargetUrl('')).not.toBeNull();
  });

  it('monta a URL final e o placeholder com o rótulo normalizado', () => {
    expect(buildTalkxLinkUrl('abc123', 'https://projeto.supabase.co')).toBe(
      'https://projeto.supabase.co/functions/v1/talkx-link?s=abc123',
    );
    expect(buildTalkxLinkUrl('abc123', 'https://projeto.supabase.co/', 'rec-1')).toBe(
      'https://projeto.supabase.co/functions/v1/talkx-link?s=abc123&r=rec-1',
    );
    expect(buildTalkxLinkPlaceholder(' Promo ')).toBe('{{link:promo}}');
  });
});
