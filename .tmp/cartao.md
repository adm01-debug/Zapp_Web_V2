Task t_5b572e5a: feat(tarefas): arrastar polido, alvo de soltura, Aguardando, teclado e rolagem do Quadro
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_5b572e5a
  max-retries: 2 (default)
  created:   2026-10-11 14:11 by claude
  started:   2026-10-11 19:23
  parents:   t_4a22e0a4
  children:  t_52e80bd2

Body:
ESPECIALISTA DA ÁREA: iris (telas e componentes). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: iris`.
Origem: plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (v2), aprovado pelo Joaquim em 11/10/2026 com as decisões D1 (Quadro por estado; agrupar por prazo opcional), D13 (tempo médio = da criação à conclusão) e D14 (painel de detalhes não modal). Enquanto o plano não estiver integrado na branch do dia, leia a cópia em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (seções 3, 6 e 8-bis são a referência de aceite); as 5 imagens estão em `~/hermes-workspaces/.assets/tarefas/01.png` a `05.png` e a especificação visual do designer sai em `docs/tarefas/ESPECIFICACOES.md` (cartão T01). Antes de mexer, confira no código ATUAL o que já existe; se a etapa já estiver feita, prove no relato e não reescreva. Respeite `docs/design/TAREFAS_QUADRO_STATUS.md` (G-5 sem linguagem natural, G-6 limites, G-8 concluídas 7 dias, B13 uma query só, decisões declaradas). Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir).

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados na branch do dia. Se o que eles criam não estiver no seu workspace, ache cada commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges dia/2026-10-11..<sha>)`, na ordem dos pais. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

REGRAS DE TELA: só tokens do sistema (nenhuma cor literal), claro, escuro e skins; framer-motion só em transform/opacity com `useReducedMotion`; alvos de pelo menos 40 px; teclado completo e foco visível; contraste AA; sem rolagem horizontal em 360, 768 e 1280 px. Use os primitivos de `src/components/tasks/shared/` (TaskCheckbox, PriorityPill, StatusPill, DateLabel, ContactAvatar, cartão T11) e as funções de `src/hooks/tasks/workItemFormat.ts`/`workItemPresets.ts` (cartão T04) em vez de reimplementar. Não altere `src/components/ui/*` (componentes compartilhados do app).

O QUE FAZER (etapas do plano)
- Etapa 094, Polimento do arrastar: Placeholder tracejado, overlay elevado (`--shadow-lg`), rolagem horizontal automática e encaixe animado; `resolveDragEnd` mantido. No toque, arrastar só com pressão longa (`pointerMedia` existente) para não brigar com a rolagem.
- Etapa 095, Alvo de soltura: Coluna de destino com borda primary e dica "Solte para mover para Fazendo (2 de 3)".
- Etapa 096, Soltar em Aguardando: Abre o painel pedindo o motivo (comportamento atual), com a coluna realçada em âmbar durante o arrasto.
- Etapa 097, Teclado do Quadro: ←/→ entre colunas, ↑/↓ entre cartões, Alt+←/→ move o cartão, Enter abre; a narração "Movida para … (n de limite)" já existe e é preservada.
- Etapa 098, Rolagem horizontal: Rolagem fluida com snap, sombra nas bordas e rolagem vertical interna por coluna.

ARQUIVOS QUE PODE TOCAR
- src/components/tasks/board/
- src/components/tasks/shared/pointerMedia.ts (somente se precisar)
- src/components/tasks/__tests__/ (testes novos ou existentes)

CRITÉRIO DE PRONTO
1. Todas as etapas acima feitas e conferidas contra as imagens e a seção 3 do plano (cite no relato a linha da tabela de cada elemento).
2. Testes unitários PRÓPRIOS deste cartão (vermelho antes, verde depois quando houver comportamento novo), listados no relato com o nome de cada caso.
3. zapp-verify . --rapido verde.


Events (27):
  [2026-10-11 19:24] [run 10576] heartbeat
  [2026-10-11 19:25] [run 10576] heartbeat
  [2026-10-11 19:26] [run 10576] heartbeat
  [2026-10-11 19:27] [run 10576] heartbeat
  [2026-10-11 19:28] [run 10576] heartbeat
  [2026-10-11 19:29] [run 10576] heartbeat
  [2026-10-11 19:30] [run 10576] heartbeat
  [2026-10-11 19:31] [run 10576] heartbeat
  [2026-10-11 19:32] [run 10576] heartbeat
  [2026-10-11 19:33] [run 10576] heartbeat
  [2026-10-11 19:34] [run 10576] heartbeat
  [2026-10-11 19:35] [run 10576] heartbeat
  [2026-10-11 19:36] [run 10576] heartbeat
  [2026-10-11 19:37] [run 10576] heartbeat
  [2026-10-11 19:38] [run 10576] heartbeat
  [2026-10-11 19:39] [run 10576] heartbeat
  [2026-10-11 19:40] [run 10576] heartbeat
  [2026-10-11 19:41] [run 10576] heartbeat
  [2026-10-11 19:42] [run 10576] heartbeat
  [2026-10-11 19:43] [run 10576] heartbeat

Runs (1):
  #10576 running      @iris  active  2026-10-11 19:23
