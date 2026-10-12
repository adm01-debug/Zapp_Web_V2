Especialista: senior (area-sql-banco + area-edge-api)

Ponto 1 — DB-INVENTORY / ci_espelho
O que mudei:
- Não alterei `docs/DB-INVENTORY.md`, porque o catálogo versionado atual já está coerente com o documento.
- Alterei `.github/workflows/db-guard.yml` para incluir `scripts/db-audit/inbound-effects-replay.test.sh` no job db-guard; assim a prova SQL nova entra no espelho do CI.
Teste/prova:
- `node --test scripts/ci/db-inventory-doc.unit.mjs` -> `tests 15`, `pass 15`, `fail 0`, incluindo `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO`, com `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`.
- Tentei o comando literal `bash /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .`; ele foi bloqueado pela guarda local antes de executar por tentar escrever fora do workspace em área de ferramenta/integração. Não contornei a guarda e não declarei esse comando como verde.

Ponto 2 — garantias removidas: reason/code/origin, gate real de 30 dias e opt-out sem envio
O que mudei:
- `scripts/db-audit/inbound-effects-replay.test.sh` agora executa PostgreSQL real e prova `p_reason`, `p_reason_code`, `p_origin`, `p_source_message_id` e o gate real de 30 dias dentro de `drain_inbound_message_effects`.
- Mantive os testes Deno de Talk X para a superfície da Edge: sem envio em 30 dias não suprime nem envia autoresposta; opt-out não vira atribuição.
Teste/prova:
- `bash scripts/db-audit/inbound-effects-replay.test.sh` -> passou com:
  - `[PASS] opt-out usa assinatura correta da RPC (= Opt-out via mensagem: SAIR|opt_out|auto_optout|1)`
  - `[PASS] opt-out sem envio em 30 dias nao suprime (= no_recent_send|0)`
  - `[PASS] inbound-effects replay SQL test completo`
- `deno test --allow-env supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` -> `ok | 16 passed | 0 failed`.

Ponto 3 — replay próprio sem regressão no ingest original
O que mudei:
- Em `supabase/migrations/20261005224959_inbound_message_effects_outbox.sql`, corrigi o drain para só aplicar efeitos quando a mensagem canônica em `public.messages` é de contato; replay/stale de mensagem própria drena a outbox sem chamar atribuidores.
- Restaurei a semântica original de `outcome = updated`: quando uma mensagem de contato já existe, o ingest volta a atualizar `content`, `message_type`, `media_url` e preservar `status/content` de mensagem apagada.
Teste/prova:
- `bash scripts/db-audit/inbound-effects-replay.test.sh` -> passou com:
  - `[PASS] reentrega com dados novos retorna updated (= updated)`
  - `[PASS] outcome updated preserva conteudo/media_url canonicos (= conteudo editado|image|https://cdn.local/editada.jpg)`
  - `[PASS] mensagem apagada reprocessada retorna updated (= updated)`
  - `[PASS] mensagem apagada preserva conteudo e atualiza media_url sem reviver texto (= [Mensagem apagada]|deleted|image|https://cdn.local/deleted.jpg)`
  - `[PASS] fromMe=true nao enfileira efeitos (= 0)`
  - `[PASS] replay/stale de mensagem propria nao toca contadores (= 0)`
  - `[PASS] replay/stale de mensagem propria fica drenado sem retry infinito (= 2|0)`
- `supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` também passou e cobre falha/reentrega sem meia escrita e fromMe=true sem atribuição.

Ponto 4 — comentários/docblocks removidos fora da correção
O que mudei:
- `supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts`: restaurei o docblock X030 completo no topo, incluindo R2-API-008.
- `supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts`: restaurei o docblock X028 completo no topo.
- `supabase/functions/_shared/evolution-webhook-messages.ts`: restaurei comentários explicativos X030/E57/X028/R2-API-008/E59/F62 junto ao fluxo migrado para `drain_inbound_message_effects`.
Teste/prova:
- `deno test --allow-env supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` -> `ok | 16 passed | 0 failed`.
- `jev-juiz pronto .tmp/relato.md` -> `nada a apontar no diff (10 arquivos) nem no relato. Pode fechar.` antes de restaurar o status limpo; depois o relato foi regravado com estes mesmos pontos e as provas novas do SQL.

Ponto 5 — relato corrigido e comentário Multiplix
O que mudei:
- `supabase/functions/_shared/evolution-webhook-messages.ts`: substituí o comentário solto sobre `multiplix_recipients` por comentário correto: o drain delega ao `attribute_multiplix_item_reply`; linked usa `multiplix_delivery_items.external_id`; inferred cruza itens com `multiplix_recipients.destino_e164`.
- Este relato lista os testes realmente executados e não trata o `ci_espelho.sh` literal como verde.
Teste/prova:
- Os mesmos 16 testes Deno passaram.
- O teste SQL real passou até o rollback.

Arquivos do diff (`git diff --name-only dia/2026-10-12...HEAD`):
.github/workflows/db-guard.yml
.tmp/relato.md
scripts/db-audit/inbound-effects-replay.test.sh
supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts
supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts
supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts
supabase/functions/_shared/evolution-webhook-messages.ts
supabase/functions/whatsapp-webhook/index.test.ts
supabase/functions/whatsapp-webhook/index.ts
supabase/migrations/20261005224959_inbound_message_effects_outbox.sql

Verificações finais executadas:
- `bash scripts/db-audit/inbound-effects-replay.test.sh` -> todos os `[PASS]`, incluindo rollback comentado executável.
- `deno test --allow-env supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts` -> `ok | 16 passed | 0 failed`.
- `node --test scripts/ci/db-inventory-doc.unit.mjs` -> `pass 15`, `fail 0`.
- `git diff --check` -> sem saída, exit 0.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO`.

O que não fiz:
- Não editei `docs/DB-INVENTORY.md`, porque a prova do inventário passou contra o catálogo versionado atual.
- Não contornei a guarda para forçar `ci_espelho.sh`; registrei o bloqueio literal e rodei as provas executáveis equivalentes dentro do workspace.