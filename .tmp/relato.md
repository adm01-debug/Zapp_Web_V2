Especialista: iris (telas e componentes)

## Como resolvi o motivo da retomada (conflito com a ponta do dia)

- Motivo registrado: "aprovado, mas CONFLITA com a ponta de dia/2026-10-12; segue para retomada por rebase".
- Workspace novo partiu da base **dia/2026-10-13** (que já é a ponta, à frente da 10-12).
- Trabalho anterior reaproveitado: branch `v2/refazer-painel-detalhes-tarefa-18834b02-26101118167b73`. Conferi que os cartões PAI já estão integrados na ponta do dia (não precisei trazê-los): `HEAD:src/components/tasks/TasksModule.tsx` já importa/envolve `TasksUiProvider` (linhas 13, 252, 401), `HEAD:src/hooks/tasks/workItem.types.ts:22` já tem `contact_type?:` e `HEAD:src/hooks/tasks/workItemFormat.ts` já existe (113 linhas). Logo, dos 14 commits daquela branch, só o commit PRÓPRIO deste cartão faltava na ponta.
- `git cherry-pick bfa8d991b8` (o commit do painel, etapas 132–136) → 1 conflito, só no bloco de imports de `WorkItemSheet.tsx`: a ponta (HEAD) importava `{ CheckCircle2, PauseCircle, X }` e o commit trazia `date-fns` + ícones a mais. Resolvi juntando os dois lados e mantendo SÓ os imports usados de fato no corpo mesclado: `{ ArrowUpRight, CalendarIcon, CheckCircle2, Maximize2, Minimize2, PauseCircle, X }` (descartei `format`/`ptBR`/`BellRing`/`ChevronDown`, que o corpo não usa — evitam import morto). Nenhuma linha da ponta foi perdida: todo o resto do arquivo fez auto-merge limpo.
- Ajuste só o necessário: `WorkItemSheet.tsx` (resolução do import), `WorkItemSheet.test.tsx` e `WorkItemSheet.painel.test.tsx` (testes do próprio commit, aplicados sem conflito). Nenhum outro arquivo tocado.

## O que mudou e por quê (etapas 132–136, pedido original)

- `src/components/tasks/shared/WorkItemSheet.tsx` — etapas 132 a 136:
  - **132**: cabeçalho "Detalhes da tarefa" (era "Editar tarefa"), ícone calendário em quadrado primary, botão expandir (`sheet-expandir`) que alarga o painel de 420px para `min(720px,90vw)`; fechar é o X que o próprio `SheetContent` já renderiza.
  - **133**: badges `StatusPill` + `PriorityPill` no topo (`sheet-badges`), lendo o estado/prioridade EDITADOS (acompanham o select).
  - **134**: título em input grande; Estado e Prioridade lado a lado (`grid-cols-2`) como selects, cada um com ponto colorido pelos tokens de `StatusPill`/`PriorityPill`; a opção "Fazendo" bloqueada pelo limite com a explicação no rótulo (`... está cheio (n/3)`).
  - **135**: caixa "Motivo da espera" só em Aguardando, borda âmbar (`border-warning/40`), selo "Obrigatório" (`sheet-motivo-obrigatorio`), erro inline (`sheet-motivo-erro`) e foco vindo de `focusField='waiting_reason'`.
  - **136**: Contato com avatar nas opções (`ContactAvatar` em wrapper `aria-hidden`) e botão "Abrir conversa" (`sheet-abrir-conversa`) chamando `openContactChat`; desabilitado sem contato.
- `src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` (novo): prova cada etapa renderizando o componente REAL.
- `src/components/tasks/__tests__/WorkItemSheet.test.tsx`: a Prioridade virou select (etapa 134); atualizei as 3 asserções que apontavam para os botões `sheet-prio-*`, sem afrouxar (as antigas checavam o clique, as novas o valor escolhido).

## Prova (vermelho antes, verde depois)

- vermelho antes: rebaixei SÓ a fonte para a versão da ponta (`git checkout HEAD~1 -- src/components/tasks/shared/WorkItemSheet.tsx`) e rodei
  `npx vitest run src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx` → `Test Files 1 failed (1); Tests 5 failed | 2 passed (7)` (faltavam `sheet-abrir-conversa`, `sheet-badges`, `sheet-expandir`, etc.).
- verde depois (fonte restaurada): `npx vitest run src/components/tasks/__tests__/WorkItemSheet.painel.test.tsx src/components/tasks/__tests__/WorkItemSheet.test.tsx` → `Test Files 2 passed (2); Tests 32 passed (32)`.
- `zapp-verify . --rapido`: verde (linha impressa pelo fechar).

## O que NÃO fiz e por quê

- Não recomecei o painel: reaproveitei o commit aprovado por cherry-pick.
- Não trouxe a faixa dos pais por cherry-pick porque já está na ponta do dia (provas acima) — trazê-la duplicaria commits.
- Etapas 137–140 (planejamento, validações, lembrete, descrição) são de outros cartões — não toquei.
- Persistir o "expandir" é outra etapa; aqui o controle só alterna a largura.
