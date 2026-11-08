import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// R2-INF-007 (item 97) — "E2E de mensagens envia para o primeiro contato sem validar a fixture".
//
// O spec abria `locator('[data-testid="conversation-item"]').first()` e digitava + Enter: com
// qualquer conversa alheia no topo da lista, o enqueue real ia para um contato nao escolhido
// para QA. Aqui nada e duplicado nem reescrito:
//   (a) a regra de escolha roda o modulo REAL (e2e/fixtures/fixture-conversation.ts) em
//       processo bun — o vitest so coleta/transforma src/**;
//   (b) o harness roda o PROPRIO e2e/messaging.spec.ts, trocando apenas o framework
//       @playwright/test por um duplo que registra o que o spec clicou, digitou e teclou.
const MODULO = resolve(process.cwd(), 'e2e/fixtures/fixture-conversation.ts');
const SPEC = resolve(process.cwd(), 'e2e/messaging.spec.ts');
const HARNESS = resolve(process.cwd(), 'src/lib/__tests__/helpers/messaging-spec-harness.mjs');
const FIXTURE_DISPLAY_NAME = '[E2E]';

type ConversaRenderizada = string | { nome: string; avatar?: string | null; preview?: string; nomePresente?: boolean };

interface Escolha {
  index?: number;
  erro?: string;
  tipo?: string;
  codigo?: string;
}

