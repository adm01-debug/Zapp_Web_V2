/**
 * MC-001 (plano de Contatos, 100 etapas — 08/10/2026) — baseline medido do módulo.
 *
 * Por que este spec existe: as etapas seguintes do plano vão mexer na tela de
 * Contatos (toolbar, KPIs, cards, abas, painel de detalhe, formulário,
 * acessibilidade, desempenho). Sem um número de ANTES, nenhuma etapa consegue
 * dizer se melhorou ou piorou. Este roteiro mede, num navegador real e sempre no
 * MESMO cenário, cinco coisas:
 *
 *   1. tempo de carga — da navegação até o módulo montado (KPIs + aba + lista);
 *   2. nº de requisições — por tipo de recurso;
 *   3. peso do JS — Resource Timing, com o recorte do código do PRÓPRIO módulo
 *      (src/components/contacts, src/hooks/crm, src/services/contact*);
 *   4. erros de console — `console.error`, exceções não tratadas e respostas
 *      HTTP de falha;
 *   5. achados de acessibilidade — axe-core, TODAS as regras, na página inteira.
 *
 * A medição é impressa no stdout e gravada em
 * `docs/audits/evidence/2026-10-08-contatos-baseline.json` (rodar de novo
 * ATUALIZA esse arquivo — ele é a régua, não um retrato congelado); o texto lido
 * por gente fica em `docs/audits/BASELINE_MODULO_CONTATOS_2026-10-08.md`.
 *
 * Rodar com UM comando:
 *
 *     bun run test:e2e:contatos-baseline
 *
 * Determinismo (regra R1 — nenhum agente toca produção): sessão FALSA
 * (`installFakeSession`), backend mockado (`mockAppShell` + as leituras de
 * Contatos + o upsert de presença) e rede real barrada (`bloquearRedeReal`, que
 * reprova o teste se alguma requisição escapar). Sem secrets, sem banco, sem
 * `storageState`: o cenário é o mesmo em toda execução — Contatos com a lista
 * vazia — e é justamente isso que torna os números comparáveis antes/depois.
 *
 * LIMITE HONESTO DA MEDIÇÃO: o servidor é o `vite dev` (módulos soltos, sem
 * bundle nem minificação), então os números de peso e de nº de requisições NÃO
 * são os do pacote de produção — o orçamento do chunk de produção é a etapa
 * MC-007. O que está medido aqui e vale como régua é a variação relativa: o peso
 * do CÓDIGO DO MÓDULO e o nº de requisições que ele puxa em toda entrada.
 *
 * Este spec NÃO trava um limite de desempenho (MC-007) nem exige zero achado de
 * acessibilidade (objetivo das etapas MC-011..MC-026). Ele TRAVA que a medição
 * seja real e que a entrada do módulo esteja sã: o módulo montou, a coleta veio
 * do navegador (não de literal), nenhuma requisição escapou para a rede real,
 * nenhuma resposta HTTP falhou fora da assinatura do fixture e nenhuma exceção
 * de JS foi lançada.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

/** Mesmo caminho documentado no relatório — a evidência fica versionada com ele. */
const EVIDENCIA = 'docs/audits/evidence/2026-10-08-contatos-baseline.json';

/**
 * Fronteira do módulo, como o plano o define (etapa MC-001): componentes de
 * Contatos, hooks de CRM e os serviços de contato.
 */
const PREFIXOS_MODULO = ['/src/components/contacts/', '/src/hooks/crm/', '/src/services/contact'];

