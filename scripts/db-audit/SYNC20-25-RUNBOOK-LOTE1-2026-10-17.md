# SYNC20-25 — Runbook de aplicação do Lote 1 (SEM APLICAR)

Especialista: worker (sql) (area-sql-banco). Cartão `t_d4409e54`. Base de arquivo: `dia/2026-10-17`.
Lote 1 = as 4 migrations aceitas no SYNC20-23 (commit `e51d3d091`,
`scripts/db-audit/SYNC20-23-LOTE1-2026-10-17.csv`).

**Escopo deste documento: SOMENTE doc.** Nada foi aplicado no canônico, nenhuma migration foi
escrita, nenhum push/merge. Toda leitura nova aqui é do **canal RO para agentes**
(`zapp-db-ler`, só `SELECT`, ≤500 linhas), igual ao padrão do `SYNC-AG4b`. O que vem citado de
medição anterior é atribuído à fonte.

Este runbook é a etapa seguinte do plano de aplicação do `SYNC-AG4-F14` (§4, "uma migration por
cartão, nada em lote") e do `SYNC20-23` (§8.4: "o Lote 1 aguarda autorização nominal").

---

## 0. Pré-requisitos que bloqueiam o passo 1

| # | pré-requisito | como se confirma |
|---|---|---|
| P0.1 | **autorização nominal do Joaquim** para aplicar no canônico | ordem escrita no cartão. Sem isso, este runbook NÃO roda. |
| P0.2 | canal RO `zapp-db-ler` respondendo | `zapp-db-ler "select 1"` devolve JSON com `rows`. Mudo → critério **C0**. |
| P0.3 | canal de **escrita** no canônico (aplicador) | provido por quem opera o banco. O canal RO **não** escreve — não é este caminho. |
| P0.4 | bancada de prova de pé | `zapp-db-local up .` para o replay, ou o banco local da tarefa. A prova (§7) é sempre **local**, nunca no canônico. |

---

## 1. Preflight RO — medir antes de tocar

Uma instrução por consulta, só `SELECT`.

**P1 — tamanho e topo do ledger**

    zapp-db-ler "select count(*)::int as n, min(version) as vmin, max(version) as vmax from supabase_migrations.schema_migrations"

Medido em 17/10/2026 (este cartão): `{"n":912,"vmin":"20251215024517","vmax":"20261016230000"}`.
Esperado no momento de executar: **n = 912** e **vmax = 20261016230000**. Diferente → **C5**.

**P2 — ausência das 4 do lote no ledger**

    zapp-db-ler "select version from supabase_migrations.schema_migrations where version in ('20261010180000','20261010180001','20261011003025','20261011140613')"

Medido em 17/10/2026: `row_count: 0` (nenhuma das 4 está aplicada). Qualquer linha devolvida →
**C1**: essa migration já entrou por outro caminho; **não reaplicar**, reclassificar.

**P3 — dependências que o lote pressupõe (medido 17/10, todas = 1)**

    zapp-db-ler "select 'is_admin_or_supervisor' as k, count(*)::int as n from pg_proc where proname='is_admin_or_supervisor' union all select 'conv_tasks.position', count(*)::int from information_schema.columns where table_schema='public' and table_name='conversation_tasks' and column_name='position' union all select 'messages.tabela', count(*)::int from information_schema.tables where table_schema='public' and table_name='messages'"

Resultado medido: `is_admin_or_supervisor=1`, `conversation_tasks.position=1`, `messages.tabela=1`.
Qualquer `0` → **C2** (o 3 depende de `is_admin_or_supervisor`; o 2 indexa `position`; o 4 mexe em
`messages`).

**P4 — pinagem dos bytes do lote** (sha256 do arquivo, calculado sobre `origin/main` via
`git show origin/main:<path> | sha256sum`, 17/10/2026):

| versão | arquivo | sha256 |
|---|---|---|
| 20261010180000 | conversation_tasks_owner_status_completed_idx.sql | `feec94651e6cecc1b7b8c44ea9f05664937ce46e122bf0b52659ae3018cfb408` |
| 20261010180001 | conversation_tasks_owner_status_position_idx.sql | `aa399d75fca7b6e04401e282fd5cdcbd36be7eca1abc8d1fe546399cc69906f8` |
| 20261011003025 | fecha_get_profile_role_for_check.sql | `0bd7c71e791ec87a3989a61571b8cb111a10f923c0423a89a085c293864a213c` |
| 20261011140613 | messages_group_sender.sql | `240960d7a7070803f1d4aa3a2e2727239c883dcaa5160b5fdb6cd106b6be4126` |

Se o conteúdo dos arquivos não bater com estes hashes, os invariantes da §3 podem não valer mais →
parar e refazer a classificação.

**Não é preflight**: `20261016120000` (ledger sem arquivo) não pertence ao lote e não bloqueia —
ver §6.

---

## 2. Ordem de aplicação

Sempre por **versão crescente**, uma por vez, conferindo o invariante (§3) e o ledger (§4) entre
uma e outra. Nunca em lote, nunca numa transação única: uma falha no meio precisa deixar o estado
anterior intacto e legível.

| passo | versão | arquivo | classe (SYNC20-23 CSV) |
|---|---|---|---|
| 1 | 20261010180000 | conversation_tasks_owner_status_completed_idx.sql | ADITIVA — CREATE INDEX |
| 2 | 20261010180001 | conversation_tasks_owner_status_position_idx.sql | ADITIVA — CREATE INDEX |
| 3 | 20261011003025 | fecha_get_profile_role_for_check.sql | CORRETIVA — CREATE OR REPLACE FUNCTION |
| 4 | 20261011140613 | messages_group_sender.sql | ADITIVA — ADD COLUMN |

Justificativa da ordem: as duas de índice e a de coluna são puramente aditivas e independentes; a
3 (corretiva de função `SECURITY DEFINER`) entra depois porque é a única que muda comportamento de
leitura — se ela falhar, as adições 1/2/4 já estão de pé e não precisam ser desfeitas.

---

## 3. Invariante pós de cada migration

Conferir **imediatamente** após aplicar cada uma, com o canal RO. `!=` esperado → **C4**.

**Passo 1 — índice de concluídas**

    zapp-db-ler "select count(*)::int as n from pg_class where relname='idx_conversation_tasks_owner_status_completed' and relkind='i'"

Esperado: **1**. Não pode ter mudado dado, ACL ou RLS (`CREATE INDEX IF NOT EXISTS`).

**Passo 2 — índice de posição**

    zapp-db-ler "select count(*)::int as n from pg_class where relname='idx_conversation_tasks_owner_status_position' and relkind='i'"

Esperado: **1**. Idem: não cria nem altera a coluna `position` (só indexa).

**Passo 3 — checagem de dono na função**

    zapp-db-ler "select (pg_get_functiondef('public.get_profile_role_for_check(uuid)'::regprocedure) like '%auth.uid()%')::int as n"

Esperado: **1** (o corpo vigente passa a conter a checagem de dono). Continua valendo: mesma
assinatura `(p_user_id uuid)`, mesmos GRANTs, `SECURITY DEFINER` + `SET search_path = public`
inalterados. Prova negativa (roda na bancada, não no canônico): como `authenticated`, pedir o
`role` de **outro** usuário devolve **0 linhas**; pedir o próprio devolve 1.

**Passo 4 — colunas de remetente de grupo**

    zapp-db-ler "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='messages' and column_name in ('sender_display_name','sender_participant_jid')"

Esperado: **2**. Ambas anuláveis, sem `DEFAULT`, sem backfill; nenhuma policy ou índice novo (as
colunas herdam o SELECT/INSERT/UPDATE já vigentes em `messages`).

---

## 4. Ledger esperado: 912 → 916

A cada passo aplicado, o ledger ganha **exatamente 1** versão. No fim, P1 deve devolver `n = 916`.

    zapp-db-ler "select version, name from supabase_migrations.schema_migrations where version in ('20261010180000','20261010180001','20261011003025','20261011140613') order by version"

Esperado: **4 linhas**, nesta ordem, com `name` = nome do arquivo sem o prefixo de 14 dígitos e sem
`.sql` (`conversation_tasks_owner_status_completed_idx`, `conversation_tasks_owner_status_position_idx`,
`fecha_get_profile_role_for_check`, `messages_group_sender`). Menos de 4 linhas com as 4 aplicadas =
registro divergente → parar e reportar (não "consertar" o ledger à mão).

---

## 5. Critérios de parada

| id | condição | ação |
|---|---|---|
| C0 | `zapp-db-ler` não responde | parar antes de tudo; sem foto RO não há preflight |
| C1 | P2 devolve alguma das 4 versões | não reaplicar; reclassificar (já entrou por outro caminho) |
| C2 | P3 com qualquer `0` | parar: dependência de repositório ausente no canônico |
| C3 | qualquer migration do lote falha (erro cru do Postgres) | **não** seguir para a próxima; reportar com o SQLSTATE/mensagem; rollback da última aplicada só com autorização (§6) |
| C4 | invariante do passo (`!=` esperado) | parar; reverter a migration daquele passo e reportar |
| C5 | P1 com `n != 912` ou `vmax != 20261016230000` | parar: houve aplicação por outro caminho entre a autorização e a execução; refazer a foto |
| C6 | alguém aplicar no canônico entre dois passos | repetir P1; se mudou, parar e refazer o preflight |

Regra de ouro: **parar e relatar é resultado válido**; continuar "para não perder a viagem" não é.

---

## 6. Rollback — ordem reversa (4 → 3 → 2 → 1)

O rollback de cada arquivo é o do **próprio arquivo** (bloco `-- Rollback:`). Extração validada
nesta rodada com o mesmo extrator de `sync20-23-prova-rollback-lote1.sh` (linha-SQL ou bloco
executável). SQL extraído:

**4) 20261011140613_messages_group_sender.sql**

    alter table public.messages drop column if exists sender_display_name;
    alter table public.messages drop column if exists sender_participant_jid;

