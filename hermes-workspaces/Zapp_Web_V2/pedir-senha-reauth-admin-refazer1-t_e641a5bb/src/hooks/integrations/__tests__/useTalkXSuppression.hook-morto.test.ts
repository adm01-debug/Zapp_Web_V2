/**
 * TL-002 · Talk X — o hook de lista `useTalkXSuppression` (o que a auditoria de
 * 2026-09-29 registrou como código morto) foi removido fisicamente do módulo
 * `src/hooks/integrations/useTalkXSuppression.ts`.
 *
 * Por que ele era morto: nenhum arquivo o importava — a tela
 * `src/components/talkx/TalkXSuppression.tsx` faz as próprias queries — e ele
 * removia com `DELETE` físico, contra a trilha append-only do módulo.
 *
 * O módulo NÃO foi apagado: ele segue no mesmo caminho com a leitura da
 * atividade da lista (X184/TL-169), que a tela importa. Por isso este guarda tem
 * dois lados — o hook morto não pode voltar (declaração ou import em qualquer
 * arquivo de código) e a API viva que a tela consome tem de continuar existindo,
 * porque foi o apagamento do módulo inteiro que quebrou o tipo (TS2307) de quem
 * o importa. Um item do guarda também exerce a leitura que ficou no arquivo
 * (`fetchTalkXSuppressionActivity`), para não valer só como declaração de
 * intenção.
 *
 * O identificador é montado por concatenação para que este arquivo não se
 * acuse sozinho na varredura.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// O cliente Supabase é a única dependência externa do módulo; o guarda lê os
// exports e exerce a leitura que ficou no arquivo, então dubla só essa fronteira
// (`from`), como os outros testes de hook da pasta.
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import * as modulo from '@/hooks/integrations/useTalkXSuppression';

const RAIZ = process.cwd();

/** Identificador do hook morto, montado sem o literal completo. */
const MORTO = 'useTalkX' + 'Suppression';
/** API viva do módulo, que a tela consome. */
const ATIVIDADE = MORTO + 'Activity';

/**
 * Só o que REINTRODUZ o hook morto interessa: a declaração exportada e o import
 * nomeado. Menção em comentário e o caminho do módulo num `from '...'` não
 * contam — o módulo continua no repositório por causa da API viva.
 */
const REINTRODUCAO = new RegExp(
  `export\\s+(?:function|const|let|var|type|interface)\\s+${MORTO}\\b` +
    `|import\\s*(?:type\\s*)?\\{[^}]*\\b${MORTO}\\b[^}]*\\}`,
);

const RAIZES = ['src'].map((p) => join(RAIZ, p));
const CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORAR = /(^|[/\\])(node_modules|dist|coverage|\.tmp|\.git)([/\\]|$)/;

function varrer(dir: string, achados: string[] = []): string[] {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return achados; // raiz ausente não invalida a varredura das outras
  }
  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name);
    if (IGNORAR.test(caminho)) continue;
    if (entrada.isDirectory()) varrer(caminho, achados);
    else if (CODIGO.test(entrada.name)) achados.push(caminho);
  }
  return achados;
}

const arquivos = RAIZES.flatMap((raiz) => varrer(raiz));
const conteudo = new Map(arquivos.map((f) => [f, readFileSync(f, 'utf8')]));
const exportsDoModulo = modulo as unknown as Record<string, unknown>;

const CAMINHO_MODULO = 'src/hooks/integrations/' + MORTO + '.ts';
const CONSUMIDOR = 'src/components/talkx/TalkXSuppression.tsx';

describe('Talk X · supressão — o hook morto saiu do módulo (TL-002)', () => {
  it('o módulo não exporta mais o hook de lista morto', () => {
    expect(MORTO in exportsDoModulo).toBe(false);
  });

  it('a tela continua servida: o módulo exporta a API de atividade (X184)', () => {
    expect(typeof exportsDoModulo[ATIVIDADE]).toBe('function');
    expect(typeof exportsDoModulo['fetchTalkX' + 'SuppressionActivity']).toBe('function');
    expect(Array.isArray(exportsDoModulo['SUPPRESSION_ACTIVITY_EVENT_TYPES'])).toBe(true);
  });

  it('a leitura da atividade continua consultando a trilha e devolvendo a página', async () => {
    const evento = (id: string, event_type: string, message: string | null) => ({
      id, event_type, message, entity_id: null, created_at: '2026-10-09T12:00:00Z', actor: { name: 'Ana' },
    });
    const construtor = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(async () => ({
        data: [evento('ev-2', 'suppression_remove', null), evento('ev-1', 'suppression_import', '12 contatos importados')],
        error: null,
        count: 7,
      })),
    };
    construtor.select.mockReturnValue(construtor);
    construtor.in.mockReturnValue(construtor);
    construtor.eq.mockReturnValue(construtor);
    construtor.order.mockReturnValue(construtor);
    mockFrom.mockReturnValue(construtor);

    const pagina = await modulo.fetchTalkXSuppressionActivity({ limit: 5, page: 0 });

    expect(mockFrom).toHaveBeenCalledWith('talkx_campaign_events');
    expect(construtor.select).toHaveBeenCalledWith(
      'id,event_type,message,created_at,entity_id,actor:actor_id(name)', { count: 'exact' },
    );
    expect(construtor.in).toHaveBeenCalledWith('event_type', modulo.SUPPRESSION_ACTIVITY_EVENT_TYPES);
    expect(construtor.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(construtor.range).toHaveBeenCalledWith(0, 4);
    expect(pagina.total).toBe(7);
    expect(pagina.items.map((item) => [item.id, item.action, item.title])).toEqual([
      ['ev-2', 'remove', 'Contato removido da lista'],
      ['ev-1', 'import', '12 contatos importados'],
    ]);
  });

  it('nenhum arquivo de código reintroduz o hook morto', () => {
    const infratores = [...conteudo.entries()]
      .filter(([, texto]) => REINTRODUCAO.test(texto))
      .map(([caminho]) => relative(RAIZ, caminho).replace(/\\/g, '/'));

    expect(infratores).toEqual([]);
  });

  it('a varredura enxerga a árvore e lê o consumidor (não passa por vacuidade)', () => {
    expect(arquivos.length).toBeGreaterThan(500);
    const moduloPath = join(RAIZ, CAMINHO_MODULO);
    const consumidorPath = join(RAIZ, CONSUMIDOR);
    expect(conteudo.has(moduloPath)).toBe(true);
    // O consumidor citado no cabeçalho é real e importa deste módulo.
    expect(conteudo.get(consumidorPath)).toContain(`'@/hooks/integrations/${MORTO}'`);
  });

  it('o detector reconhece a reintrodução e ignora o vizinho e o caminho', () => {
    expect(`export function ${MORTO}() {`).toMatch(REINTRODUCAO);
    expect(`import { ${MORTO}, type BlacklistEntry } from './useX';`).toMatch(REINTRODUCAO);
    expect(`export function ${ATIVIDADE}() {`).not.toMatch(REINTRODUCAO);
    expect(`} from '@/hooks/integrations/${MORTO}';`).not.toMatch(REINTRODUCAO);
  });
});
