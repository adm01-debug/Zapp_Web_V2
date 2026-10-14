# ADR-009 — Testes de teclado com `@testing-library/user-event`

- **Status:** Accepted
- **Data:** 2026-10-14
- **Decisores:** worker (testes) — pedido do revisor no cartão pai `t_ac614b56` (correção de teclado no inbox)

## Contexto

Os testes de teclado da suíte (`vitest` + `jsdom`) eram escritos com
`fireEvent.keyDown(elemento, { key: 'Enter' })`. O `fireEvent` apenas **despacha** o
evento: ele não move o foco e não aciona o elemento. O jsdom, por sua vez, não
implementa a navegação por `Tab` nem o clique implícito de `Enter`/`Space`.

O resultado é o defeito que o revisor recusa todo dia ("teste que não prova"): o
teste de teclado passa **mesmo com o alvo quebrado**, porque quem "anda" pela tela
é o próprio teste (`.focus()` na mão) e não o código de produção. Um teste de
teclado que não prova o foco real não distingue "a tecla foi tratada" de "eu
chamei o handler direto".

Faltava também uma decisão registrada: usar `@testing-library/user-event` ou
escrever um helper interno sobre `fireEvent`? Como não havia padrão escrito, cada
cartão resolvia de um jeito.

## Decisão

**`@testing-library/user-event` entra como `devDependency` (14.6.8) e é o
instrumento obrigatório de todo teste cujo objeto é teclado que depende de foco ou
de ativação do elemento.**

Regras do padrão:

1. Teclado-objeto de teste é a interação **do usuário com o navegador**: `Tab`
   (`user.tab()`), `Enter`, `Space`, setas, `Home`/`End` e clique implícito. Esse
   teclado se escreve com `const user = userEvent.setup()` + `await user.tab()` /
   `await user.keyboard('{ArrowDown}{Enter}')`.
2. `fireEvent.keyDown` fica restrito a teste de handler puro (o alvo é a função
   `onKeyDown` isolada, sem foco e sem ativação) e o teste precisa dizer isso em
   comentário — não é o caminho para testar navegação por teclado da tela.
3. O teste de teclado **afirma o foco** (`expect(alvo).toHaveFocus()`) e o efeito
   da ativação (`onSelect`/`onClick` com o item que estava focado), que é
   exatamente o que o `fireEvent` não entrega.
4. Testes de teclado de tela real seguem o exemplo vivo
   [`src/components/a11y/__tests__/AccessibleListTeclado.test.tsx`](../../src/components/a11y/__tests__/AccessibleListTeclado.test.tsx)
   (roving tabindex do `AccessibleList`/`useRovingTabindex`).
5. Com `vi.useFakeTimers()` o `user-event` exige
   `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`; sem isso o
   `await user.*` trava. Prefira o relógio real no teste de teclado.

Alternativa rejeitada: helper interno sobre `fireEvent` que chama `.focus()` antes
de despachar a tecla. Seria reimplementar (pior) o que o `user-event` já faz, e o
`.focus()` manual dentro do teste continua escondendo se o código de produção
move o foco — que é justamente o comportamento sob prova.

## Consequências

Positivas:

- O teste de teclado falha quando o código de produção deixa de mover o foco ou de
  tratar a tecla. Provado por mutação em `useRovingTabindex`
  (`if (false) focusItem(newIndex)`) → os 4 casos do exemplo ficaram **vermelhos**;
  produção restaurada → **verdes**.
- Um padrão único escrito, com exemplo executável, para os cartões de acessibilidade.

Negativas / custos:

- `package.json` + `bun.lock` ganham uma dependência de teste; `bun install
  --frozen-lockfile` (o passo do CI/`zapp-verify`) foi conferido verde com ela.
- `user-event` é mais lento que `fireEvent` (envolve o ciclo de eventos) e exige
  `await` em cada interação.
- Interage com relógio falso (regra 5 acima).

## Referências

- Cartões: `t_ac614b56` (teclado do inbox, origem do pedido), `t_dbe86111` (esta decisão).
- Código: `src/components/a11y/a11yComponents.tsx` (`AccessibleList`),
  `src/components/a11y/a11yHooks.tsx` (`useRovingTabindex`).
- Exemplo: `src/components/a11y/__tests__/AccessibleListTeclado.test.tsx`.
