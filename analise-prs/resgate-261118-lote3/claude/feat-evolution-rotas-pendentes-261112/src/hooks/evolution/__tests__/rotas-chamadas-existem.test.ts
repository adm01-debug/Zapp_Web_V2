/**
 * Guarda de contrato front → Edge `evolution-api`.
 *
 * O #2054 apagou do roteador rotas que o front ainda chamava (find-status-messages,
 * get-settings, set-settings, get-webhook, mark-unread…): em produção viraram
 * 404 "Unknown action" (admin) ou 403 (agente), e nenhum teste acusou porque a
 * lista de ações do roteador usada nos testes era colada à mão.
 *
 * As duas pontas são lidas do FONTE. Toda ação que o app envia precisa ter
 * `action === '<ação>'` no roteador. Formas cobertas, em todo `src/`:
 *  - caminho: `'evolution-api/<ação>'` (invoke direto, qualquer aspas);
 *  - `callApi('<ação>'` / `withToast('<ação>'` (inclusive hooks/integrations);
 *  - corpo: `invoke('evolution-api', { body: { action: '<ação>' } })`;
 *  - dinâmico: `` `evolution-api/${...}` `` só com entrada justificada em
 *    DINAMICOS_PERMITIDOS, que lista as ações possíveis (também conferidas).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acoesChamadas, acoesDoRoteador } from './evolutionRouterGuard';

const ROOT = process.cwd();
const ROUTER = resolve(ROOT, 'supabase/functions/evolution-api/index.ts');
const SRC = resolve(ROOT, 'src');

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : fontes(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/**
 * Órfãs com correção em PR separado ainda não integrado. Depois do merge a
 * entrada fica inócua (a ação passa a existir) e pode sair desta lista.
 *  - find-status-messages: restaurada no PR #2999.
 */
const ORFAS_COM_CORRECAO_PENDENTE = new Set(['find-status-messages']);

/** Usos dinâmicos aceitos: arquivo → ações possíveis (conferidas) + justificativa. */
const DINAMICOS_PERMITIDOS: Record<string, { acoes: string[]; motivo: string }> = {
  'src/hooks/evolution/useEvolutionApiCore.ts': {
    acoes: [],
    motivo: 'despachante genérico do callApi: cada ação chega por callApi/withToast, varridas acima',
  },
  'src/services/evolution.service.ts': {
    acoes: ['send-audio', 'send-media'],
    motivo: "sendEvolutionMedia escolhe entre 'send-audio' e 'send-media' pelo tipo da mídia",
  },
};

const roteador = acoesDoRoteador(readFileSync(ROUTER, 'utf8'));
const arquivos = fontes(SRC).map((arquivo) => ({ arquivo: relative(ROOT, arquivo), texto: readFileSync(arquivo, 'utf8') }));

describe('front → evolution-api: toda ação chamada existe no roteador', () => {
  it('o roteador foi lido (sanidade)', () => {
    expect(roteador.has('send-text')).toBe(true);
    expect(roteador.size).toBeGreaterThanOrEqual(50);
  });

  it('nenhuma ação órfã (chamada pelo app e sem tratador na Edge)', () => {
    const { chamadas } = acoesChamadas(arquivos);
    expect(chamadas.length).toBeGreaterThan(20);
    const orfas = chamadas.filter(({ acao }) => !roteador.has(acao) && !ORFAS_COM_CORRECAO_PENDENTE.has(acao));
    expect(orfas).toEqual([]);
  });

  it('todo uso dinâmico `evolution-api/${...}` está justificado e suas ações existem', () => {
    const { dinamicos } = acoesChamadas(arquivos);
    expect(dinamicos.filter((f) => !(f in DINAMICOS_PERMITIDOS))).toEqual([]);
    const acoes = Object.values(DINAMICOS_PERMITIDOS).flatMap((d) => d.acoes);
    expect(acoes.filter((a) => !roteador.has(a))).toEqual([]);
  });
});

describe('a guarda pega o que o #2054 fez (simulação)', () => {
  const ROTEADOR = [
    "if (action === 'send-text') {}",
    "if (action === 'get-settings' || action === 'set-settings') {}",
    "if (action === 'list-groups') {}",
    "if (action === 'find-chats') {}",
    "if (action === 'offer-call') {}",
    "if (action === 'get-catalog' || action === 'get-collections') {}",
  ].join('\n');
  const APP = [
    { arquivo: 'src/hooks/integrations/useEvolutionApi.ts', texto: "callApi('find-chats', {}); callApi('offer-call', {}); callApi('get-catalog', {});" },
    { arquivo: 'src/hooks/evolution/useEvolutionInstance.ts', texto: "withToast('set-settings', c, 'ok', 'erro'); callApi('get-settings', {}, 'GET');" },
    { arquivo: 'src/components/x/X.tsx', texto: "supabase.functions.invoke('evolution-api/send-text', { body: {} })" },
    { arquivo: 'src/hooks/groups/actions.ts', texto: "supabase.functions.invoke('evolution-api', {\n  body: { action: 'list-groups', instanceName },\n})" },
  ];
  const orfasCom = (roteadorTexto: string) => {
    const r = acoesDoRoteador(roteadorTexto);
    return [...new Set(acoesChamadas(APP).chamadas.filter((c) => !r.has(c.acao)).map((c) => c.acao))].sort();
  };

  it('com todas as rotas, nada é órfão (as 4 formas são lidas)', () => {
    const { chamadas } = acoesChamadas(APP);
    expect(new Set(chamadas.map((c) => c.forma))).toEqual(new Set(['caminho', 'callApi/withToast', 'corpo']));
    expect(orfasCom(ROTEADOR)).toEqual([]);
  });

  it('apagar find-chats, offer-call e get-catalog do roteador faz a guarda falhar com essas três', () => {
    const podado = ROTEADOR
      .replace("if (action === 'find-chats') {}", '')
      .replace("if (action === 'offer-call') {}", '')
      .replace("action === 'get-catalog' || ", '');
    expect(orfasCom(podado)).toEqual(['find-chats', 'get-catalog', 'offer-call']);
  });

  it('apagar uma ação chamada via corpo (`action:`) ou via callApi em hooks/integrations também falha', () => {
    expect(orfasCom(ROTEADOR.replace("if (action === 'list-groups') {}", ''))).toEqual(['list-groups']);
    expect(orfasCom(ROTEADOR.replace("action === 'get-settings' || ", ''))).toEqual(['get-settings']);
  });

  it('uso dinâmico é detectado', () => {
    expect(acoesChamadas([{ arquivo: 'a.ts', texto: 'invoke(`evolution-api/${acao}`)' }]).dinamicos).toEqual(['a.ts']);
  });
});