**3) 20261011003025_fecha_get_profile_role_for_check.sql**

    create or replace function public.get_profile_role_for_check(p_user_id uuid) returns table(role text, access_level text, permissions jsonb) language sql stable security definer set search_path = public as $$ select p.role, p.access_level, p.permissions from profiles p where p.user_id = p_user_id limit 1; $$;

⚠️ **Aviso de segurança**: esse rollback recria a função **sem a checagem de dono** — reabre
`role/access_level/permissions` de terceiros para qualquer `authenticated` (SEC-DEFINER_GRANTS_STORAGE-03).
Se a 3 precisa sair, é para entrar uma substituta; nunca deixar a versão antiga em pé.

**2) 20261010180001_conversation_tasks_owner_status_position_idx.sql**

    DROP INDEX IF EXISTS public.idx_conversation_tasks_owner_status_position;

**1) 20261010180000_conversation_tasks_owner_status_completed_idx.sql**

    DROP INDEX IF EXISTS public.idx_conversation_tasks_owner_status_completed;

Os dois `DROP INDEX` e os dois `DROP COLUMN` são CONTRATIVOS/DESTRUTIVOS: **exigem decisão do
dono** (regra dura do perfil). O agente não decide desfazer por conta própria.

---

## 7. Prova pós-rollback (bancada local, nunca o canônico)

