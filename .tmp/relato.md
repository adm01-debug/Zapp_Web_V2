Especialista: iris (executado pelo perfil designer — worker design, skill design-system-zapp)

## O que mudou e por quê
- `src/components/tasks/board/BoardColumn.tsx`: o ⁙ do cabeçalho (`board-collapse-done`) saiu de `min-h-[24px] min-w-[24px] max-md:min-h-[44px] max-md:min-w-[44px]` para `min-h-10 min-w-10` (40 px nas duas medidas, em todas as larguras) e o rodapé `board-done-older` ganhou `min-h-10` — motivo: a regra de tela do plano exige alvo de pelo menos 40 px e os dois estavam abaixo (24 px no desktop e ~32 px).
- `src/components/tasks/board/TasksBoardMode.tsx`: o toggle `board-done-toggle` saiu de `h-8` (32 px) para `min-h-10 min-w-10` — mesmo motivo.
- `src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx`: novo caso que mede o alvo dos três controles a partir da classe REALMENTE aplicada ao elemento renderizado, convertendo a escala do Tailwind (n → n*4 px); `h-8`=32 e `min-h-[24px]`=24 reprovam, `min-h-10`=40 passa. Não é conferência de string solta: o número é calculado e o teste falha sem a correção (vermelho abaixo).
- Entrega anterior reaproveitada: a faixa e o trabalho deste cartão vieram por `git cherry-pick` da branch `v2/captura-concluido-toggle-vazios-quadro-2610111943d780`; o commit final desta rodada é `a989641f8`.

## Pontos do revisor ([refazer 2])
- Ponto 1: os três controles agora têm `min-h-10 min-w-10`/`min-h-10` (40 px) e o caso novo prova a medida; vermelho antes → `board-done-toggle altura: expected 32 to be greater than or equal to 40`; verde depois → 10 passed.
- Ponto 2 (relato): `src/components/tasks/shared/WorkItemCard.tsx` NÃO foi editado à mão por este cartão. Ele entra no diff pela FAIXA DOS PAIS (redesenho do cartão — commit `f7c4d40e1`, branch do cartão t_d5b33620), trazida junto com `0c0868a01`. Corrijo a frase da entrega anterior, que dizia "não toquei WorkItemCard.tsx".
- Ponto 3 (faixa dos pais sem teste neste diff): `BoardColumn`/`TasksBoardMode` carregam código dos pais — subtítulo da coluna (etapa 080), barra e rodapé do limite de Fazendo (etapa 082) e o tranco `motion-safe:animate-wiggle` + borda destrutiva do drop recusado (etapa 083). Esse código veio na faixa do pai t_15507eb6; existe teste dele na branch `v2/colunas-quadro-subtitulo-limite-fazendo-2610111753c50b` (cartão t_a1c22e3a), arquivo `src/components/tasks/board/__tests__/BoardColumn.subtitulo-limite.test.tsx`, que cobre os três: "cheio (3/3)", "parcial (1/3)", "coluna SEM limite duro…", "treme (só a borda garante o aviso em movimento reduzido), avisa e NÃO move o card" e "o tranco é curto". Ele saiu da faixa deste cartão por escolha do revisor da rodada 1 (commit `3767ef4c7`), então não é duplicado aqui.

## Prova
- vermelho antes: `npx vitest run src/components/tasks/__tests__/quadroCapturaConcluidoToggleVazios.test.tsx` com as classes antigas → `Test Files 1 failed (1)` / `Tests 1 failed | 9 passed (10)` / `AssertionError: board-done-toggle altura: expected 32 to be greater than or equal to 40`.
- verde depois: mesmo comando → `Test Files 1 passed (1)` / `Tests 10 passed (10)`.
- verificação: `zapp-verify . --rapido` (rodado pelo hermes-tarefa-fechar).

## O que NÃO fiz e por quê
- Não toquei em `src/components/ui/*` nem em nenhum arquivo fora dos três do cartão.
- Não mexi no botão ⓘ "Política da coluna" do cabeçalho: ele não é controle deste cartão e tem decisão própria na base (área de 24 px, 44 no celular).
- Não adicionei migration, Edge Function ou dependência.