/** Chama `pickFixtureConversationIndex` do modulo real, em processo bun limpo. */
function escolher(nome: string, nomes: string[]): Escolha {
  const script = `
    const m = await import(${JSON.stringify(MODULO)});
    try {
      const index = m.pickFixtureConversationIndex(${JSON.stringify(nomes)}, ${JSON.stringify(nome)});
      console.log(JSON.stringify({ index }));
    } catch (e) {
      console.log(JSON.stringify({ erro: e.message, tipo: e.name, codigo: e.code }));
    }
  `;
  const proc = spawnSync('bun', ['-e', script], { encoding: 'utf8', cwd: process.cwd() });
  if (proc.status !== 0) {
    throw new Error(`processo filho falhou: ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout.trim()) as Escolha;
}

interface Execucao {
  cliques: string[];
  cliqueAntesDeDigitar: string[] | null;
  digitado: string | null;
  teclas: string[];
  erro: { tipo: string; mensagem: string; codigo: string | null } | null;
}

/** Executa o spec real (e2e/messaging.spec.ts) com o duplo de @playwright/test. */
function executarSpec(nomes: ConversaRenderizada[], { acelerarRelogio = false } = {}): Execucao {
  const args = [HARNESS, SPEC, JSON.stringify(nomes)];
  if (acelerarRelogio) args.push('--acelerar');
  const proc = spawnSync('bun', args, { encoding: 'utf8', cwd: process.cwd() });
  if (proc.status !== 0) {
    throw new Error(`harness falhou: ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout.trim()) as Execucao;
}

describe('e2e/messaging.spec.ts — o spec real (R2-INF-007)', () => {
  it('com conversa alheia em PRIMEIRO lugar envia para a fixture e nunca para ela', () => {
    const r = executarSpec(['Maria Souza', FIXTURE_DISPLAY_NAME, 'Joao da Silva']);

    expect(r.erro).toBeNull();
    expect(r.cliques).toEqual([FIXTURE_DISPLAY_NAME]);
    expect(r.cliques).not.toContain('Maria Souza');
    expect(r.cliqueAntesDeDigitar).toEqual([FIXTURE_DISPLAY_NAME]);
    expect(r.digitado).toMatch(/^Mensagem de teste E2E \d+$/);
    expect(r.teclas).toEqual(['Enter']);
  });

  it('com a fixture no topo segue enviando (caminho feliz preservado)', () => {
    const r = executarSpec([FIXTURE_DISPLAY_NAME, 'Maria Souza']);

    expect(r.erro).toBeNull();
    expect(r.cliques).toEqual([FIXTURE_DISPLAY_NAME]);
    expect(r.teclas).toEqual(['Enter']);
  });

  it('sem a fixture visivel aborta sem clicar, digitar ou enviar', () => {
    const r = executarSpec(['Maria Souza', 'Joao da Silva'], { acelerarRelogio: true });

    expect(r.erro?.tipo).toBe('FixtureConversationError');
    expect(r.erro?.codigo).toBe('not-visible');
    expect(r.cliques).toEqual([]);
    expect(r.digitado).toBeNull();
    expect(r.teclas).toEqual([]);
  });
});

describe('e2e/fixtures/fixture-conversation.ts — regra de escolha (R2-INF-007)', () => {
  it('com conversa alheia em PRIMEIRO lugar escolhe a fixture, nunca o indice 0', () => {
    const nomes = ['Maria Souza', FIXTURE_DISPLAY_NAME, 'Joao da Silva'];
    // A regra antiga (indice 0 fixo) apontaria para "Maria Souza", um contato real.
    expect(nomes[0]).not.toBe(FIXTURE_DISPLAY_NAME);
    expect(escolher(FIXTURE_DISPLAY_NAME, nomes).index).toBe(1);
  });

  it('com a fixture no topo mantem o caminho feliz', () => {
    expect(escolher(FIXTURE_DISPLAY_NAME, [FIXTURE_DISPLAY_NAME, 'Maria Souza']).index).toBe(0);
  });

  it('aborta quando o contato fixture nao esta visivel', () => {
    const r = escolher(FIXTURE_DISPLAY_NAME, ['Maria Souza', 'Joao da Silva']);
    expect(r.index).toBeUndefined();
    expect(r.tipo).toBe('FixtureConversationError');
    expect(r.codigo).toBe('not-visible');
    expect(r.erro).toContain('nao esta visivel');
  });

  it('aborta quando mais de um item casa (ambiguidade)', () => {
    const r = escolher(FIXTURE_DISPLAY_NAME, [FIXTURE_DISPLAY_NAME, 'Maria Souza', FIXTURE_DISPLAY_NAME]);
    expect(r.index).toBeUndefined();
    expect(r.tipo).toBe('FixtureConversationError');
    expect(r.codigo).toBe('ambiguous');
    expect(r.erro).toContain('ambiguo');
  });

  it('normaliza espaco e caixa do nome renderizado', () => {
    expect(escolher(FIXTURE_DISPLAY_NAME, ['Maria Souza', '  [e2e]  ']).index).toBe(1);
  });

  it('aborta em lista vazia (inbox sem nenhuma conversa renderizada)', () => {
    expect(escolher(FIXTURE_DISPLAY_NAME, []).codigo).toBe('not-visible');
  });

  it('nao casa quando o nome exibido e outro contato com o mesmo sufixo', () => {
    const r = escolher(FIXTURE_DISPLAY_NAME, ['Maria [E2E] Souza']);
    expect(r.tipo).toBe('FixtureConversationError');
  });
});


/** Executa a extracao real, com avatar/nome/preview separados no mesmo duplo. */
function lerNomes(conversas: ConversaRenderizada[]): { nomes: string[]; porClasse: string[] } {
  const script = `
    const m = await import(${JSON.stringify(MODULO)});
    const { criarPage } = await import(${JSON.stringify(HARNESS)});
    const page = criarPage(${JSON.stringify(conversas)}, { cliques: [] });
    const items = page.locator('[data-testid="conversation-item"]');
    const nomes = await m.conversationItemNames(items);
    const porClasse = await items.evaluateAll(elements =>
      elements.map(el => el.querySelector('span.font-semibold')?.textContent?.trim() ?? ''));
    console.log(JSON.stringify({ nomes, porClasse }));
  `;
  const proc = spawnSync('bun', ['-e', script], { encoding: 'utf8', cwd: process.cwd() });
  if (proc.status !== 0) throw new Error(`extracao real falhou: ${proc.stderr || proc.stdout}`);
  return JSON.parse(proc.stdout.trim()) as { nomes: string[]; porClasse: string[] };
}

describe('identidade do nome renderizado — avatar e preview nao sao candidatos', () => {
  it('o harness reproduz a colisao do seletor antigo com o avatar', () => {
    const r = lerNomes([
      { nome: 'Maria', avatar: 'MS', preview: FIXTURE_DISPLAY_NAME },
      { nome: FIXTURE_DISPLAY_NAME, avatar: '[E', preview: 'Outra mensagem' },
    ]);
    expect(r.porClasse).toEqual(['MS', '[E']);
    expect(r.nomes).toEqual(['Maria', FIXTURE_DISPLAY_NAME]);
  });

  it('o atributo fica somente no span do nome real do componente', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/components/inbox/VirtualizedRealtimeList.tsx'), 'utf8');
    const spans = component.match(/<span\b[^>]*data-testid="conversation-contact-name"[^>]*>[\s\S]*?<\/span>/g) ?? [];
    expect(spans).toHaveLength(1);
    expect(spans[0]).toContain('conversation.contact.nickname');
    expect(spans[0]).toContain('conversation.contact.company');
  });

  it('avatar e preview imitando a fixture nao mudam o nome extraido', () => {
    const r = lerNomes([{ nome: 'Maria', avatar: FIXTURE_DISPLAY_NAME, preview: FIXTURE_DISPLAY_NAME }]);
    expect(r.nomes).toEqual(['Maria']);
  });

  it('elemento de nome ausente produz vazio, sem fallback para avatar ou preview', () => {
    const r = lerNomes([{ nome: FIXTURE_DISPLAY_NAME, avatar: FIXTURE_DISPLAY_NAME, preview: FIXTURE_DISPLAY_NAME, nomePresente: false }]);
    expect(r.nomes).toEqual(['']);
  });

  it('avatar ausente nao muda o nome e companhia continua parte do texto', () => {
    const r = lerNomes([{ nome: '[E2E] · Empresa', avatar: null, preview: FIXTURE_DISPLAY_NAME }]);
    expect(r.nomes).toEqual(['[E2E] · Empresa']);
  });

  it('a extracao preserva a ordem apresentada ao evaluateAll', () => {
    const conversas = [{ nome: 'Maria', avatar: FIXTURE_DISPLAY_NAME }, { nome: FIXTURE_DISPLAY_NAME, avatar: 'C' }];
    expect(lerNomes(conversas.reverse()).nomes).toEqual([FIXTURE_DISPLAY_NAME, 'Maria']);
  });
});

