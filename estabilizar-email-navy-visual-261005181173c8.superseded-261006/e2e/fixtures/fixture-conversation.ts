import type { Locator, Page } from '@playwright/test';

import { E2E_FIXTURE_CONTACT_DISPLAY_NAME } from './e2e-contact';

// R2-INF-007 (item 97): o E2E de mensagens escolhia o PRIMEIRO item da lista
// (`locator('[data-testid="conversation-item"]').first()`) e digitava + Enter. A
// seguranca dependia da suposicao documental de que a conta sempre enxerga so o
// contato fixture — enquanto o setup aceita credenciais de QA e de CI. Com
// qualquer conversa alheia em primeiro lugar (conta apontando para outro projeto,
// ordem diferente, contato novo), o enqueue REAL ia para um contato nao escolhido
// para QA.
//
// Regra agora: a conversa so e aberta quando o nome exibido casa com a fixture e
// existe EXATAMENTE UM candidato. Zero candidatos -> aborta; mais de um -> aborta
// (ambiguidade). Nunca ha envio por posicao.

export type FixtureConversationFailure = 'not-visible' | 'ambiguous';

export class FixtureConversationError extends Error {
  readonly code: FixtureConversationFailure;

  constructor(code: FixtureConversationFailure, message: string) {
    super(message);
    this.name = 'FixtureConversationError';
    this.code = code;
  }
}

/**
 * Indice do item cujo nome exibido e o do contato fixture.
 *
 * Funcao pura (sem DOM, sem I/O) de proposito: e a decisao que impede o envio
 * para o contato errado, entao precisa ser testavel caso a caso. A comparacao
 * normaliza espaco e caixa porque o nome vem do texto renderizado na lista.
 */
export function pickFixtureConversationIndex(names: readonly string[], displayName: string): number {
  const alvo = displayName.trim().toLowerCase();
  const matches = names
    .map((nome, index) => ({ nome: nome.trim().toLowerCase(), index }))
    .filter((item) => item.nome === alvo)
    .map((item) => item.index);

  if (matches.length === 0) {
    const vistos = names.length ? names.map((n) => JSON.stringify(n)).join(', ') : 'nenhum';
    throw new FixtureConversationError(
      'not-visible',
      `Contato fixture "${displayName}" nao esta visivel no inbox (nomes vistos: ${vistos}). ` +
        'O teste nao envia mensagem quando o alvo nao esta visivel.'
    );
  }
  if (matches.length > 1) {
    throw new FixtureConversationError(
      'ambiguous',
      `Contato fixture "${displayName}" esta ambiguo: ${matches.length} itens casam ` +
        `(indices ${matches.join(', ')}). O teste nao envia mensagem em caso de ambiguidade.`
    );
  }
  return matches[0];
}

/**
 * Nome exibido em cada item da lista, na ordem do DOM.
 *
 * O escopo e o nome do contato (`span.font-semibold`, o mesmo elemento que
 * VirtualizedRealtimeList renderiza como `nickname || primeiro nome`), nunca o
 * texto inteiro do item: o preview da ultima mensagem pode conter o mesmo token
 * da fixture e um contato alheio passaria a casar.
 */
export async function conversationItemNames(items: Locator): Promise<string[]> {
  return items.evaluateAll((elements) =>
    elements.map((el) => el.querySelector('span.font-semibold')?.textContent?.trim() ?? '')
  );
}

/** Aborta quando a lista de conversas nao renderizou nenhum item. */
async function waitForConversationList(items: Locator): Promise<void> {
  try {
    await items.first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new FixtureConversationError(
      'not-visible',
      'Nenhum item [data-testid="conversation-item"] ficou visivel no inbox em 15 s — ' +
        'o teste nao envia mensagem para um alvo que nao conseguiu identificar.'
    );
  }
}

/**
 * Abre SOMENTE a conversa do contato fixture e devolve o item aberto.
 *
 * Substitui `page.locator('[data-testid="conversation-item"]').first()`: confere a
 * identidade antes de clicar/digitar e aborta (FixtureConversationError) quando o
 * contato esperado nao aparece ou quando mais de um item casa. A espera curta
 * cobre a lista ainda renderizando — so o caso "nao visivel" re-tenta; ambiguidade
 * aborta na hora.
 */
export async function openFixtureConversation(
  page: Page,
  displayName: string = E2E_FIXTURE_CONTACT_DISPLAY_NAME
): Promise<Locator> {
  const items = page.locator('[data-testid="conversation-item"]');
  await waitForConversationList(items);

  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const index = pickFixtureConversationIndex(await conversationItemNames(items), displayName);
      const conversation = items.nth(index);
      await conversation.click();
      return conversation;
    } catch (error) {
      const naoVisivel =
        error instanceof FixtureConversationError && error.code === 'not-visible';
      if (!naoVisivel || Date.now() >= deadline) throw error;
    }
    await page.waitForTimeout(200);
  }
}
