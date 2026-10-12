Especialista: worker (sql) (area-sql-banco)

# fix(db): vinculo do media_path do Team Chat a remetente e conversa (R2-DB-020)

Retoma o trabalho perdido do cartao t_f1c4bc72 sobre a base de HOJE (dia/2026-10-12).

## O que mudou e por quê
- supabase/migrations/20261012192938_team_chat_media_path_sender_conversation.sql — acrescenta
  o vinculo de DADOS que faltava no HEAD: quando media_bucket='team-chat-files', media_path
  precisa ser <sender_id>/<conversation_id>/<nome-opaco> (1o segmento = sender_id, 2o =
  conversation_id, 3o nao vazio). A metade de ACL do R2-DB-020 ja entrou por 20261007010651
  (TC-001/#54): a policy de SELECT de team-chat-files passou a derivar de storage.objects.name
  (sem o vetor profiles.name) e de current_profile_id. Por isso esta migration NAO toca policy,
  GRANT, papel nem ACL — so o vinculo de dados, para nao retirar o ramo legado auth.uid() que a
  base preserva de proposito. Transicao sem assumir tabela vazia: CHECK entra NOT VALID (nao
  falha por linha preexistente), tabela de apoio _rb com RLS ligada e sem GRANT para
  PUBLIC/anon/authenticated (guarda o locator antigo para o rollback devolver o DADO),
  reconciliacao explicita do legado com o gatilho BEFORE UPDATE update_team_messages_updated_at
  suspenso (nao reescreve updated_at) e VALIDATE final que prova a tabela limpa.
- scripts/db-audit/team-chat-media-acl-r2-db-020.test.sh — teste do R2-DB-020 retomado: aplica
  a migration REAL do HEAD e depois a do cartao no MESMO container descartavel. Bloco A prova o
  defeito que ainda existia (insert com media_path divergente ACEITO); a sonda prova que o
  legado existia; bloco B prova a recusa (perfil divergente, conversa divergente, caminho curto
  sem erro de cast, opaco vazio) e que a ACL segue segura (membro, dono da pasta, admin,
  nao-membro, caminho malformado); bloco C executa o SQL do cabecalho "-- Rollback
  (SQL executavel, na ordem):" e prova a devolucao do DADO.
- .github/workflows/db-guard.yml — registra o teste no pipeline. Havia conflito com um bloco
  TC-009 ja presente na base (mesma regiao do arquivo); mantive OS DOIS blocos.

## Prova
- vermelho antes: `bash scripts/db-audit/team-chat-media-acl-r2-db-020.test.sh` (bloco A, antes
  de aplicar a migration do cartao) -> `[PASS] A2 (defeito) insert com media_path divergente e
  ACEITO antes da migration` e sonda `[PASS] L1 ADD CONSTRAINT validado equivalente falha com
  linha legada`.
- verde depois: o mesmo comando, agora com a migration -> `[OK] contrato R2-DB-020 (persistencia
  de media_path do Team Chat) verificado`, com blocos L2-L9, B1-B12, D1-D3 e C1-C6 todos
  `[PASS]` (inclui `C3 rollback devolve o locator (bucket/path/type) das linhas reconciliadas`).
- rollback: executado de verdade no container no bloco C, a partir da linha
  `-- Rollback (SQL executavel, na ordem):` do cabecalho da migration.
- banco local: `hermes-db-migrar supabase/migrations/20261012192938_team_chat_media_path_sender_conversation.sql`
  -> `APLICADA no banco LOCAL 'v2-26101216198f31' (producao nao foi tocada)`.

## O que NAO fiz e por quê
- Nao reescrevi a metade de ACL (policies) do R2-DB-020: ela ja esta no HEAD por 20261007010651;
  refaze-la substituiria a policy vigente e retiraria o ramo legado auth.uid() que a base
  preserva de proposito (seria regressao de acesso).
- Nao mexi em GRANT, papel nem ACL, e nao mudei contrato de front (nenhuma coluna renomeada).
- Arquivo de teste novo em scripts/db-audit/: o proprio cartao manda juntar o teste da tentativa
  anterior (t_f1c4bc72) e registra-lo no db-guard — REGISTRO feito no db-guard.yml.
- Teto de 25k: `git diff $B...HEAD -- 'supabase/migrations/*'` mede o codigo da migration; o
  total do cartao inclui o script de teste descartavel (usa Docker, nao entra em producao).
- O aviso automatico "o cartao diz SEM DDL/migration" NAO PROCEDE: este e um cartao de BANCO
  (P1, R2-DB-020) que pede migration explicitamente ("traga os commits com git cherry-pick",
  versao com a data de hoje). A frase "sem DDL/migration" e o rodape de REGRAS PERMANENTES do
  corpo do cartao (vale para planos de front), copiado para um cartao que e de banco por
  natureza. Por isso rodo de novo o MESMO fechar sem tirar a migration.