describe('spec real com elementos concorrentes de identidade', () => {
  it('abre a fixture correta quando o avatar do primeiro contato imita seu nome', () => {
    const r = executarSpec([
      { nome: 'Maria', avatar: FIXTURE_DISPLAY_NAME, preview: FIXTURE_DISPLAY_NAME },
      { nome: FIXTURE_DISPLAY_NAME, avatar: '[E' },
    ]);
    expect(r.erro).toBeNull();
    expect(r.cliques).toEqual([FIXTURE_DISPLAY_NAME]);
    expect(r.cliqueAntesDeDigitar).toEqual([FIXTURE_DISPLAY_NAME]);
    expect(r.teclas).toEqual(['Enter']);
  });

  for (const [cenario, conversas] of [
    ['somente avatar', [{ nome: 'Maria', avatar: FIXTURE_DISPLAY_NAME }]],
    ['somente preview', [{ nome: 'Maria', avatar: 'MS', preview: FIXTURE_DISPLAY_NAME }]],
    ['nome ausente', [{ nome: FIXTURE_DISPLAY_NAME, avatar: FIXTURE_DISPLAY_NAME, preview: FIXTURE_DISPLAY_NAME, nomePresente: false }]],
    ['companhia diferente do alvo exato', [{ nome: '[E2E] · Empresa', avatar: FIXTURE_DISPLAY_NAME }]],
  ] satisfies Array<[string, ConversaRenderizada[]]>) {
    it('aborta sem clicar/digitar/enviar quando o alvo esta em ' + cenario, () => {
      const r = executarSpec(conversas, { acelerarRelogio: true });
      expect(r.erro?.codigo).toBe('not-visible');
      expect(r.cliques).toEqual([]);
      expect(r.digitado).toBeNull();
      expect(r.teclas).toEqual([]);
    });
  }

  it('dois nomes reais continuam ambiguos mesmo com avatares diferentes', () => {
    const r = executarSpec([
      { nome: FIXTURE_DISPLAY_NAME, avatar: 'A' },
      { nome: ' [e2e] ', avatar: 'B' },
    ], { acelerarRelogio: true });
    expect(r.erro?.codigo).toBe('ambiguous');
    expect(r.cliques).toEqual([]);
    expect(r.digitado).toBeNull();
    expect(r.teclas).toEqual([]);
  });

  it('preserva normalizacao do nome real sem depender das iniciais', () => {
    const r = executarSpec([{ nome: '  [e2e]  ', avatar: 'C', preview: 'Outro texto' }]);
    expect(r.erro).toBeNull();
    expect(r.cliques).toEqual(['  [e2e]  ']);
    expect(r.cliqueAntesDeDigitar).toEqual(['  [e2e]  ']);
    expect(r.teclas).toEqual(['Enter']);
  });
});
