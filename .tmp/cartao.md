ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: iris`.
Origem: plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (v2), aprovado pelo Joaquim em 11/10/2026 com as decisões D1 (Quadro por estado; agrupar por prazo opcional), D13 (tempo médio = da criação à conclusão) e D14 (painel de detalhes não modal). Enquanto o plano não estiver integrado na branch do dia, leia a cópia em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (seções 3, 6 e 8-bis são a referência de aceite); as 5 imagens estão em `~/hermes-workspaces/.assets/tarefas/01.png` a `05.png` e a especificação visual do designer sai em `docs/tarefas/ESPECIFICACOES.md` (cartão T01). Antes de mexer, confira no código ATUAL o que já existe; se a etapa já estiver feita, prove no relato e não reescreva. Respeite `docs/design/TAREFAS_QUADRO_STATUS.md` (G-5 sem linguagem natural, G-6 limites, G-8 concluídas 7 dias, B13 uma query só, decisões declaradas). Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir).

DEPENDÊNCIA (CORREÇÃO [claude] 12/10: a branch viva é dia/2026-10-12; use a base do PRÓPRIO PAI): este cartão parte do trabalho dos cartões pai (t_a332243d sha 8f96fa5c7 base dia/2026-10-11; t_17bbbc0f sha 89d1048a4 base dia/2026-10-11; t_2a65fbc1 sha c572842a3 base dia/2026-10-11). Se o que eles criam não estiver no seu workspace, ache cada commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do pai>..<sha do pai>)`, na ordem dos pais. Antes, confira `git merge-base --is-ancestor <sha> HEAD`: se o pai já está integrado na sua base, NÃO traga nada. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

REGRAS DE TELA: só tokens do sistema (nenhuma cor literal), claro, escuro e skins; framer-motion só em transform/opacity com `useReducedMotion`; alvos de pelo menos 40 px; teclado completo e foco visível; contraste AA; sem rolagem horizontal em 360, 768 e 1280 px. Use os primitivos de `src/components/tasks/shared/` (TaskCheckbox, PriorityPill, StatusPill, DateLabel, ContactAvatar, cartão T11) e as funções de `src/hooks/tasks/workItemFormat.ts`/`workItemPresets.ts` (cartão T04) em vez de reimplementar. Não altere `src/components/ui/*` (componentes compartilhados do app).

O QUE FAZER (etapas do plano)
- Etapa 050, Componente TasksListTable: Novo `list/TasksListTable.tsx` com semântica de tabela, cabeçalho fixo e grupos como linhas de seção.
- Etapa 051, Linha de grupo: Ícone circular por grupo (Atrasadas alerta vermelho, Hoje relógio âmbar, Amanhã/Próximas calendário, Sem prazo círculo, Concluídas check verde), contador e subtítulo de data em Hoje.
- Etapa 053, Célula Tarefa: Checkbox circular (conclui/reabre), título em uma linha com tooltip e subtítulo âmbar com o motivo quando Aguardando.
- Etapa 054, Célula Contato: Avatar com iniciais e nome; "Sem contato" discreto; clique abre a conversa (`openContactChat`).

ARQUIVOS QUE PODE TOCAR
- src/components/tasks/list/TasksListTable.tsx (novo)
- src/components/tasks/list/TasksListMode.tsx (passa a renderizar a tabela; a montagem no TasksModule não muda)
- src/components/tasks/__tests__/ (testes novos ou existentes)

CRITÉRIO DE PRONTO
1. Todas as etapas acima feitas e conferidas contra as imagens e a seção 3 do plano (cite no relato a linha da tabela de cada elemento).
2. Testes unitários PRÓPRIOS deste cartão (vermelho antes, verde depois quando houver comportamento novo), listados no relato com o nome de cada caso.
3. zapp-verify . --rapido verde.

ESTADO AO RETOMAR (12/10, workspace REUSADO v2/lista-tabela-estrutura-grupos-tarefa-con-2610111750e6a7): a faixa dos 3 pais já está na branch via cherry-pick e o trabalho deste cartão está nos commits do topo `66a5dead7 feat(tasks): lista em tabela com grupos de tarefa por contato` (+ `05b9fbaf7` relato). A execução anterior (iris) provou: `npx vitest run src/components/tasks src/hooks/tasks` → 34 arquivos / 395 testes passando; par isolado da Lista → 17 passed; tsc e eslint limpos; vermelho antes com a Lista antiga → 3 failed | 13 passed. NÃO reescreva o que está pronto: confira, rode a verificação e finalize.
