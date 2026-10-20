Task t_f0f3cbc2: Implementar alternância lista/grade na biblioteca TalkX
  status:    running
  assignee:  iris
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_bd0c4d98
  max-retries: 2 (default)
  created:   2026-10-12 09:45 by auto-decomposer
  started:   2026-10-12 18:56
  children:  t_6e8cb732, t_bd0c4d98

Body:
Objetivo: permitir alternar entre visualização em lista e em grade na biblioteca de segmentos TalkX, reaproveitando o cartão/lista criado em X112 sem duplicar componente visual.

Arquivos permitidos (não tocar em outros; achado fora vira comentário no cartão):
- src/components/talkx/TalkXSegments.tsx
- src/hooks/integrations/useTalkXSegments.ts
- src/components/talkx/**/TalkXSegments*.test.*
- src/hooks/integrations/**/useTalkXSegments*.test.*

Abordagem:
- Adicione estado de modo de visualização (lista/grade) no hook useTalkXSegments e exponha-o ao componente.
- Renderize o mesmo cartão/lista de X112 nos dois modos, apenas mudando o layout/container (grid vs lista). Não crie um segundo componente visual.
- Persista a preferência de modo se já houver padrão no projeto; caso contrário mantenha em estado local.

Critérios de aceite:
- Alternância funciona e reutiliza o componente de X112.
- Teste de componente/hook prova a alternância lista/grade; fica vermelho sem a mudança e verde com ela.
- Trabalhe test-first (TDD) e rode `zapp-verify . --rapido` antes de declarar pronto.

Latest summary:
Área errada + dependência ausente na base. (1) Cartão é de components/hooks (TalkXSegments.tsx + useTalkXSegments.ts): o perfil certo é iris (hooks: hugo), não worker geral. (2) O critério manda reaproveitar o SegmentSideList de X112, que NÃO existe na base atual (HEAD 99aa53ff7): git grep -l SegmentSideList HEAD -- src -> nenhum; src/components/talkx/segments só tem RuleRow/TalkXSegmentBuilder/reducer/validation; git grep -l talkx_segment_bulk_action HEAD -- supabase src -> nenhum. X112 (5918f7d9b), TL-135c (a5dc5793a) e a RPC bulk (a7d37fd36) estão done mas nunca entraram em branch dia/. Desbloqueia levando 2610090236b633 + 26100906070806 + 26100903338b9c para dia/2026-10-12 e reatribuindo a iris. Prova no comentário 10903; não toquei em arquivos.

Comments (2):
  [2026-10-12 18:58] worker: Especialista: worker (geral). Bloqueio de capability — dois motivos independentes, ambos provados agora na base.

**1) Não é área do worker.** O cartão é `· área components ·` (pai `t_bd0c4d98`), tocando `src/components/talkx/TalkXSegments.tsx` e `src/hooks/integrations/useTalkXSegments.ts`. Componentes → `iris`; hooks/estado → `hugo`. O worker (geral) não pega cartão de área técnica por tentativa (regra do meu perfil). O próprio pai já foi trabalhado por `iris`. Perfil certo: **iris** (o alternador é UI; `t_3f4fb8ba`, a fatia de UI irmã, já está com iris).

**2) A dependência exigida pelo cartão NÃO está na base — não é implementável hoje.** O critério 1 manda reaproveitar o cartão/lista de X112 (`SegmentSideList`/`SegmentCard`) "sem duplicar componente visual". Prova na base atual (HEAD do repo de referência, `99aa53ff7`, branch do dia/2026-10-12):

```
git grep -l "SegmentSideList"  HEAD -- src   -> NENHUM
git ls-tree -r --name-only HEAD -- src/components/talkx/segments
  -> RuleRow.tsx, TalkXSegmentBuilder.tsx, segmentBuilderReducer.ts, segmentValidation.ts
     (NÃO existe SegmentSideList.tsx)
git grep -l "talkx_segment_bulk_action" HEAD -- supabase src -> NENHUM
```

Ou seja: X112 (`t_ae6d5374`, commit `5918f7d9b`), TL-135c (`t_ceb242af`, `a5dc5793a`) e a RPC de ações em massa (`t_9c7ad8fc`, `a7d37fd36`) estão `done`, mas **nunca entraram em nenhuma branch `dia/`** — seguem na fila do integrador desde 2026-10-09 (já registrado pelo `complexo` em 12/10 09:39, comentário 10040 do pai). Sem o `SegmentSideList` na base o cartão não compila e reimplementá-lo aqui estouraria o teto de 90k do `hermes-tarefa-fechar` (o pai já foi recusado com diff de 115.853 caracteres por isso).

**O que falta para desbloquear:** o integrador levar `2610090236b633` (X112) + `26100906070806` (TL-135c) + `26100903338b9c` (RPC bulk) para `dia/2026-10-12`, e o cartão ir para `iris`. Não toquei em nenhum arquivo.
  [2026-10-13 15:09] iris: Dependência do cartão (`reaproveitando o cartão/lista criado em X112`): o arquivo `src/components/talkx/segments/SegmentSideList.tsx` (lista lateral "Meus Segmentos", criada pela TL-134/X112, commits 5918f7d9bd / dd6c21eca4) NÃO existe na base `dia/2026-10-13` deste workspace — `git grep SegmentSideList -- src` volta vazio e `git merge-base --is-ancestor <commit TL-134> HEAD` = não. Sem o arquivo na base não há como reutilizá-lo sem trazer trabalho de outro cartão (escopo do integrador). Entreguei o objetivo do cartão (alternar lista/grade sem duplicar o visual) com UM único `SegmentCard` servindo aos dois modos, contêiner `flex-col` x `grid`, estado no hook. Quando a X112 entrar na base, a alternância continua válida. Falta para o integrador: integrar a lista lateral (TL-134/X112).

Events (47):
  [2026-10-13 14:51] reprioritized {'priority': 9}
  [2026-10-13 14:54] [run 12576] claimed {'lock': 'Joaquim:28972', 'expires': 1791914982, 'run_id': 12576}
  [2026-10-13 14:54] [run 12576] spawned {'pid': 39904, 'started_at': '|179191408254'}
  [2026-10-13 14:54] [run 12576] heartbeat
  [2026-10-13 14:55] [run 12576] heartbeat
  [2026-10-13 14:56] [run 12576] heartbeat
  [2026-10-13 14:57] [run 12576] heartbeat
  [2026-10-13 14:58] [run 12576] heartbeat
  [2026-10-13 14:59] [run 12576] heartbeat
  [2026-10-13 15:00] [run 12576] heartbeat
  [2026-10-13 15:02] [run 12576] heartbeat
  [2026-10-13 15:03] [run 12576] heartbeat
  [2026-10-13 15:04] [run 12576] heartbeat
  [2026-10-13 15:05] [run 12576] heartbeat
  [2026-10-13 15:06] [run 12576] heartbeat
  [2026-10-13 15:07] [run 12576] heartbeat
  [2026-10-13 15:08] [run 12576] heartbeat
  [2026-10-13 15:09] commented {'author': 'iris', 'len': 793}
  [2026-10-13 15:09] [run 12576] heartbeat
  [2026-10-13 15:10] [run 12576] heartbeat

Runs (2):
  #11288 blocked      @worker  134s  2026-10-12 18:56
        → Área errada + dependência ausente na base. (1) Cartão é de components/hooks (TalkXSegments.tsx + useTalkXSegments.ts): o perfil certo é iris (hooks: hugo), não 
  #12576 running      @iris  active  2026-10-13 14:54
