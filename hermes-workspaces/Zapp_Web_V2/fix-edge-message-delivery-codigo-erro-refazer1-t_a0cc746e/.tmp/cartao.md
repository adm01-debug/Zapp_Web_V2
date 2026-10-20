Task t_996e42f2: fix(edge): message-delivery devolve código de erro estável, se é retentável e se é ambíguo
  status:    running
  assignee:  edgar
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_996e42f2
  max-retries: 2 (default)
  created:   2026-10-13 07:48 by claude
  started:   2026-10-13 09:45
  parents:   t_8c6419cf
  children:  t_03f31642, t_ecd45534

Body:
ESPECIALISTA DA ÁREA: edgar (Edge Functions). Abra a skill de área do seu perfil antes de editar. A PRIMEIRA LINHA do `.tmp/relato.md` deve ser EXATAMENTE `Especialista: edgar`; o relato diz o que mudou, o comando de verificação rodado e a linha de resultado (ex.: `Test Files 3 passed, Tests 27 passed`), sem 'parcial'.
CONTEXTO: segunda passada da auditoria de paridade V3 -> V2 do doc docs/estado/06-features-inbox-hooks.md (hooks do inbox) (plano em `docs/plans/PLANO_PARIDADE_V3_HOOKS_INBOX_PASSADA2_2026-10-13.md`; enquanto não integrado: `~/hermes-workspaces/.assets/paridade-docs/`). A V3 é só REFERÊNCIA (repositório em `~/projetos/Zapp_Web_V3`, leia com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`); a V2 costuma estar melhor: NÃO devolva o que a V2 já faz melhor. FORA DE ESCOPO (decisões do dono): tags/etiquetas de contato ou conversa (função excluída do sistema), exportar/importar/edição em massa, ciclo de vida de negócios (criar/editar/ganhar/perder deal), SLA de Resolução, webhook externo de alerta, persistir QR no navegador. Os achados abaixo foram CONFERIDOS no código da branch viva e no banco real em 13/10/2026; antes de editar, confirme no código ATUAL (a branch do dia muda) e, se algo já estiver feito, prove no relato.
REGRAS: o cartão compila e passa sozinho (`zapp-verify . --rapido` verde); atualize ou crie testes dos arquivos que tocar e liste-os no relato; sem dependência nova; migrations só ADITIVAS, com `-- Rollback:` completo no topo, `SET search_path` e grants explícitos, e PROVA no banco LOCAL com o papel real (agent/anon/service_role) mostrando o que passa e o que é negado; NADA vai para produção (quem aplica é o Joaquim). Texto de interface em pt-BR; nada novo que exporte, baixe, copie ou imprima dados; sem log de telefone, token ou texto de mensagem.

DEPENDÊNCIA: este cartão parte do trabalho dos cartões pai, que podem estar done mas NÃO integrados. Se o que eles fazem não estiver no seu workspace, ache o commit em `~/hermes-workspaces/.v2-fila/*.json` (campo `cartao` = id do pai) e traga a FAIXA inteira: `git cherry-pick --empty=drop $(git rev-list --reverse --no-merges <base_dia do JSON do pai>..<sha do pai>)`; se `git merge-base --is-ancestor <sha> HEAD` já for verdade, não traga. Só bloqueie se houver conflito que você não resolva, dizendo o arquivo.

PROBLEMA (evidência conferida)
`errorResponse` (`supabase/functions/_shared/validation.ts:~161`) troca o corpo por 'Internal server error' para TODO status >= 500 (conferido). `message-delivery` devolve 502 para recusa do provedor, recibo inválido, falha ao gravar recibo e exceção depois do POST: o cliente nunca sabe a causa nem se a mensagem pode ter saído. Hoje 'número inválido' e 'instância desconectada' mostram a mesma frase, e uma falha AMBÍGUA (POST saiu, resposta se perdeu) é igual a uma falha definitiva: 'Enviar de novo' pode duplicar a mensagem do cliente. EV1, M2 e PD-79 cobrem só parte (EV1 traduz no cliente; M2 grava no banco; PD-79 cria a marca 'POST iniciado' que ninguém expõe).

O QUE FAZER
1. Em `message-delivery`, responda JSON `{ error, code, retryable, ambiguous }` com `code` estável (`invalid_number`, `instance_unavailable`, `provider_rejected`, `provider_unavailable`, `rate_limited`, `in_progress`, `receipt_unconfirmed`, `media_invalid`). Use 4xx/409/422 quando a causa é do pedido; para 5xx use `jsonResponse` direto com `code`/`ambiguous` (a mensagem livre continua omitida). SEM telefone, token ou texto da mensagem no corpo nem no log.
2. `ambiguous=true` SOMENTE quando o POST ao provedor já saiu (use a marca do PD-79 se já integrada; senão derive do ponto do código) e a confirmação falhou.
3. Testes Deno por ramo: cada caminho devolve o `code` certo, `retryable`/`ambiguous` corretos e nenhum dado pessoal.

ARQUIVOS QUE PODE TOCAR
- supabase/functions/message-delivery/index.ts
- supabase/functions/message-delivery/index.test.ts
- supabase/functions/_shared/validation.ts (só se necessário, sem mudar o comportamento dos outros chamadores)

CRITÉRIO DE PRONTO
1. Cada ramo de falha devolve code/retryable/ambiguous testados.
2. Outras Edge Functions que usam `errorResponse` não mudam de comportamento.
3. `zapp-verify . --rapido` verde.


Events (24):
  [2026-10-13 09:45] [run 12370] spawned {'pid': 17316, 'started_at': '|179189552361'}
  [2026-10-13 09:45] [run 12370] heartbeat
  [2026-10-13 09:46] [run 12370] heartbeat
  [2026-10-13 09:47] [run 12370] heartbeat
  [2026-10-13 09:48] [run 12370] heartbeat
  [2026-10-13 09:49] [run 12370] heartbeat
  [2026-10-13 09:50] [run 12370] heartbeat
  [2026-10-13 09:51] [run 12370] heartbeat
  [2026-10-13 09:52] [run 12370] heartbeat
  [2026-10-13 09:53] [run 12370] heartbeat
  [2026-10-13 09:54] [run 12370] heartbeat
  [2026-10-13 09:55] [run 12370] heartbeat
  [2026-10-13 09:57] [run 12370] heartbeat
  [2026-10-13 09:58] [run 12370] heartbeat
  [2026-10-13 09:59] [run 12370] heartbeat
  [2026-10-13 10:00] [run 12370] heartbeat
  [2026-10-13 10:01] [run 12370] heartbeat
  [2026-10-13 10:03] [run 12370] heartbeat
  [2026-10-13 10:04] [run 12370] heartbeat
  [2026-10-13 10:05] [run 12370] heartbeat

Runs (1):
  #12370 running      @edgar  active  2026-10-13 09:45
