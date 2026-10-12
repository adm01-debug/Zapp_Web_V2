Especialista: hugo

NÃO CONCLUÍ — BLOQUEADO por dependência: pai t_4e49a6dc não integrado (cenário 2 do cartão).

## O que foi conferido no código atual (dia/2026-10-11)
- `git merge-base --is-ancestor 0cb904cfe HEAD` → exit=1 (não ancestral); idem `d45670117`, e idem contra `dia/2026-10-11`. Commits existem no repositório mas não estão integrados na branch do dia.
- Pai t_4e49a6dc está `done` porém REJEITADO pelo revisor em 11/10 (falta teste "devolver pelo responsável não-admin"; correção pendente com commit novo).
- `grep -c "assume_conversation\|return_conversation_to_queue" src/integrations/supabase/types.ts` → 0 ocorrências (grep exit=1): RPCs ausentes nos tipos gerados.
- `src/hooks/inbox/useConversationTicketActions.ts` → inexistente (ls: No such file or directory).

## O que NÃO fiz e por quê
- Nenhum commit de código, conforme o cartão manda para o cenário 2: sem as RPCs integradas, o hook chamaria funções inexistentes e os testes de contrato falhariam por motivo errado (base ausente, não defeito do hook).
- PASSO 1 (rebase sobre o dia + aplicação do cherry-pick) não executado: aplicar o cherry-pick agora acoplaria este cartão ao retrabalho pendente do pai rejeitado; o correto é aguardar a reintegração do pai corrigido.
- Desbloqueio: quando `0cb904cfe`/`d45670117` (ou os commits corrigidos do pai) forem ancestrais de `dia/2026-10-11` e os nomes das RPCs constarem em `src/integrations/supabase/types.ts`, reabrir e executar o PASSO 1 + comando fixo do cartão.
