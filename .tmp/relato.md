Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011151650_edit_message_rpc.sql` (nova): cria a RPC `public.edit_message(uuid, text)` (SECURITY DEFINER) e a guarda `trg_guard_message_immutable_columns` (BEFORE UPDATE OF content, sender, created_at, external_id, contact_id, agent_id em `public.messages`). Fecha o defeito: a edição ia por `UPDATE` direto e a policy de UPDATE é por CONTATO (visibilidade), não por remetente — qualquer agente que vê o contato reescrevia o conteúdo de mensagem RECEBIDA ou já enviada, e ainda trocava sender / external_id / created_at. `-- Rollback:` executável nas primeiras linhas.
- `scripts/db-audit/edit-message-authorization.test.sh` (novo): prova em Postgres descartável (postgres:17-alpine), com `SET ROLE authenticated` / `service_role` e claims sintéticas, aplicando a migration real da cópia.
- `src/integrations/supabase/types.ts`: entrada `Functions.edit_message` no formato do gerador (bloco da linha do `messages`), para o front chamar `rpc('edit_message')`.
- `scripts/ci/check-test-inventory.mjs`: registra o `.test.sh` novo na ALLOWLIST (com justificativa) para não ficar órfão — o próprio arquivo manda o agente registrar ali, não editar workflow.

## Prova
- vermelho antes (BLOCO A, schema mínimo SEM a migration):
  `[PASS] A1 ALICE, authenticated, reescreve o conteudo de uma mensagem RECEBIDA (defeito)`
  `[PASS] A2 ALICE tambem reescreve sender pela via direta (defeito)`
  `[PASS] A3 a RPC edit_message ainda nao existe (defeito)`
- verde depois (BLOCO B, com a migration aplicada), `bash scripts/db-audit/edit-message-authorization.test.sh` → 25 PASS, 0 FAIL:
  `[PASS] B1 UPDATE direto de content da mensagem RECEBIDA e recusado (message_content_edit_requires_rpc)`
  `[PASS] B3 authenticated NAO forja a marca de sessao para passar a guarda`
  `[PASS] B4/B5/B6 sender, external_id e created_at recusados (message_immutable_columns_forbidden)`
  `[PASS] B7 a RPC edita a propria mensagem enviada e devolve o novo conteudo`
  `[PASS] B9 a edicao gravou UM evento de auditoria sem o texto da mensagem`
  `[PASS] B10/B11/B12/B13/B14/B15/B16/B17 recebida, sem send_messages, fora da janela, sem external_id, apagada, contato invisivel (sem revelar existencia), vazia, >4096 recusados`
  `[PASS] B18/B19/B20 soft delete, is_read e transcription continuam`
  `[PASS] B21 service_role (Edge) segue escrevendo content/external_id`
  `[PASS] B22/B23/B24/B25 ACL (authenticated EXECUTE, anon nao, guarda fechada, trigger armado)`
  `[OK] contrato de autorizacao da edicao de mensagem (edit_message) verificado`

## Decisões (com o porquê)
- Janela de 15 min imposta no SERVIDOR: paridade com `EDIT_WINDOW_MINUTES = 15` do editor (`useChatPanelHandlers.ts`) e com o WhatsApp.
- Erro idêntico `message_not_found_or_not_authorized` para "não existe" e "não pode ver": evita oráculo de existência (recusa anterior do revisor por oráculo de enumeração).
- Exceção de conteúdo só com `current_user='postgres'` E a marca de sessão `app.edit_message_rpc='on'` (ligada dentro da própria RPC): o `authenticated` não consegue se auto-marcar (teste B3 prova). Não uso bypass só por papel para não abrir uma "guarda removida no caminho".
- Soft delete continua: `is_deleted=true` ainda pode trocar o texto pelo tombstone (`[Mensagem apagada]`), porque é o fluxo real do app (MessageContextActions / MessageHoverToolbar / useFileUploadLogic).
- `agent_id`/`contact_id` também entram na lista imutável por authenticated; ledger `audit_logs` grava ação + `contact_id` sem o texto da mensagem e sem dado pessoal.
- Efeitos colaterais conferidos: a guarda só dispara em UPDATE das colunas listadas (is_read/transcription não pagam o custo); `complete_outbound_message`/`enqueue_outbound_message` (dono postgres) seguem trocando status/external_id; `service_role` intacto.

## O que NÃO fiz e por quê
- Não toquei `src/**`: `useChatPanelHandlers.ts:176` ainda faz UPDATE direto de content e DEIXARÁ de funcionar até o front chamar `rpc('edit_message')`. Registrei em `kanban_comment` (worker telas/hooks). Fora dos meus arquivos do cartão.
- Não editei `.github/workflows/db-guard.yml` (passo do CI é do dono do workflow); o teste entrou na ALLOWLIST do inventário, como os demais `.test.sh` de docker descartável.
- Não regenerei `supabase/schema-manifest.json` / `schema-catalog.json`: são sincronizados do banco canônico por fluxo separado (commits `chore(db): sincronizar artefatos`).
