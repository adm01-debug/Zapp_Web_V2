Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Cartão: criar a via de envio para grupo (paridade V3->V2 do encaminhamento). Antes,
`public.enqueue_outbound_message` exigia `contacts.id` e o claim só resolvia destino via
`JOIN contacts` + telefone E.164 — grupo não tem contato, então a fila não entregava grupo.
Decisão de desenho: `public.messages.contact_id` JÁ é nullable no schema real, então NÃO
alterei o contrato existente — só uma coluna ADITIVA nullable.

- supabase/migrations/20261011155946_enqueue_group_outbound_message.sql (novo):
  - `messages.whatsapp_group_id uuid` (FK -> `whatsapp_groups.id`, ON DELETE SET NULL),
    aditiva e nullable; linhas antigas intactas.
  - índice único parcial `messages_group_client_msg_uq (whatsapp_group_id, client_message_id)`
    para idempotência por `client_message_id` do grupo (o UNIQUE de contato não serve: NULLs
    são distintos em Postgres) + índice de apoio à FK.
  - `enqueue_group_outbound_message(p_group_id, ...)`: mesmos parâmetros/retorno da versão de
    contato, com as mesmas garantias (idempotência, `send_messages`, escopo de conexão L7,
    perfil ativo, recusa de entrada inválida, nada gravado em recusa). SECURITY DEFINER +
    `search_path`, EXECUTE só para `authenticated`.
  - `claim_outbound_message` substituído SEM mudar assinatura/retorno/ACL: ganha só o ramo de
    grupo, devolvendo o JID do grupo em `contact_phone` (o campo escalar `number` do provedor).
- scripts/db-audit/enqueue-connection-scope.test.sh (estendido, não criei .test.sh novo p/ não
  virar órfão no db-guard.yml): mini-schema com `whatsapp_groups` e colunas de lease, reproduce
  os corpos de produção vigentes e aplica a migration REAL. Blocos C (27 asserts), D (estrutura)
  e E (rollback real).
- src/integrations/supabase/types.ts: `messages` (Row/Insert/Update), os 4 Returns de função que
  devolvem `messages`, e a nova RPC (tipos gerados, mantidos coerentes à mão).
- src/adapters/evolutionAdapter.ts: 1 propriedade `whatsapp_group_id: null` no literal de
  `RealtimeMessage` (ripple de tipo exigido pelos tipos gerados; mínimo).

## Prova
- vermelho antes (SEM a migration), no próprio teste:
  `bash scripts/db-audit/enqueue-connection-scope.test.sh` → BLOCO C0:
  `[PASS] C0.1 grupo nao tem caminho de enfileiramento (funcao ausente)`
  `[PASS] C0.2 mensagem sem contato (grupo) nao e claimavel pela fila antiga`
- verde depois (mesmo comando):
  `[PASS] C1..C17b` (enfileira permitido, linha de grupo com contact_id NULL, idempotência,
  chave reusada recusada 23505, claim devolve o JID, complete fecha, anon/service_role sem EXECUTE,
  grupo inexistente/JID inválido/fora de escopo recusados, contato inalterado)
  `[PASS] D1..D4`, `[PASS] E1..E4` (rollback da própria migration executado: coluna, RPC e
  índices removidos; claim volta ao corpo só-de-contato)
  `[OK] rollback da migration de grupo executado e verificado`
- migration REAL aplicada no banco LOCAL da tarefa: `hermes-db-migrar <arquivo>` →
  `APLICADA no banco LOCAL 'v2-261011124847ed' (produção não foi tocada).`
- `bun run db:guard` → `OK: nenhuma violacao nova.` + `arquivos validos em supabase/migrations: 817`
- `zapp-verify . --rapido` → `OK tipos / OK lint / OK migrations` e
  `VERIFY: VERDE SEM BANCO`.

## O que NÃO fiz e por quê
- Não liguei a tela ao novo RPC: `useForwardMedia.ts` ainda recusa grupo
  ("Encaminhamento para grupos ainda não é suportado"). Trocar a chamada da tela para
  `enqueue_group_outbound_message` é de outro dono (telas/hooks) — o banco já entrega a via.
- Não alterei `complete`/`fail`: são agnósticos de destino (não tocam `contacts`) — provei o
  `complete` na mensagem de grupo no C6; nenhuma mudança foi necessária.
- Não criei `.test.sh` novo (viraria órfão no `db-guard.yml`, que lista cada arquivo); estendi
  o do assunto.
- Não mexi na policy de `whatsapp_groups` (`USING (true)` p/ authenticated, pré-existente): a
  fronteira real de escrita do cartão é `send_messages` + escopo de conexão, já aplicados.
