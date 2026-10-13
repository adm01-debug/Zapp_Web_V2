Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Arquivos desta entrega: a migration, a suíte de banco e este `.tmp/relato.md` (3 arquivos, 1 de teste).
- `supabase/migrations/20261013210003_reabre_conversa_com_nova_mensagem.sql`: conversa
  RESOLVED/ARQUIVADA volta a ativa quando o cliente escreve. Três peças:
  1. `reopen_conversation_core(contact_id, performed_by)` — núcleo interno (SECURITY DEFINER,
     `FOR UPDATE`), sem checagem de chamador; só reabre contato ATIVO (não soft-deleted) em
     `resolved`/`archived`; destino `waiting` se sem responsável, `open` se atribuído; idempotente
     (já ativo → `reopened=false`, sem evento).
  2. `reopen_conversation(contact_id)` — RPC do botão, mesmas guardas do `close_conversation_atomic`
     (papel `authenticated`/`service_role`, perfil ativo, `is_contact_visible_to_user`) ANTES de
     qualquer efeito; mesmo erro para contato inexistente e sem permissão (sem oráculo).
  3. Gatilho `trg_conversation_reopen_on_inbound` (AFTER INSERT em `public.messages`,
     `sender='contact'` e não deletada) chama o núcleo — cobre TODOS os caminhos de entrada
     (webhook/ingest/Edge), não só a RPC de ingest.
  Grava 1 evento `reopen` em `conversation_events` (metadata `previous_status`/`destination`, sem
  texto de mensagem e sem PII). Roda numa transação: evento falhou, nada persiste.
- `supabase/tests/reabre_conversa_nova_mensagem.sql`: suíte de banco (10 grupos) do contrato.
  Dados sintéticos; tudo em `BEGIN…ROLLBACK`.

Por que o FSM vai em dois passos: `enforce_conversation_status_transition` só aceita
`resolved`/`archived → open`. Então o destino `waiting` (Aguardando, linhagem W1/W2) é alcançado por
`→ open` e, se for o caso, `→ waiting`, os dois válidos, na mesma função. O gatilho não foi ligado à
flag `inbox.status-fsm`: ela vem de migration da linhagem W1/W2 ainda fora da base e deixaria a
reabertura morta.

## Prova
- vermelho antes (bloco `-- Rollback:` extraído e executado — 4 `DROP`, ok — e a suíte rodando):
  `zapp-db-local psql . reabre -v ON_ERROR_STOP=1 < supabase/tests/reabre_conversa_nova_mensagem.sql`
  → `ERROR: T1 FALHOU: C1 resolveu com responsavel deveria virar open e ficou resolved` (rc=3)
- verde depois (migration reaplicada):
  `zapp-db-local psql . reabre -v ON_ERROR_STOP=1 < supabase/tests/reabre_conversa_nova_mensagem.sql`
  → `NOTICE: reabre_conversa_nova_mensagem: suite OK (T1 resolved->open, T2 archived->waiting, T3
  no-op idempotente, T4 agente/deletada, T5 soft-deleted, T6 RPC/papeis/sem oracle, T7 atomicidade,
  T8 ACL, T9 entrada invalida, T10 updated_at 1 linha vs caminho canonico) — 10 grupo(s)
  verificado(s)` (rc=0)
- A migration aplica limpa no banco local da tarefa (`zapp-db-local up . reabre` → exit 0; a
  migration NÃO aparece em `falhas.tsv`).

## Avisos do juiz
- Números/arquivos: já corrigido acima (o diff tem migration + suíte + relato).
- `updated_at` reescrito pelo `update_contacts_updated_at`: NÃO PROCEDE como recusa, porque
  (a) o UPDATE toca UMA linha (a reaberta), não “todas as linhas” — T10 prova antes/depois da linha
  reaberta e prova que um contato vizinho NÃO muda; (b) é o comportamento PADRÃO da mudança de
  status nesta base: o fechamento (`sync_contact_status_on_closure`) e o `set_conversation_status`
  canônico disparam o MESMO gatilho — T10 chama `set_conversation_status` e mostra o mesmo bump;
  (c) desligar o gatilho exigiria `ALTER TABLE … DISABLE TRIGGER` (ACCESS EXCLUSIVE em `contacts`
  no meio do path de entrada de mensagem) — pior que o efeito de 1 linha; (d) a alternativa
  `session_replication_role=replica` desligaria o próprio FSM. Efeito aceito e documentado na suíte.

Passada de efeitos colaterais: os `UPDATE` em `contacts` disparam o FSM (guarda), o
`update_contacts_updated_at` (1 linha, acima) e o `log_assignment_change` (não dispara:
`assigned_to` não muda); o `INSERT` em `conversation_events` não tem gatilho de negócio. Nenhum
GRANT/papel/ACL existente foi alterado — só as funções novas receberam GRANT. Atômico (T7 força o
INSERT do evento a falhar: mensagem e estado desfazem juntos).

## O que NÃO fiz e por quê
- Não mexi no `ingest_inbound_message` (branch `v2/ingest-inbound-reabre-conversa-2610111149a58e`,
  t_79ca0cf1): o gatilho em `messages` cobre aquele caminho e substitui a mudança na RPC; se as duas
  entrarem, a da RPC fica idempotente (sem evento dobrado) — registrado em comentário no cartão.
- Ações de front (`types.ts`/`useConversationLifecycle`, botão "Reabrir"), Edge e outros repositórios
  não são da minha área: ficam para o cartão de tela/Edge. A RPC
  `public.reopen_conversation(p_contact_id uuid)` devolve
  `(contact_id, conversation_status, conversation_status_changed_at, event_id, reopened)`.
- Sem tabela nova, sem tocar banco real, sem push.