/** As mesmas leituras que a spec E98 mocka (Contatos sem linhas). */
async function mockContatosVazios(page: import('@playwright/test').Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(
    /\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/,
    (route) => json(route, []),
  );
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('MC-001 — baseline medido do módulo de Contatos', () => {
  test('mede carga, requisições, peso de JS, console e a11y e grava a evidência', async ({ page }) => {
    const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    const requisicoes: { tipo: string; url: string }[] = [];
    const consoleMsgs: { tipo: string; texto: string }[] = [];
    const falhasHttp: { status: number; url: string }[] = [];

    // Os ouvintes entram ANTES do primeiro goto: requisição/console que acontece
    // no boot não pode ficar fora da conta.
    page.on('request', (r) => requisicoes.push({ tipo: r.resourceType(), url: r.url() }));
    page.on('console', (m) => consoleMsgs.push({ tipo: m.type(), texto: m.text() }));
    page.on('pageerror', (e) => consoleMsgs.push({ tipo: 'pageerror', texto: e.message }));
    page.on('response', (r) => {
      if (r.status() >= 400) falhasHttp.push({ status: r.status(), url: r.url() });
    });

    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await mockContatosVazios(page);
    // O shell grava a presença do agente ao entrar (`agent_presence`). Sem esta
    // rota o catch-all do `mockAppShell` responde 403 e o app registra um
    // console.error que NÃO é defeito do módulo, é o mock — mediria o fixture,
    // não o produto.
    await page.route(/\/rest\/v1\/agent_presence/, (route) => json(route, route.request().method() === 'GET' ? [] : {}, 201));
    await installFakeSession(page);

    const inicio = Date.now();
    // `gotoContacts` espera o módulo MONTADO: <main> com h1 "Contatos", KPIs, a
    // aba "Todos" e o fim do "Carregando contatos". Sem isso não há o que medir.
    await gotoContacts(page);
    const tempoAteModulo = Date.now() - inicio;

    // --- 1. Tempo de carga (Navigation Timing, do próprio navegador) ---------
    const navegacao = await page.evaluate(() => {
      const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!e) return null;
      return {
        dclMs: Math.round(e.domContentLoadedEventEnd - e.startTime),
        loadMs: Math.round(e.loadEventEnd - e.startTime),
      };
    });

    // --- 2 e 3. Requisições e peso do JS (Resource Timing) -------------------
    const recursos = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => {
        const r = entry as PerformanceResourceTiming;
        return { nome: r.name, tipo: r.initiatorType, transferido: r.transferSize, decodificado: r.decodedBodySize };
      }),
    );

    const porTipo: Record<string, number> = {};
    for (const r of requisicoes) porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1;

    const scripts = recursos.filter((r) => r.tipo === 'script');
    const somaBytes = (lista: typeof scripts) => ({
      transferido: lista.reduce((s, r) => s + r.transferido, 0),
      decodificado: lista.reduce((s, r) => s + r.decodificado, 0),
      arquivos: lista.length,
      maiores: [...lista]
        .sort((a, b) => b.decodificado - a.decodificado)
        .slice(0, 5)
        .map((r) => ({ arquivo: r.nome.split('/').pop() ?? r.nome, decodificado: r.decodificado })),
    });

    const jsTotal = somaBytes(scripts);
    // Recorte que interessa ao plano: quanto pesa o código DO MÓDULO.
    const scriptsDoModulo = scripts.filter((r) => PREFIXOS_MODULO.some((p) => r.nome.includes(p)));
    const jsModulo = somaBytes(scriptsDoModulo);

    // --- 4. Console e rede ---------------------------------------------------
    const pageErrors = consoleMsgs.filter((m) => m.tipo === 'pageerror');
    const errosConsole = consoleMsgs.filter((m) => m.tipo === 'error');
    const avisosConsole = consoleMsgs.filter((m) => m.tipo === 'warning');
    // O fixture de sessão FALSA responde 401 em `/auth/v1/user` DE PROPÓSITO
    // (ver `mockAppShell`): o JWT do `installFakeSession` não é assinado e o
    // serviço real responde 401 — o app tolera. É a assinatura do cenário, não
    // uma falha da tela; as demais falhas HTTP continuam sendo falha do teste.
    const falhasDoFixture = falhasHttp.filter((f) => f.status === 401 && f.url.includes('/auth/v1/user'));
    const falhasInesperadas = falhasHttp.filter((f) => !falhasDoFixture.includes(f));

    // --- 5. Acessibilidade (axe-core, todas as regras, página inteira) -------
    await page.addScriptTag({ path: AXE });
    const a11y = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: { run: (c: Document) => Promise<{
          passes: { id: string }[];
          violations: {
            id: string;
            impact: string | null;
            nodes: { target: string[]; html: string; failureSummary?: string }[];
          }[];
          incomplete: { id: string }[];
        }> };
      }).axe;
      const r = await axe.run(document);
      return {
        // `passes` é a prova de que o axe AVALIOU a página: se o contexto saísse
        // vazio, a análise viria sem nenhum caso aprovado.
        regrasAprovadas: r.passes.length,
        regrasIncompletas: r.incomplete.length,
        achados: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact ?? 'unknown',
          nos: v.nodes.length,
          exemplos: v.nodes.slice(0, 3).map((n) => ({
            alvo: n.target.join(' '),
            html: n.html,
            motivo: n.failureSummary ?? '',
          })),
        })),
      };
    });

    const medicao = {
      etapa: 'MC-001',
      medidoEm: new Date().toISOString(),
      cenario: 'vite dev + sessão falsa + backend mockado + rede real barrada; Contatos com lista vazia',
      viewport: page.viewportSize(),
      tempoAteModuloMs: tempoAteModulo,
      navegacao,
      requisicoes: { total: requisicoes.length, porTipo },
      jsTotal,
      jsModulo: { ...jsModulo, fronteira: PREFIXOS_MODULO },
      console: {
        pageerrors: pageErrors.length,
        erros: errosConsole.length,
        avisos: avisosConsole.length,
        mensagensErro: [...pageErrors, ...errosConsole].slice(0, 10),
      },
      rede: {
        falhasHttp: falhasHttp.length,
        falhasDoFixture: falhasDoFixture.length,
        falhasInesperadas,
      },
      a11y: {
        regrasAprovadas: a11y.regrasAprovadas,
        regrasIncompletas: a11y.regrasIncompletas,
        achados: a11y.achados,
      },
    };

    mkdirSync(dirname(EVIDENCIA), { recursive: true });
    writeFileSync(EVIDENCIA, `${JSON.stringify(medicao, null, 2)}\n`, 'utf8');

    // A saída do comando é o baseline: quem não abrir o JSON lê aqui.
    // (`process.stdout` em vez de `console.log` por causa do ratchet de lint,
    // que só permite `console.warn`/`console.error` no repositório.)
    process.stdout.write(`[MC-001] baseline medida\n${JSON.stringify(medicao, null, 2)}\n`);

    // --- Travas da MEDIÇÃO (orçamento é MC-007; a11y é MC-011..MC-026) ------
    // 1) A medição é do módulo de verdade, com dado vindo do navegador.
    expect(a11y.regrasAprovadas, 'axe não avaliou a página (medição de a11y vazia)').toBeGreaterThan(0);
    expect(requisicoes.length, 'nenhuma requisição observada — medição vazia').toBeGreaterThan(0);
    expect(scripts.length, 'nenhum script no Resource Timing — peso do JS não medido').toBeGreaterThan(0);
    expect(jsTotal.decodificado, 'peso de JS zerado — Resource Timing não coletou os módulos').toBeGreaterThan(0);
    expect(
      jsModulo.arquivos,
      'nenhum arquivo do módulo de Contatos no Resource Timing — a fronteira do módulo não foi carregada',
    ).toBeGreaterThan(0);

    // 2) Nada escapou para a rede real (R1), nenhuma falha HTTP fora da
    //    assinatura do fixture e nenhuma exceção de JS na entrada do módulo.
    expect(registro.redeBarrada, 'requisição sem mock escapou para a rede real').toEqual([]);
    expect(falhasInesperadas, 'resposta HTTP de falha fora do fixture de sessão falsa').toEqual([]);
    expect(pageErrors, `exceção de JS durante a carga\n${JSON.stringify(pageErrors, null, 2)}`).toEqual([]);
  });
});
