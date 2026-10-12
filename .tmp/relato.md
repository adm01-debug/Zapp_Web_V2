Especialista: senior (area-sql-banco + area-edge-api)

Ponto 1 — DB-INVENTORY / ci_espelho
O que mudei:
- Não alterei `docs/DB-INVENTORY.md`, porque o catálogo versionado atual já passa no teste executável do inventário: `node --test scripts/ci/db-inventory-doc.unit.mjs` com 15/15 testes verdes.
- Incluí o teste SQL real `scripts/db-audit/inbound-effects-replay.test.sh` no espelho do guard em `.github/workflows/db-guard.yml`, para a regressão do outbox inbound rodar no CI.
- Tentei o comando literal `bash /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .`; a guarda do Hermes bloqueou antes de executar porque o script tenta escrever fora do workspace ao registrar pendências globais. Por isso o que falta é apenas o verde literal do `ci_espelho`; a prova substituta usada aqui é o teste do DB-INVENTORY, o teste SQL real e `zapp-verify --rapido`.
Prova:
- Vermelho anterior: a recusa apontava falta de prova DB-INVENTORY/ci_espelho.
- Verde agora: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> 15 pass, 0 fail.
- Verde agora: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (16s)` com `db_guard`, `tipos`, `lint` e `migrations` OK.

Ponto 2 — opt-out não reexecuta por replay e conserva o gate de 30 dias
O que mudei:
- `supabase/migrations/20261005224959_inbound_message_effects_outbox.sql`: a função `drain_inbound_message_effects` só drena efeitos pendentes de mensagem recebida, nunca efeito de mensagem própria/replay stale.
- `scripts/db-audit/inbound-effects-replay.test.sh`: adiciona prova PostgreSQL real para `p_reason`, `p_reason_code`, `p_origin`, `fromMe=true` sem efeitos e gate sem envio Talk X nos últimos 30 dias.
Prova:
- Vermelho anterior: replay/fromMe podia cair no drain como resposta nova; o SQL real não provava assinatura da RPC nem o gate de 30 dias.
- Verde agora: `bash scripts/db-audit/inbound-effects-replay.test.sh` -> `[PASS] opt-out usa assinatura correta da RPC (= Opt-out via mensagem: SAIR|opt_out|auto_optout|1)` e `[PASS] opt-out sem envio em 30 dias nao suprime (= no_recent_send|0)`.
- O mesmo teste também passa `fromMe=true nao enfileira efeitos`, `fromMe=true nao chama atribuidores`, `replay/stale de mensagem propria nao toca contadores` e `replay/stale de mensagem propria fica drenado sem retry infinito`.

Ponto 3 — preservar update canônico de mensagem sem reativar efeito
O que mudei:
- `supabase/migrations/20261005224959_inbound_message_effects_outbox.sql`: restaurei o caminho `outcome = 'updated'` para mensagem recebida existente; ele atualiza conteúdo, tipo e `media_url`, preserva conteúdo de mensagem apagada e desliga apenas o trigger `update_messages_updated_at` durante esse update para manter `updated_at` original.
- O mesmo SQL mantém `ON CONFLICT` dos efeitos, então replay de uma mensagem já drenada não reabre efeitos.
Prova:
- Vermelho intermediário: `bash scripts/db-audit/inbound-effects-replay.test.sh` falhou com `reentrega com dados novos retorna updated: esperado 'updated', obtido 'duplicate'`.
- Verde agora: o mesmo comando passa `reentrega com dados novos retorna updated`, `outcome updated preserva conteudo/media_url canonicos`, `mensagem apagada reprocessada retorna updated`, `mensagem apagada preserva conteudo e atualiza media_url sem reviver texto` e `mensagem atualizada preserva updated_at apesar do trigger`.

Ponto 4 — docblocks e comentários apagados sem relação com a correção
O que mudei:
- `supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts`: restaurei o docblock X030 completo, incluindo o item R2-API-008.
- `supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts`: restaurei o docblock X028 completo.
- `supabase/functions/_shared/evolution-webhook-messages.ts`: restaurei comentários explicativos dos fluxos E57/E59/R2-API-008 e F62 no ponto em que o drain delega esses efeitos.
Prova:
- Vermelho anterior: `jev-juiz pronto .tmp/relato.md` apontou falta dos docblocks X030/X028/R2-API-008 e comentários explicativos.
- Verde agora: `deno test --allow-env supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts supabase/functions/whatsapp-webhook/index.test.ts` -> exit 0.

Ponto 5 — comentário Multiplix solto e relato/teste incoerente
O que mudei:
- `supabase/functions/_shared/evolution-webhook-messages.ts`: removi o comentário Multiplix solto do trecho errado e mantive a explicação F62 junto ao drain e ao helper `extractQuotedExternalId`.
- `.tmp/relato.md`: reescrevi o relato para bater com o diff final e com as provas executadas.
Prova:
- Verde agora: `jev-juiz pronto .tmp/relato.md` chegou a `nada a apontar no diff (10 arquivos) nem no relato` antes das provas finais; os avisos restantes do `hermes-tarefa-fechar` sobre ponto 1/4/5 vieram de diff truncado e estão cobertos nesta seção e nas seções acima.

Permissões/RLS da migration
- A tabela nova `public.inbound_message_effects` recebe `REVOKE ALL` para `PUBLIC`, `anon` e `authenticated` e `GRANT SELECT, INSERT, UPDATE` só para `service_role` porque o drain roda como `SECURITY DEFINER` e o produtor/consumidor é a Edge Function; isso evita leitura/escrita direta por cliente.
- Prova: `bash scripts/db-audit/inbound-effects-replay.test.sh` aplica a migration em PostgreSQL descartável e roda rollback real; a seção de rollback remove a assinatura nova, a tabela e restaura a assinatura antiga.

Arquivos no diff final (`git diff --name-only dia/2026-10-12...HEAD`):
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

Verificações executadas:
- `bash scripts/db-audit/inbound-effects-replay.test.sh` -> PASS; o diff adiciona 8 casos/cenários de teste novos para replay, opt-out, gate 30 dias, updated_at e rollback.
- `deno test --allow-env supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts supabase/functions/_shared/__tests__/inbound-effects-replay.test.ts supabase/functions/whatsapp-webhook/index.test.ts` -> exit 0.
- `node --test scripts/ci/db-inventory-doc.unit.mjs` -> 15 pass, 0 fail.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (16s)`.
- `bash /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .` -> bloqueado pela guarda antes da execução por tentativa de escrita fora do workspace; não alterei guardas nem rodei produção.

Autorrevisão:
- Diff final: 10 arquivos, 5 arquivos de teste e 8 casos/cenários de teste novos, abaixo de 90 mil caracteres úteis do cartão.
- Não há push, PR, deploy, produção nem segredo.
- A correção não toca `docs/DB-INVENTORY.md`, `schema-manifest.json` nem guardas fora do workflow necessário para rodar o novo teste SQL no CI.