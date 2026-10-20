import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
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
function executarSpec(nomes: string[], { acelerarRelogio = false } = {}): Execucao {
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
