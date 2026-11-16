/**
 * Achado da revisão da PR #3175: "Sobrescrever" na importação chamava
 * `createTemplate`, que faz INSERT. O template original ficava com o conteúdo
 * antigo — inclusive nas campanhas que o referenciam — e aparecia um segundo
 * registro com o mesmo nome (ou a importação falhava, se alguma restrição
 * impedisse a duplicata).
 *
 * Esta prova renderiza a tela real (só o hook de dados é mockado), importa um
 * JSON com um nome que já existe, escolhe Sobrescrever e confere que o caminho
 * é `updateTemplate` com o `id` e o `expectedUpdatedAt` do template existente —
 * e que `createTemplate` não é chamado.
 *
 * O caso irmão garante que nome NOVO continua indo por `createTemplate`: o
 * diálogo manda a ação 'overwrite' também para quem não é conflito
 * (`TalkXTemplateImportDialog.tsx:92`), então quem decide é achar o template.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const T_ANTIGO = '2026-09-01T09:05:00.000Z';

const mocks = vi.hoisted(() => ({
  criar: vi.fn(),
  atualizar: vi.fn(),
  templates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: mocks.criar },
    updateTemplate: { mutate: vi.fn(), mutateAsync: mocks.atualizar },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

function renderWithQc() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TalkXTemplates onUseTemplate={vi.fn()} />
    </QueryClientProvider>,
  );
}

const EXISTENTE = {
  id: 'tpl-oferta',
  name: 'Oferta',
  description: 'Descrição antiga',
  category: 'geral',
  content: 'Desconto de 10%',
  media_url: null,
  media_type: null,
  tags: [] as string[],
  status: 'approved',
  use_count: 3,
  created_by: null,
  custom_variables: [] as string[],
  current_version_id: null,
  created_at: T_ANTIGO,
  updated_at: T_ANTIGO,
};

/** Sobe um arquivo pelo `<input type="file">` do diálogo de importação. */
async function importar(json: string, conflito?: 'skip' | 'overwrite' | 'copy') {
  fireEvent.click(screen.getByRole('button', { name: /^Importar$/i }));
  const entrada = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(entrada).toBeTruthy();
  const arquivo = new File([json], 'templates.json', { type: 'application/json' });
  Object.defineProperty(entrada, 'files', { value: [arquivo], configurable: true });
  fireEvent.change(entrada);
  // A leitura do arquivo é assíncrona (FileReader).
  await vi.waitFor(() => expect(screen.getByRole('button', { name: /Importar \d+/i })).toBeTruthy());
  // O padrão do diálogo para nome repetido é "Pular todos"; a escolha é do usuário.
  if (conflito) {
    const seletor = document.querySelector('select') as HTMLSelectElement;
    expect(seletor).toBeTruthy();
    fireEvent.change(seletor, { target: { value: conflito } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Importar \d+/i }));
}

