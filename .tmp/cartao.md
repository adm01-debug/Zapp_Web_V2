Task t_673c0a22: feat(hooks): agrupamento do Quadro por prazo (opcional, D1)
  status:    running
  assignee:  hugo
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_673c0a22
  max-retries: 2 (default)
  created:   2026-10-11 14:09 by claude
  started:   2026-10-11 14:52
  parents:   t_17bbbc0f
  children:  t_0f94ac34

Body:
ESPECIALISTA DA ÁREA: hugo (hooks, estado e dados no front). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: hugo`.
Origem: plano `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (v2), aprovado pelo Joaquim em 11/10/2026 com as decisões D1 (Quadro por estado; agrupar por prazo opcional), D13 (tempo médio = da criação à conclusão) e D14 (painel de detalhes não modal). Enquanto o plano não estiver integrado na branch do dia, leia a cópia em `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (seções 3, 6 e 8-bis são a referência de aceite); as 5 imagens estão em `~/hermes-workspaces/.assets/tarefas/01.png` a `05.png` e a especificação visual do designer sai em `docs/tarefas/ESPECIFICACOES.md` (cartão T01). Antes de mexer, confira no código ATUAL o que já existe; se a etapa já estiver feita, prove no relato e não reescreva. Respeite `docs/design/TAREFAS_QUADRO_STATUS.md` (G-5 sem linguagem natural, G-6 limites, G-8 concluídas 7 dias, B13 uma query só, decisões declaradas). Sem migration, Edge Function ou dependência nova; nenhuma informação sai do sistema (sem exportar/baixar/imprimir).

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados na branch do dia. Se o que eles criam não estiver no seu workspace, ache cada commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges dia/2026-10-11..<sha>)`, na ordem dos pais. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

O QUE FAZER (etapas do plano)
- Etapa 101, Agrupar por prazo (opcional, D1): Selector das colunas Atrasadas, Para hoje, Fazendo e Concluídas da imagem 03; somente leitura, sem arrastar nesse agrupamento.

ARQUIVOS QUE PODE TOCAR
- src/hooks/tasks/workItemBoardGroups.ts (novo)
- src/hooks/tasks/__tests__/

CRITÉRIO DE PRONTO
1. Função pura que monta as colunas Atrasadas, Para hoje, Fazendo e Concluídas da imagem 03, somente leitura.
2. Todas as etapas acima feitas e conferidas contra as imagens e a seção 3 do plano (cite no relato a linha da tabela de cada elemento).
3. Testes unitários PRÓPRIOS deste cartão (vermelho antes, verde depois quando houver comportamento novo), listados no relato com o nome de cada caso.
4. zapp-verify . --rapido verde.


Comments (1):
  [2026-10-11 15:09] hugo: hotspot: src/hooks/tasks/workItemAggregates.ts — este cartão traz a faixa da mãe (t_17bbbc0f, commit 89d1048a4) por `git cherry-pick -x` (novo SHA 34b03465d), porque o cartão pai não estava na ponta de `dia/2026-10-11`. O irmão t_a3b84995 (memoização dos selectors) toca o MESMO arquivo e também cherry-picka 89d1048a4 — ao integrar os dois, o patch-id duplicado pode conflitar. Meu arquivo novo (workItemBoardGroups.ts) só LÊ o que já existe (bucketByDue/splitDoneByRecency), não altera contrato nem assinatura.

Events (25):
  [2026-10-11 14:52] [run 10403] spawned {'pid': 22388, 'started_at': '|179174117475'}
  [2026-10-11 14:53] [run 10403] heartbeat
  [2026-10-11 14:54] [run 10403] heartbeat
  [2026-10-11 14:55] [run 10403] heartbeat
  [2026-10-11 14:56] [run 10403] heartbeat
  [2026-10-11 14:57] [run 10403] heartbeat
  [2026-10-11 14:58] [run 10403] heartbeat
  [2026-10-11 14:59] [run 10403] heartbeat
  [2026-10-11 15:00] [run 10403] heartbeat
  [2026-10-11 15:01] [run 10403] heartbeat
  [2026-10-11 15:02] [run 10403] heartbeat
  [2026-10-11 15:03] [run 10403] heartbeat
  [2026-10-11 15:04] [run 10403] heartbeat
  [2026-10-11 15:05] [run 10403] heartbeat
  [2026-10-11 15:06] [run 10403] heartbeat
  [2026-10-11 15:07] [run 10403] heartbeat
  [2026-10-11 15:08] [run 10403] heartbeat
  [2026-10-11 15:09] commented {'author': 'hugo', 'len': 512}
  [2026-10-11 15:09] [run 10403] heartbeat
  [2026-10-11 15:10] [run 10403] heartbeat

Runs (1):
  #10403 running      @hugo  active  2026-10-11 14:52
