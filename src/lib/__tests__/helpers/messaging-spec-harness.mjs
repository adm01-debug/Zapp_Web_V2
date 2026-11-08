// Harness do spec E2E (R2-INF-007): roda e2e/messaging.spec.ts DE VERDADE, apenas com o
// framework `@playwright/test` substituido por um duplo em memoria. O codigo sob teste
// (o spec e a fixture real e2e/fixtures/fixture-conversation.ts) nao e duplicado, nem
// reescrito, nem mockado: o duplo apenas registra o que o spec clicou, digitou e teclou.
//
// Uso: bun messaging-spec-harness.mjs <spec.ts> <json-dos-nomes> [--acelerar]
// Saida: JSON { cliques, cliqueAntesDeDigitar, digitado, teclas, erro }
import { pathToFileURL } from 'node:url';

/** Duplo minimo de Page/Locator, so o que o spec e a fixture usam. */
export function criarPage(nomes, registro) {
  const itens = nomes.map((entrada) => {
    const dados = typeof entrada === 'string' ? { nome: entrada } : entrada;
    if (!dados || typeof dados.nome !== 'string') throw new TypeError('conversa controlada exige nome');
    const nome = dados.nome;
    const avatar = dados.avatar === undefined ? nome.trim().slice(0, 2).toUpperCase() : dados.avatar;
    // Ordem real: AvatarFallback tambem e span.font-semibold, antes do nome.
    // Preview e um elemento distinto e nunca recebe o atributo de identidade.
    const elementos = [
      ...(avatar === null ? [] : [{ textContent: avatar, className: 'font-semibold', testId: undefined }]),
      ...(dados.nomePresente === false ? [] : [{ textContent: nome, className: 'font-semibold', testId: 'conversation-contact-name' }]),
      { textContent: dados.preview ?? '', className: 'font-semibold', testId: undefined },
    ];
    return {
      nome,
      querySelector: (selector) => {
        if (selector === 'span.font-semibold') return elementos.find((el) => el.className.split(/\s+/).includes('font-semibold')) ?? null;
        if (selector === '[data-testid="conversation-contact-name"]') return elementos.find((el) => el.testId === 'conversation-contact-name') ?? null;
        throw new Error('seletor nao modelado no DOM controlado: ' + selector);
      },
      click: async () => { registro.cliques.push(nome); },
      waitFor: async () => {},
    };
  });
  // Pagina/Locator do Playwright nunca devolve undefined: um item que nao existe e um
  // locator que nao casa (count 0), entao o duplo tambem devolve um item inerte.
  const itemInexistente = { nome: null, click: async () => {}, waitFor: async () => {} };
  const vazio = {
    getByText: () => vazio,
    click: async () => {},
    fill: async () => {},
    waitFor: async () => {},
  };
  const lista = {
    first: () => itens[0] ?? itemInexistente,
    nth: (indice) => itens[indice] ?? itemInexistente,
    waitFor: async () => {},
    // O callback real recebe elementos com avatar/nome/preview separados.
    // O seletor antigo precisa enxergar o avatar para a regressao ser detectada.
    evaluateAll: async (fn) => fn(itens),
  };
  return {
    locator: (sel) => (String(sel).includes('conversation-item') ? lista : vazio),
    getByTestId: () => vazio,
    getByText: () => vazio,
    getByRole: (papel) => {
      if (papel === 'textbox') {
        return {
          fill: async (texto) => {
            registro.digitado = texto;
            registro.cliqueAntesDeDigitar = [...registro.cliques];
          },
        };
      }
      return vazio;
    },
    keyboard: {
      press: async (tecla) => {
        registro.teclas.push(tecla);
      },
    },
    waitForTimeout: async () => {},
  };
}

export async function rodar(specPath, nomes, { acelerarRelogio = false } = {}) {
  const registro = {
    cliques: [],
    cliqueAntesDeDigitar: null,
    digitado: null,
    teclas: [],
  };

  if (acelerarRelogio) {
    // O helper espera ate 10 s a fixture aparecer na lista. Aqui nao existe espera
    // real: adianta o relogio a cada leitura para o deadline ser atingido na hora.
    const real = Date.now;
    let deslocamento = 0;
    Date.now = () => real() + (deslocamento += 60_000);
  }

  const testes = [];
  const test = (nome, fn) => {
    testes.push({ nome, fn });
  };
  test.describe = (_nome, fn) => fn();
  test.beforeEach = () => {};
  test.afterEach = () => {};
  test.afterAll = () => {};
  test.skip = () => {};
  test.slow = () => {};
  const expect = () => ({ toBeVisible: async () => true, toBeEnabled: async () => true });

  const { mock } = await import('bun:test');
  mock.module('@playwright/test', () => ({ test, expect }));

  await import(pathToFileURL(specPath).href);

  const alvo = testes.find((t) => t.nome === 'send text message appears in conversation');
  if (!alvo) {
    throw new Error(
      `teste de envio nao encontrado no spec (registrados: ${testes.map((t) => t.nome).join(' | ')})`
    );
  }

  let erro = null;
  try {
    await alvo.fn({ page: criarPage(nomes, registro), browserName: 'chromium' });
  } catch (e) {
    erro = { tipo: e?.name ?? 'Error', mensagem: e?.message ?? String(e), codigo: e?.code ?? null };
  }
  return { ...registro, erro };
}

if (import.meta.main) {
  const [, , specPath, nomesJson, ...flags] = process.argv;
  const resultado = await rodar(specPath, JSON.parse(nomesJson), {
    acelerarRelogio: flags.includes('--acelerar'),
  });
  console.log(JSON.stringify(resultado));
}