describe('X093 · importar com nome que já existe', () => {
  beforeEach(() => {
    mocks.criar.mockReset().mockResolvedValue(undefined);
    mocks.atualizar.mockReset().mockResolvedValue(undefined);
    mocks.templates = [EXISTENTE];
    localStorage.clear();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('Sobrescrever ATUALIZA o template existente, pelo id, e não insere outro', async () => {
    renderWithQc();
    await importar(JSON.stringify([{ name: 'Oferta', content: 'Desconto de 20%' }]), 'overwrite');

    await vi.waitFor(() => expect(mocks.atualizar).toHaveBeenCalledTimes(1));
    expect(mocks.criar).not.toHaveBeenCalled();
    const argumentos = mocks.atualizar.mock.calls[0][0] as Record<string, unknown>;
    expect(argumentos.id).toBe('tpl-oferta');
    expect(argumentos.expectedUpdatedAt).toBe(T_ANTIGO);
    expect(argumentos.name).toBe('Oferta');
    expect(argumentos.content).toBe('Desconto de 20%');
  });

  it('sobrescrever template SEM descrição manda null, não undefined', async () => {
    // `undefined` desaparece do corpo JSON e `p_description` e' obrigatorio na
    // RPC de snapshot: a atualizacao falhava e o template ficava com o conteudo
    // antigo. O teste trava o valor que vai no argumento.
    renderWithQc();
    await importar(JSON.stringify([{ name: 'Oferta', content: 'Desconto de 20%' }]), 'overwrite');

    await vi.waitFor(() => expect(mocks.atualizar).toHaveBeenCalledTimes(1));
    const argumentos = mocks.atualizar.mock.calls[0][0] as Record<string, unknown>;
    expect('description' in argumentos).toBe(true);
    expect(argumentos.description).toBeNull();
  });

  it('nome com espaço ao redor sobrescreve o existente, não duplica', async () => {
    // O parser detecta conflito com `name.trim()`; a busca precisa usar a MESMA
    // representacao, senao " Oferta " virava um segundo registro.
    renderWithQc();
    await importar(JSON.stringify([{ name: '  Oferta  ', content: 'Desconto de 30%' }]), 'overwrite');

    await vi.waitFor(() => expect(mocks.atualizar).toHaveBeenCalledTimes(1));
    expect(mocks.criar).not.toHaveBeenCalled();
    const argumentos = mocks.atualizar.mock.calls[0][0] as Record<string, unknown>;
    expect(argumentos.id).toBe('tpl-oferta');
    expect(argumentos.name).toBe('Oferta');
  });

  it('nome novo continua sendo criado, não atualizado', async () => {
    renderWithQc();
    await importar(JSON.stringify([{ name: 'Boas-vindas', content: 'Olá!' }]));

    await vi.waitFor(() => expect(mocks.criar).toHaveBeenCalledTimes(1));
    expect(mocks.atualizar).not.toHaveBeenCalled();
    const argumentos = mocks.criar.mock.calls[0][0] as Record<string, unknown>;
    expect(argumentos.name).toBe('Boas-vindas');
  });
});

/**
 * Rodada 4: o 🔴 que a minha correção da rodada 3 criou. O conjunto de nomes
 * existentes do diálogo guardava o nome CRU, o parser compara com `trim()`, e
 * a linha "sem conflito" recebe ação `overwrite` automaticamente — então
 * importar `Oferta` sobrescrevia ` Oferta ` em silêncio, com "Pular todos"
 * escolhido. Agora as duas pontas normalizam, o conflito aparece e a escolha
 * do usuário é respeitada.
 */
describe('X093 · nome existente com espaço ao redor', () => {
  beforeEach(() => {
    mocks.criar.mockReset().mockResolvedValue(undefined);
    mocks.atualizar.mockReset().mockResolvedValue(undefined);
    mocks.templates = [{ ...EXISTENTE, name: '  Oferta  ' }];
    localStorage.clear();
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('"Pular todos" (padrão) NÃO sobrescreve o template com espaços no nome', async () => {
    renderWithQc();
    await importar(JSON.stringify([{ name: 'Oferta', content: 'Preço novo' }]));

    // Dá tempo de qualquer gravação indevida acontecer antes de afirmar o negativo.
    await vi.waitFor(() => expect(screen.getByText(/pulad/i)).toBeTruthy());
    expect(mocks.atualizar).not.toHaveBeenCalled();
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it('escolhendo Sobrescrever, atualiza o existente pelo id', async () => {
    renderWithQc();
    await importar(JSON.stringify([{ name: 'Oferta', content: 'Preço novo' }]), 'overwrite');

    await vi.waitFor(() => expect(mocks.atualizar).toHaveBeenCalledTimes(1));
    expect(mocks.criar).not.toHaveBeenCalled();
    expect((mocks.atualizar.mock.calls[0][0] as Record<string, unknown>).id).toBe('tpl-oferta');
  });
});
