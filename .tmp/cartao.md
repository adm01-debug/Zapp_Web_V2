Task t_5bc23b97: [retomar] test(ai-transcribe-audio): trava contrato de auth antes do download
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_5bc23b97
  max-retries: 2 (default)
  created:   2026-10-10 16:13 by claude
  started:   2026-10-10 16:18

Body:
RETOMAR (entrega parada na fila do integrador, resgatada em 10/10). Esta entrega NÃO entrou e o trabalho não pode se perder.

SITUAÇÃO: estado 'falhou', junta limpo hoje com dia/2026-10-10.
MOTIVO REGISTRADO: teste que o CI do GitHub roda passou a FALHAR com este cartão: contrato: tests/contracts/_adv_edge_legacy_producers.test.ts; — rode: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 <arquivo>

O QUE FAZER: a entrega anterior falhou na verificação: reproduza com `zapp-verify full .`, corrija e feche de novo. Antes de mexer, confira no código ATUAL se o defeito do pedido ainda existe; se já foi corrigido, escreva isso em .tmp/relato.md com a prova e feche sem commit de código.

TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/t-604d45a5-26100915148f98` (commit 4dbacaa80) no repositório; no workspace novo traga os commits com `git cherry-pick` e ajuste só o necessário.

PEDIDO ORIGINAL:
· área edge ·

PROBLEMA
O item 088 ficou misturado no SL-195 original. A função `supabase/functions/ai-transcribe-audio/index.ts` escolhe o `mimeType` pelo `contentType` informado ou pela extensão, mas o detector real por magic bytes já existe em `supabase/functions/_shared/messaging/media.ts`. Isso permite classificar áudio de forma frágil quando o cabeçalho do arquivo diverge do metadado.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/ai-transcribe-audio/index.ts
- supabase/functions/_shared/messaging/media.ts
- supabase/functions/ai-transcribe-audio/*.test.ts (novo ou existente)
- supabase/functions/_shared/messaging/*.test.ts (novo ou existente)
Fora desta lista: não tocar. Achado em outro arquivo vira comentário no cartão.

CRITÉRIO DE PRONTO
1. `ai-transcribe-audio` usa magic bytes do arquivo para escolher o tipo de mídia antes de confiar em `contentType` ou extensão.
2. Há teste com metadado divergente provando que o magic bytes vence o cabeçalho informado.
3. O teste do defeito fica vermelho sem a correção e verde com ela.
4. `zapp-verify . --rapido` verde.

Observação de coordenação: este cartão substitui apenas o item 088 do SL-195 original (`t_b13a7237`).

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo no relato como resolveu cada ponto da recusa.

Feche com hermes-tarefa-fechar "<tipo>(<escopo>): <título>" .tmp/relato.md, dizendo como resolveu o motivo acima. REGRAS: nenhuma informação sai do sistema; só cores/tokens existentes; sem DDL/Edge/dependência nova salvo se o pedido original exigia.

Events (14):
  [2026-10-10 16:13] created {'assignee': 'edgar', 'status': 'ready', 'parents': [], 'creator_task_id': None, 'tenant': None, 'workspace_kind': 'scratch', 'workspace_path': None, 'branch_name': None, 'project_id': None, 'skills': None, 'goal_mode': None, 'model_override': None, 'provider_override': None}
  [2026-10-10 16:14] reprioritized {'priority': 9}
  [2026-10-10 16:18] [run 9806] claimed {'lock': 'Joaquim:16708', 'expires': 1791660808, 'run_id': 9806}
  [2026-10-10 16:18] [run 9806] spawned {'pid': 18888, 'started_at': '|179165990835'}
  [2026-10-10 16:18] [run 9806] heartbeat
  [2026-10-10 16:19] [run 9806] heartbeat
  [2026-10-10 16:20] [run 9806] heartbeat
  [2026-10-10 16:21] [run 9806] heartbeat
  [2026-10-10 16:22] [run 9806] heartbeat
  [2026-10-10 16:23] [run 9806] heartbeat
  [2026-10-10 16:24] [run 9806] heartbeat
  [2026-10-10 16:25] [run 9806] heartbeat
  [2026-10-10 16:26] [run 9806] heartbeat
  [2026-10-10 16:27] [run 9806] heartbeat

Runs (1):
  #9806 running      @edgar  active  2026-10-10 16:18
