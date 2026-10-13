Especialista: worker (geral)
Especialista: Íris (area-front-componentes)

## Motivo do cartão (retomar em conflito) e como resolvi
O cartão pede: trazer os commits da branch `v2/sl-192-2610090059e54f` (commit `d33737fcf`, mais o `0eb887c8a`) para a ponta de `dia/2026-10-12` PRESERVANDO o que já entrou nela; OU, se no código ATUAL o defeito já estiver corrigido, provar no relato e fechar SEM commit de código.

Conferi no código ATUAL: a entrega anterior (etapa de SKILLS do item 077-078 — a tela de Roteamento usando o RPC `skill_based_assign` e entregando ao agente o contato que aguarda há mais tempo, com a guarda repetida no UPDATE) JÁ ESTÁ na ponta de `dia/2026-10-12`, integrada por outro cartão. Portanto não há o que trazer: o cherry-pick duplicaria uma correção que já entrou. Fechei SEM commit de código, como o cartão manda nesse caso.

## Prova de que o defeito do pedido já está resolvido no código ATUAL
- A correção equivalente está em HEAD pelo commit `cca1ed150` (`fix(filas/skills): UPDATE de contato repete guarda de aguardando e confirma escrita (SL-192)`): `git merge-base --is-ancestor cca1ed150 HEAD` → JA-EM-HEAD.
- Os commits da branch anterior NÃO são ancestrais (`0eb887c8a` e `d33737fcf` → FALTA), mas `git diff HEAD d33737fcf -- src/components/settings/SkillBasedRoutingSettings.tsx src/components/settings/__tests__/SkillBasedRoutingSettings.skills-assign.test.tsx` mostra só diferenças de forma/refatoração: HEAD mantém (e reforça) TODOS os comportamentos da entrega anterior —
  - leitura do contato que aguarda pela fila (`queue_id`, `assigned_to` nulo, `deleted_at` nulo, status de conversa aberto, mais antigo primeiro, limite 1);
  - UPDATE que REPETE a guarda de "aguardando" e confirma a escrita com `.select('id')`;
  - toast próprio quando a linha não foi alterada (contato pego por outro fluxo), em vez de sucesso falso;
  - invalidação das queries de contatos/agregados no sucesso.
  Nada de comportamento da entrega anterior falta na ponta atual; o teste de HEAD é mais forte (afirma a cadeia de filtros do select e do update).
- O consumidor do RPC existe no código atual: `src/components/settings/SkillBasedRoutingSettings.tsx:129` chama `supabase.rpc('skill_based_assign', { p_queue_id })` (`git grep -n skill_based_assign -- src`).
- Os dois arquivos da entrega anterior existem na ponta: `SkillBasedRoutingSettings.tsx` (367 linhas) e `__tests__/SkillBasedRoutingSettings.skills-assign.test.tsx` (325 linhas).

## Prova (teste rodado agora, no código ATUAL sem nenhuma alteração minha)
- verde: `npx vitest run src/components/settings/__tests__/SkillBasedRoutingSettings.skills-assign.test.tsx src/components/settings/__tests__/SkillBasedRoutingSettings.test.tsx` →
  `Test Files  2 passed (2)` / `Tests  9 passed (9)`
- diff de código: `git diff --stat` → vazio (nenhum arquivo tocado); `git status --short` → vazio.

## O que NÃO fiz e por quê
- NÃO FEITO: escalonamento de SLA — depende de migration (DDL) e/ou Edge/cron, proibidos no cartão; fora do que cabe em 1 defeito/1 camada. (É o mesmo residual já registrado na entrega anterior `0eb887c8a`.)
- NÃO FEITO: sticky por contato e regras por fila/peso com dry-run de rebalanceamento — também dependem de migration/Edge; ficam para trilha de banco.
- Não fiz `git cherry-pick` dos commits antigos: a correção já está na ponta por `cca1ed150`; trazer de novo criaria duplicata e conflito sem ganho de comportamento.
