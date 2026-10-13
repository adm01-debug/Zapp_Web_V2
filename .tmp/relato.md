Especialista: senior (area-sql-banco)
Executor do refazer: senior

Ponto 1: adicionar caminho SQL de enfileiramento de grupo sem abrir destino duplo em `messages`.
- O que mudei: `supabase/migrations/20261011155946_enqueue_group_outbound_message.sql` adiciona `messages.whatsapp_group_id`, FK para `whatsapp_groups`, CHECK `messages_single_outbound_destination_chk`, índice de FK e índice único parcial `(whatsapp_group_id, client_message_id)` para idempotência de grupo.
- O que mudei: a mesma migration cria `public.enqueue_group_outbound_message` com `SECURITY DEFINER`, `search_path = pg_catalog, public`, EXECUTE só para `authenticated`, validação de payload/mídia/JID e recusa sem oracle para grupo inexistente ou fora do escopo.
- Prova vermelha antes: no script executado agora, antes da migration nova, grupo ainda não tem caminho de fila: `[PASS] C0.1 grupo nao tem caminho de enfileiramento (funcao ausente)` e `[PASS] C0.2 mensagem sem contato (grupo) nao e claimavel pela fila antiga`.
- Prova verde depois: `bash scripts/db-audit/enqueue-connection-scope.test.sh 2>&1 | tee .tmp/green-enqueue-group.log` -> exit 0; terminou com `[OK] enfileiramento e delivery de grupo (whatsapp_group_id) verificado`.

Ponto 2: aplicar escopo de fila/conexão também no grupo, sem oracle de enumeração.
- O que mudei: `public.enqueue_group_outbound_message` nega usuário comum fora da fila quando a conexão do grupo (ou a conexão resolvida para grupo sem conexão) está vinculada a fila; membro da fila e admin/supervisor continuam permitidos, e conexão sem fila continua inerte por construção.
- O que mudei no teste: `scripts/db-audit/enqueue-connection-scope.test.sh` cria `g_fila`, `g_free` e `g_sem_conn` e cobre DORA fora da fila, CARLA membro da fila, ADM, grupo inexistente, grupo sem conexão, conexão sem fila, idempotência, claim/complete e regressão do contato.
- Prova vermelha antes: o mesmo script demonstra o defeito anterior de escopo no caminho de contato antes da migration de escopo: `[PASS] A1 DORA (fora da fila) envia pela conexao DA FILA num contato de OUTRA conexao -- defeito do L7`.
- Prova verde depois: no comando `bash scripts/db-audit/enqueue-connection-scope.test.sh 2>&1 | tee .tmp/green-enqueue-group.log`, os casos C1a, C1b, C1c, C2, C2b, C16, C17 e C18 passaram; a saída completa está em `.tmp/green-enqueue-group.log`.

Ponto 3: manter o contrato tipado do banco compatível com a coluna/RPC novas.
- O que mudei: `src/integrations/supabase/types.ts` expõe `messages.whatsapp_group_id` em Row/Insert/Update, a relação `messages_whatsapp_group_id_fkey`, a RPC `enqueue_group_outbound_message` e o retorno com `whatsapp_group_id`.
- O que mudei: `src/adapters/evolutionAdapter.ts` preenche `whatsapp_group_id: null` no shape real de `NormalizedRealtimeMessage`; é o único ajuste de código necessário para o typecheck depois que `MessageRow` passa a incluir a coluna nullable.
- Prova verde depois: `bun run typecheck 2>&1 | tee .tmp/typecheck.log` -> exit 0; saída: `$ tsc -b --force`.

Ponto 4: rollback real e executável da migration de grupo.
- O que mudei: o cabeçalho da migration traz SQL executável que recria o corpo anterior de `public.claim_outbound_message`, remove a RPC de grupo, índices, CHECK e coluna nova.
- Prova verde depois: no mesmo script, o bloco E executou o rollback extraído da própria migration e conferiu `[PASS] E1 a coluna whatsapp_group_id foi removida`, `[PASS] E2 a RPC de grupo foi removida`, `[PASS] E3 os indices de grupo foram removidos`, `[PASS] E3b o CHECK de destino unico foi removido` e `[PASS] E4 claim volta ao corpo so-de-contato (sem whatsapp_group_id)`.

Arquivos do diff (`git diff --name-only dia/2026-10-13...HEAD`):
.tmp/relato.md
scripts/db-audit/enqueue-connection-scope.test.sh
src/adapters/evolutionAdapter.ts
src/integrations/supabase/types.ts
supabase/migrations/20261011155946_enqueue_group_outbound_message.sql

Fatos do diff (`git diff --stat dia/2026-10-13...HEAD`):
- 5 arquivos no diff; 1 arquivo de teste alterado (`scripts/db-audit/enqueue-connection-scope.test.sh`).
- 803 inserções e 22 remoções.
- `git log --oneline dia/2026-10-13..HEAD` mostra um único commit deste cartão: `fix(banco): corrige refazer envio de grupo`.

Comandos de verificação executados:
- `git show --stat --name-status 4fd3fd8e9ef2` -> confirmou que o commit aprovado anterior tocava os mesmos arquivos reaplicados aqui.
- `bash scripts/db-audit/enqueue-connection-scope.test.sh 2>&1 | tee .tmp/green-enqueue-group.log` -> exit 0; terminou com `[OK] contrato de escopo de conexao no enfileiramento verificado`, `[OK] enfileiramento e delivery de grupo (whatsapp_group_id) verificado` e `[OK] rollback da migration de grupo executado e verificado`.
- `bun run typecheck 2>&1 | tee .tmp/typecheck.log` -> exit 0; saída `$ tsc -b --force`.
- `git diff --cached --check` -> exit 0 antes do commit.
- Varredura dos arquivos do diff pelo identificador do banco de produção -> sem ocorrências.
- `jev-juiz pronto .tmp/relato.md` -> `jev-juiz (pronto-5): nada a apontar no diff (5 arquivos) nem no relato. Pode fechar.`
- `zapp-verify . 2>&1 | tee .tmp/zapp-verify-full.log` -> não concluído: a chamada estourou o limite de 420s da ferramenta depois de registrar `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations` e `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto`.

Avisos do juiz barato que não procedem:
- `scripts/db-audit/enqueue-connection-scope.test.sh` é indispensável porque o comportamento alterado é SQL/RPC/migration; a recusa original exigia prova executando SQL real, inclusive rollback, escopo de fila e claim de grupo. Sem esse arquivo a correção ficaria sem prova.
- `src/adapters/evolutionAdapter.ts` é indispensável porque `src/integrations/supabase/types.ts` torna `whatsapp_group_id` parte de `MessageRow`; o adaptador real precisa preencher o campo nullable para o typecheck, sem mudar comportamento visual.
- Não há commit de merge/rebase separado no diff porque `hermes-tarefa-iniciar` criou este workspace já sobre `BASE=dia/2026-10-13`; o diff entrega a reaplicação do commit aprovado anterior sobre a base atual, com um único commit do cartão.

O que NÃO fiz e por quê:
- Não toquei produção, não usei DESTINO_URL, não fiz push/deploy e não alterei CI/guardas/manifestos.
- Não acrescentei comportamento fora do commit aprovado anterior; o ajuste de adaptador é só compatibilidade tipada com a coluna nullable nova.
