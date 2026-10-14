Especialista: iris
Cartão: t_9d56e788 — tela e componentes (area-front-componentes)

FAIXA DO PAI: commits 67ffa98586, be958f52af, 59bb4f8aa4, e5f6219be7 do cartão t_ac0acb5c (hook da Sala de Crise) e, dentro dele, a migration da RPC de t_7d403167 — não são deste cartão. Arquivos que essa faixa traz e que o meu relato NÃO muda: `supabase/migrations/20261013140359_crisis_room_snapshot.sql`, `src/integrations/supabase/types.ts`, `scripts/db-audit/crisis-room-snapshot.test.sh`, `scripts/ci/check-test-inventory.mjs`, `src/hooks/business/useCrisisRoomMetrics.ts` e `src/hooks/business/__tests__/useCrisisRoomMetrics.test.tsx`.

# fix(admin): Sala de Crise com erro explícito, limiares duplos e alerta acessível

## O que mudou e por quê

- `src/components/admin/CrisisRoom.tsx` — a tela deixou de consultar o banco por conta própria e passou a ler o hook
  `useCrisisRoomMetrics` (RPC `crisis_room_snapshot`, entregue e provada no cartão pai). Em cima disso, os estados
  que o cartão pede:
  - **Erro explícito, sem mentir:** quando `isError`, aparece um bloco com `role="alert"`, título
    "Não foi possível medir a operação", o motivo da falha e o botão **"Tentar de novo"** (`refetch`). Os quatro
    cartões continuam na página com **"—"** e selo **"Sem dado"** — nunca "Operação normal" nem selo verde.
  - **Os DOIS limiares por cartão:** cada cartão mostra `Atenção:` e `Crítico:` com o número e a unidade. O sinal
    acompanha o sentido da métrica (`>` para "quanto mais, pior"; `<` para `lowerIsWorse`, ex.: agentes ativos
    "Atenção: < 4 online" / "Crítico: < 2 online"). Os valores vêm de `CRISIS_THRESHOLDS` (leitura real do hook),
    não de constantes escritas aqui dentro.
  - **Mudança de severidade anunciada:** o banner de crise recebeu `role="alert"`; a região do selo do topo ficou
    dentro de um contêiner com `aria-live="polite"` (atômico), para leitor de tela ouvir a troca de Normal ↔ Crítico.
  - **Botão de atualizar acessível:** "Atualizar métricas" agora tem `aria-busy` e fica `disabled` enquanto a
    atualização corre (antes: nem um, nem outro).
  - **Skeleton só na primeira carga:** o esqueleto usa `isFirstLoad` (`isPending`), não `isFetching` — recarga de
    fundo não apaga mais os números já na tela.
  - **"Atualizado há X":** texto derivado de `dataUpdatedAt` ("Atualizado agora" / "Atualizado há N s|min"),
    atualizado a cada 30 s sem re-render do gráfico.
  - **Movimento:** `motion-safe:` nas pulsações de esqueleto e `useReducedMotion()` nas animações do framer-motion,
    para quem pediu menos movimento não receber nada.
- `src/components/admin/__tests__/CrisisRoom.metricas.test.tsx` — reescrito:
  - o componente **real** é renderizado; a única peça substituída é a fonte de dados (`useCrisisRoomMetrics`), via
    `vi.mock` com `importOriginal` — ou seja, `CRISIS_THRESHOLDS`, labels, unidades e a regra de severidade
    continuam vindo do **módulo de produção**, e o mock só devolve o objeto que o hook devolveria. Nada de mock
    "já com a resposta pronta".
  - as asserções antigas deste arquivo exercitavam `supabase.from(...)` dentro da tela — consulta que o componente
    deixou de fazer. Essa regra (mensagem já respondida não conta, etc.) mora hoje no hook (cartão pai,
    `useCrisisRoomMetrics.test.tsx`) e no SQL (`scripts/db-audit/crisis-room-snapshot.test.sh`); reafirmá-la aqui
    sobre um mock seria provar o mock, não a tela. Nenhuma asserção de acessibilidade/estado foi afrouxada — foram
    adicionadas (erro, limiares, aria-live, aria-busy, "—", skeleton só no 1º load, "Atualizado há").

## Prova

- verificação rápida do repositório: `zapp-verify . --rapido`
  → `OK db_guard 0s` ; `OK tipos 213s` ; `OK lint 11s` ; `OK migrations 1s`
  → `VERIFY: VERDE SEM BANCO (225s)`
  (a 1ª tentativa saiu VERMELHA em "tipos" porque o `tsc` foi morto por OOM — exit 137, `load average` ~42,
  swap cheio; o `jev-juiz falha` classificou como environment e a repetição saiu verde.)
- vermelho antes (tela antiga, `06f42f143`, sem a minha mudança):
  `npx vitest run src/components/admin/__tests__/CrisisRoom.metricas.test.tsx`
  → `Test Files  1 failed (1)` ; `Tests  6 failed | 1 passed (7)`
- verde depois (meu commit):
  `npx vitest run src/components/admin/__tests__/CrisisRoom.metricas.test.tsx`
  → `Test Files  1 passed (1)` ; `Tests  7 passed (7)`
- testes que cobrem os 3 itens do critério: erro → "Tentar de novo" + "—" + sem selo verde; severidade crítica →
  `role="alert"` no banner e `aria-live` no selo; limiares "Atenção"/"Crítico" com os dois números por cartão.

## O que NÃO fiz e por quê

- Não toquei no hook nem na migration (são do cartão pai; fora da minha área).
- **Captura claro/escuro:** não a entreguei porque exige uma spec E2E nova e um `project` no `playwright.config.ts`
  (arquivo fora de "ARQUIVOS QUE PODE TOCAR" deste cartão). O contraste dos tokens usados (muted/warning/destructive/
  success) já é coberto por `e2e/a11y-contraste.spec.ts`. Deixei a nota no cartão para quem puder ampliar o harness.