Ferramenta já existente: `scripts/db-audit/sync20-23-prova-rollback-lote1.sh <container> <dir-com-supabase/migrations>`.
Ela roda **dentro de um run do replay local** (com o container de pé) e, para cada migration do
lote: (1) confere o objeto presente, (2) extrai e executa o rollback, (3) confere que o objeto
sumiu, (4) reaplica a migration, (5) confere que voltou. Termina com `PROVA_LOTE1=VERDE|VERMELHO`.

Formato de saída esperado por item (não é resultado medido agora):

    OK     <arquivo> -> <rótulo>: presente=N rollback->0 reaplicado->N

Último resultado **medido em bancada local** (SYNC20-23, coluna `provas_lote1` de
`SYNC20-23-LOTE1-2026-10-17.csv`, replay local ok):

| versão | prova registrada |
|---|---|
| 20261010180000 | indice presente=1 -> rollback=0 -> reaplicado=1 |
| 20261010180001 | indice presente=1 -> rollback=0 -> reaplicado=1 |
| 20261011003025 | corpo com auth.uid()=1 -> rollback=0 -> reaplicado=1 |
| 20261011140613 | 2 colunas presentes -> rollback=0 -> reaplicadas=2 |

O mesmo script confirma um **achado** que NÃO é do lote: o rollback de
`20261009062323_sec_p2_definer_storage.sql` está quebrado (a `20261014023945` retirou `p_email`);
o `VERMELHO` ali é esperado e documentado.

Após qualquer aplicação real, repetir a prova e comparar com esta tabela.

---

## 8. `20261016120000` — ledger sem arquivo (não é do lote; nada a gravar hoje)

Fato: a versão `20261016120000` (`security_fixes_passkey_purge_gmail_search_events`) existe no
ledger, **sem arquivo** em `origin/main` e com `statements` vazio; o conteúdo é irrecuperável
(SYNC20-23 §7). Ela **não** faz parte do Lote 1 e não interfere no preflight P1/P2.

O `migration-evidence.json` (schema_version 2) exige `filename` (casando `^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$`)
**e** `file_sha256` nos três `kind` permitidos (`ledger-only/comment-only`,
`ledger-only/name-and-file-pinned`, `ledger-divergence/pinned-replay`). Ou seja: **exceção
pressupõe arquivo** — hoje não há `kind` para "ledger sem arquivo". As duas saídas seguem fora da
minha área e não são assunto deste cartão:
(a) quem tiver o SQL real registra o arquivo (aí a exceção cabe);
(b) acrescentar um `kind` (ex.: `ledger-only/no-file`) ao `check-migration-drift.mjs` e seus testes —
cartão de mudança do checker, não migration.

Nada a fazer aqui: este runbook **não** grava exceção.

---

## 9. Registro de execução (preencher só quando autorizado)

| passo | comando | saída (colar crua) | quem | data |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| prova §7 | | | | |

## 10. O que este documento não faz

Não aplica nada, não toca produção, não cria migration, não faz push/merge, não grava exceção no
`migration-evidence.json`, não conserta a bancada. É o roteiro para quem for autorizado a executar.
