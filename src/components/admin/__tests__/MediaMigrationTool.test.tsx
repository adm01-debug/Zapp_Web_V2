import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

/**
 * Ferramenta de migração de mídia (Admin) — cartão t_420d83f3.
 *
 * A tela antiga: barra com `Progress value={30}` (percentual inventado), botão que disparava a
 * Edge sem confirmação, erro mostrado só como "Erro ao executar migração" e histórico só da
 * sessão do navegador. Aqui o teste renderiza o componente REAL e prova:
 *  1. contagem de pendentes pelo mesmo filtro da Edge (`head: true`, dois prefixos de CDN);
 *  2. falha de contagem vira aviso, nunca "0 mídias pendentes";
 *  3. clicar no botão dispara a Edge diretamente;
 *  4. barra indeterminada (sem `aria-valuenow`), porque o total só existe no fim;
 *  5. erro da Edge aparece com a mensagem e o código que a Edge mandou;
 *  6. histórico lido de `audit_logs` (persistente), com autor e contagens.
 */

const { invokeEdgeMock, fromMock } = vi.hoisted(() => ({
  invokeEdgeMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/lib/invokeEdge', () => ({ invokeEdge: invokeEdgeMock }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { MediaMigrationTool } from '@/components/admin/MediaMigrationTool';
import { toast } from 'sonner';

interface QueryLike {
  select: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
}

function makeQuery(result: unknown): QueryLike {
  const query = {} as QueryLike;
  const same = () => query;
  query.select = vi.fn(same);
  query.like = vi.fn(same);
  query.eq = vi.fn(same);
  query.order = vi.fn(same);
  query.limit = vi.fn(same);
  query.in = vi.fn(same);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

const messagesQueries: QueryLike[] = [];
const auditQueries: QueryLike[] = [];

function mockBackend(options: {
  messageCounts?: { count: number | null; error: unknown }[];
  logs?: unknown;
  profiles?: unknown;
} = {}) {
  messagesQueries.length = 0;
  auditQueries.length = 0;
  const counts = options.messageCounts ?? [{ count: 3, error: null }, { count: 0, error: null }];
  let call = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === 'messages') {
      const result = counts[Math.min(call, counts.length - 1)];
      call += 1;
      const query = makeQuery(result);
      messagesQueries.push(query);
      return query;
    }
    if (table === 'audit_logs') {
      const query = makeQuery(options.logs ?? { data: [], error: null });
      auditQueries.push(query);
      return query;
    }
    if (table === 'profiles') {
      return makeQuery(options.profiles ?? { data: [], error: null });
    }
    throw new Error(`Tabela não esperada no teste: ${table}`);
  });
}

const LOGS = {
  data: [
    {
      id: 'log-1',
      user_id: 'u1',
      created_at: '2026-10-14T13:05:00.000Z',
      details: { processed: 5, migrated: 4, failed: 1, ignored: 0 },
    },
    {
      id: 'log-2',
      user_id: null,
      created_at: '2026-10-13T09:00:00.000Z',
      details: { processed: 2, migrated: 2, failed: 0, ignored: 0 },
    },
  ],
  error: null,
};

const PROFILES = { data: [{ user_id: 'u1', name: 'Ana Souza' }], error: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaMigrationTool', () => {
  it('conta as mídias pendentes pelo mesmo filtro da Edge, sem trazer linhas', async () => {
    mockBackend();
    render(<MediaMigrationTool />);

    expect(await screen.findByText('3 mídias pendentes')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 mídias pendentes');

    expect(messagesQueries).toHaveLength(2);
    expect(messagesQueries[0].select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(messagesQueries[0].like).toHaveBeenCalledWith('media_url', 'https://mmg.whatsapp.net/%');
    expect(messagesQueries[1].like).toHaveBeenCalledWith('media_url', 'https://pps.whatsapp.net/%');
  });

  it('falha na contagem vira aviso — nunca mostra "0 mídias pendentes"', async () => {
    mockBackend({ messageCounts: [{ count: null, error: { message: 'permission denied' } }] });
    render(<MediaMigrationTool />);

    expect(
      await screen.findByText('Não foi possível contar as mídias pendentes'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0 mídias pendentes')).not.toBeInTheDocument();
  });

  it('clicar no botão dispara a Edge diretamente', async () => {
    mockBackend();
    invokeEdgeMock.mockResolvedValue({
      data: { success: true, processed: 2, migrated: 2, failed: 0 },
      error: null,
    });

    render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    await waitFor(() =>
      expect(invokeEdgeMock).toHaveBeenCalledWith('migrate-media-storage', { method: 'POST' }),
    );
  });

  it('botão fica desabilitado enquanto a migração roda', async () => {
    mockBackend();
    let liberar: (valor: unknown) => void = () => {};
    invokeEdgeMock.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );

    render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Iniciar Migração/ })).toBeDisabled(),
    );

    liberar({ data: { success: true, processed: 1, migrated: 1, failed: 0 }, error: null });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Iniciar Migração/ })).not.toBeDisabled(),
    );
  });

  it('enquanto roda mostra barra indeterminada, sem percentual', async () => {
    mockBackend();
    let liberar: (valor: unknown) => void = () => {};
    invokeEdgeMock.mockImplementation(
      () => new Promise((resolve) => { liberar = resolve; }),
    );

    render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    const barra = await screen.findByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).toHaveAttribute('aria-valuetext', 'Migrando mídias');
    expect(barra).not.toHaveAttribute('aria-valuenow');

    liberar({ data: { success: true, processed: 1, migrated: 1, failed: 0 }, error: null });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('1 mídias migradas com sucesso!'));
    expect(screen.queryByRole('progressbar', { name: 'Progresso da migração de mídia' })).not.toBeInTheDocument();
    expect(screen.getByText('Processados')).toBeInTheDocument();
  });

  it('erro da Edge aparece com a mensagem e o código que a Edge mandou', async () => {
    mockBackend();
    invokeEdgeMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Apenas administradores podem migrar mídia.',
        code: 'forbidden_admin',
        status: 403,
        fieldErrors: {},
      },
    });

    render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));

    expect(await screen.findByText('Apenas administradores podem migrar mídia.')).toBeInTheDocument();
    expect(screen.getByText('Código do erro: forbidden_admin')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Apenas administradores podem migrar mídia.');
    expect(screen.queryByText('Erro ao executar migração')).not.toBeInTheDocument();
  });

  it('histórico vem de audit_logs, com autor e contagens de cada execução', async () => {
    mockBackend({ logs: LOGS, profiles: PROFILES });
    render(<MediaMigrationTool />);

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('5 processados')).toBeInTheDocument();
    expect(screen.getByText('4 migrados')).toBeInTheDocument();
    expect(screen.getByText('1 falhas')).toBeInTheDocument();
    expect(screen.getByText('Sistema')).toBeInTheDocument();

    expect(auditQueries).toHaveLength(1);
    expect(auditQueries[0].eq).toHaveBeenCalledWith('action', 'media_migration');
    expect(auditQueries[0].order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(auditQueries[0].limit).toHaveBeenCalledWith(10);
  });

  it('sem execuções registradas, o histórico diz isso — não fica em branco', async () => {
    mockBackend();
    render(<MediaMigrationTool />);

    expect(await screen.findByText('Nenhuma migração registrada.')).toBeInTheDocument();
  });

  it('estados da tela passam no axe e geram a captura do DOM', async () => {
    mockBackend({ logs: LOGS, profiles: PROFILES });

    // Estado 1 — repouso: contagem de pendentes e histórico persistente.
    const repouso = render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');
    await screen.findByText('Ana Souza');
    expect(await axe(repouso.container)).toHaveNoViolations();
    const htmlRepouso = repouso.container.innerHTML;
    repouso.unmount();

    // Estado 2 — rodando: barra indeterminada, sem percentual inventado.
    mockBackend({ logs: LOGS, profiles: PROFILES });
    let liberar: (valor: unknown) => void = () => undefined;
    invokeEdgeMock.mockImplementation(
      () => new Promise(resolve => { liberar = resolve; }),
    );
    const rodando = render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));
    const barra = await screen.findByRole('progressbar', { name: 'Progresso da migração de mídia' });
    expect(barra).not.toHaveAttribute('aria-valuenow');
    const htmlRodando = rodando.container.innerHTML;
    rodando.unmount();
    liberar({ data: null, error: null });

    // Estado 3 — erro da Edge exibido com a causa que ela mandou.
    invokeEdgeMock.mockReset();
    mockBackend({ logs: LOGS, profiles: PROFILES });
    invokeEdgeMock.mockResolvedValue({
      data: null,
      error: { message: 'Apenas administradores podem migrar mídia.', code: 'forbidden_admin' },
    });
    const erro = render(<MediaMigrationTool />);
    await screen.findByText('3 mídias pendentes');
    fireEvent.click(screen.getByRole('button', { name: /Iniciar Migração/ }));
    await screen.findByText('Código do erro: forbidden_admin');
    const htmlErro = erro.container.innerHTML;
    erro.unmount();

    const caminho = '.tmp/captura/media-migration-estados.html';
    mkdirSync('.tmp/captura', { recursive: true });
    writeFileSync(
      caminho,
      [
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
        '<link rel="stylesheet" href="app.css">',
        '<title>Migração de mídia — captura dos estados</title></head>',
        '<body class="bg-background text-foreground p-6">',
        '<h1>Estado 1 — repouso (contagem de pendentes e histórico)</h1>',
        htmlRepouso,
        '<h1>Estado 2 — rodando (barra indeterminada, sem percentual)</h1>',
        htmlRodando,
        '<h1>Estado 3 — erro da Edge com a causa</h1>',
        htmlErro,
        '</body></html>',
      ].join('\n'),
      'utf8',
    );
    expect(existsSync(caminho)).toBe(true);
  });
});
