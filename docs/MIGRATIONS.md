# Migrations — procedimento e armadilhas

**Origem:** etapa 12 do plano em `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md` (achado A-05).

---

## 1. A regra que importa

**`supabase/migrations/` e `supabase_migrations.schema_migrations` do destino tem que
conter exatamente o mesmo conjunto de versoes.** Nao a mesma contagem — o mesmo conjunto.

Contagem igual esconde erro. Na auditoria de 27/08/2026 havia 267 arquivos e 259 registros;
depois de reconciliar, os dois lados fecharam em 261 com o mesmo hash:

```sh
# lado do repo (mesma receita do scripts/db-audit/check-triple-parity.mjs: versões
# ordenadas, separadas por \n, com \n final — o script é a fonte da verdade)
ls supabase/migrations/*.sql | sed 's|.*/||' \
  | sed -E 's/^([0-9]{14}).*/\1/' | sort | paste -sd '\n' - | sha256sum

# lado do banco
psql "$DESTINO_URL" -At -c \
  "SELECT encode(sha256(convert_to(string_agg(version, E'\n' ORDER BY version) || E'\n','UTF8')),'hex') FROM supabase_migrations.schema_migrations"
```

O algoritmo é `sha256` nos dois lados (`sha256()` é built-in do Postgres, PG11+). Trocar
apenas um dos lados faz a paridade divergir sempre — se mexer num, mexa no outro.

O `db-guard.yml` valida nomes, conteudo local e versoes unicas sem credencial. A
comparacao com o ledger real ocorre no `db-live-guard.yml`, somente em eventos
confiaveis da `main`.

---

## 2. `supabase_apply_migration` esta bugado neste ambiente

O MCP do banco oficial falha ao aplicar migration — referencia uma coluna
`executed_at` que nao existe em `supabase_migrations.schema_migrations`. O schema real e:

```
version      text      NOT NULL
statements   text[]    NULL
name         text      NULL
```

### Procedimento manual correto

1. Aplique o DDL via `db_query` (multi-statement, uma transacao por chamada).
2. Registre a versao na mesma chamada ou logo depois:

```sql
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20260827120100', 'nome_da_migration', ARRAY[
  '-- resumo do que foi aplicado',
  '-- fonte de verdade: supabase/migrations/20260827120100_nome_da_migration.sql'
]) ON CONFLICT DO NOTHING;
```

3. Commite o arquivo `.sql` com o **mesmo** prefixo de 14 digitos, **na mesma sessao/PR
   que aplicou o DDL** — nunca "depois". Se a sessao terminar entre o passo 2 e o
   commit, o registro fica orfao (existe no banco, nao existe no Git) e so aparece
   quando outra sessao rodar `check-migration-drift.mjs` dias ou semanas depois.

**Padrao observado, nao excecao rara:** em 25/09/2026 uma unica auditoria achou
tres casos deste exato hiato — nao um caso isolado:
- `20260925095149` (`harden_security_definer_rpcs_pii_gaps`): a mesma migration
  aplicada duas vezes — a primeira (`20260924221209`) ja tinha passo 3 feito, a
  segunda nunca virou arquivo. Corrigido nesta sessao com `DELETE` direto em
  `schema_migrations` (sem PR: statements idempotentes, sem efeito real de schema,
  confirmado antes de apagar).
- `20260904330000` (`revoke_unnecessary_anon_grants`): aplicada via MCP em
  04/09/2026, nunca commitada — ficou 3 semanas invisivel ate a varredura por
  `name` duplicado sem excecao em `migration-evidence.json` achar. Reconstituida
  em `20260904330000_revoke_unnecessary_anon_grants.sql` (PR #677).
- `agent_presence_server_ttl` e `admin_set_role_last_admin_floor`: aplicadas as
  10:05-10:07 do mesmo dia por sessao paralela, pegas pelo `db-live-guard.yml`
  minutos depois, ainda no meio do fluxo daquela sessao.

Se voce aplicou DDL via `db_query`/MCP e a sessao vai encerrar antes do passo 3,
rode `node scripts/db-audit/check-migration-drift.mjs` antes de encerrar para
confirmar que o par version+arquivo ja fechou — nao confie em "vou commitar
depois".

**O arquivo no Git e a fonte de verdade.** A coluna `statements` e metadado. Nao gere
`statements` a partir do catalogo do banco sem filtrar: na primeira tentativa desta
reconciliacao o gerador capturou 126 statements em vez de 108, porque 18 indices
preexistentes seguiam a mesma convencao de nome — um `db reset` quebraria neles.

### Evidencia usada pelo guard

`check-migration-drift.mjs` consulta `version`, `name` e `statements` e aplica as
evidencias que o ledger realmente possui:

- `name`, quando preenchido, deve corresponder ao nome depois do prefixo de 14 digitos;
- SQL executavel preservado em `statements` e comparado ao arquivo com comentarios,
  espacos e case de tokens nao quoted normalizados;
- `-- file-sha256: <64 hex>` em `statements` valida os bytes exatos do arquivo;
- `-- sql-sha256: <64 hex>` valida a forma SQL canonica calculada pelo guard.

Registros historicos sem SQL/hash somente sao aceitos sem manifesto quando ainda nao
foram revisados, com aviso explicito de evidencia limitada. Depois da revisao, use a
categoria `ledger-only/name-and-file-pinned` descrita abaixo. **Nunca preencha hash,
`name` ou `statements` retroativamente sem recuperar a fonte original**: calcular um
hash do estado atual e chama-lo de historico apenas certificaria um possivel drift.

Independentemente do banco, o guard falha para nome fora de
`14_digitos_nome.sql`, versao duplicada, arquivo vazio/somente comentarios, byte NUL
ou entrada nao regular. Arquivo vazio nunca e aceito. A unica excecao para um
arquivo somente de comentarios e um stub historico descrito exatamente em
`scripts/db-audit/migration-evidence.json`. O manifesto usa `schema_version=2`,
campos estritos, hashes lowercase e entradas em ordem crescente de `version`.

O tipo `ledger-only/comment-only` fixa `version`, `filename`, SHA-256 dos bytes,
`ledger_name`, o hash do array integral de `statements` e a justificativa factual.
Ele exige arquivo somente de comentarios e ledger sem SQL canonico. Uma mudanca de
byte, nome ou statement invalida a excecao; entradas orfas ou duplicadas tambem
falham. O manifesto nao autoriza reconstruir `statements` nem prova o DDL original.

O tipo `ledger-only/name-and-file-pinned` cobre exclusivamente uma migration com SQL
local cujo registro legado preserva nome/versao, mas nenhum SQL ou marker de hash. Ele
fixa os bytes locais e o nome exato; exige SQL executavel no arquivo e ausencia total
de SQL executavel ou marker de hash no ledger. Metadados textuais nao executaveis do
ledger nao sao promovidos a evidencia e, portanto, nao recebem hash retrospectivo.
O total aparece separadamente no resultado do guard e **nao** incrementa a contagem de
conteudo historico verificado. O estado atual continua sendo provado de forma
independente pelo manifesto estrutural completo no DB Live Guard.

As seis entradas revisadas nessa categoria sao `20260827120000`, `20260827130000`,
`20260827140000`, `20260827150000`, `20260827160000` e `20260828000000`. Qualquer
mudanca de byte, nome, statements ou marker falha fechado; se SQL historico autentico
for recuperado, a entrada precisa ser substituida por evidencia apropriada, nunca
silenciosamente reinterpretada.

O tipo `ledger-divergence/pinned-replay` existe somente para divergencias historicas
revisadas. Ele fixa, ao mesmo tempo:

- bytes e SQL canonico do arquivo (`file_sha256` e `file_sql_sha256`);
- nome exato do ledger;
- array integral de `statements` e sua forma SQL canonica
  (`ledger_statements_sha256` e `ledger_sql_sha256`);
- motivo fechado: `endpoint-literal-update`, `ledger-summary`, `safer-replay`,
  `format-only` ou `version-collision`;
- migration relacionada, obrigatoria apenas para colisao de versao;
- justificativa factual com pelo menos 40 caracteres.

O hash integral usa exatamente
`sha256("zapp-migration-ledger-statements-v1\0" + JSON.stringify(statements))`.
`ledger_sql_sha256` e apenas o hash de `canonicalStatements(statements)`: um texto
que comeca como SQL pode ser somente um resumo historico, portanto esse hash **nao
prova que o resumo seja SQL executavel**. Ainda assim, pinned replay exige forma
canonica nao vazia, arquivo local executavel e correspondencia exata de todos os
hashes. Nunca publique os `statements` brutos.

Uma excecao pinned fica obsoleta e falha quando nome e SQL voltam a coincidir. Nome
do ledger diferente do filename so e permitido para `version-collision`. Nesse
caso, a migration relacionada deve ser posterior, executavel, ter nome correspondente
ao ledger e hashes exatos; reuso, ciclos e cadeias sao rejeitados.

Referencias textuais `source`/`arquivo` em comentarios do ledger tem menor forca que
nome exato acompanhado por pelo menos uma prova de conteudo exata: SQL canonico,
`file-sha256` ou `sql-sha256`. O marker precisa ser unico, bem-formado e corresponder
ao arquivo atual; mera presenca nunca autoriza o replay. Sem essa prova, ou quando o
nome diverge, a referencia continua fail-closed e somente uma excecao pinned que
valide integralmente o ledger pode autorizar o replay. Markers malformados ou
conflitantes sempre falham.

### Coleta direcionada de evidencia cifrada

O workflow manual `Targeted Ledger Evidence` permite revisar uma lista explicita de
1 a 20 versoes sem publicar SQL. Ele roda exclusivamente sobre a `main`, valida o
fingerprint do banco oficial, exige TLS `verify-full` com a CA Supabase pinada e
forca a sessao PostgreSQL para `default_transaction_read_only=on`. O array integral
de `statements` e cifrado em memoria com AES-256-GCM; a chave de conteudo e envolvida
com RSA-OAEP-SHA256 e somente o envelope cifrado vira artifact por um dia. A chave
privada pertence ao solicitante e nunca deve ser enviada ao GitHub.

Em 07/09/2026, o run `34137899939` coletou somente `20260906090000` e
`20260906140000`. A descriptografia local autenticada confirmou a cardinalidade e o
hash do plaintext antes da classificacao. Nenhum statement bruto foi registrado em
logs ou versionado.

### Proveniencia da reconciliacao de 29/08/2026

Os hashes do manifesto v2 foram derivados dos registros exatos recuperados em modo
somente leitura pelo run `33255655034` (`Migration Ledger Evidence`), no commit
`650705780f8b91c017ffa4bce0fc8f24ba2f4962`. O envelope foi cifrado antes de virar
artefato; nomes e hashes foram revisados sem publicar os `statements`. O coletor e o
workflow eram de uso unico e foram removidos depois da verificacao. Nenhum registro
do ledger ou objeto do banco foi alterado por essa reconciliacao.

O run vivo `33256666088`, posterior a essa fotografia, observou temporariamente o
registro `20260829020000` com nome `mcp_exec_functions_harden`. Durante a execucao
concorrente de outro agente, a reconciliacao versionada `20260829060000` restaurou o
nome historico `fix_reassign_absent_agents_last_seen_at`, corrigiu a referencia stale
de `20260827130000` e registrou a propria operacao no ledger. O run `33257354121`
confirmou esse estado com 293 registros. Por isso a excecao de colisao permanece
fixada pelos hashes originais; o novo arquivo versionado espelha a operacao ja
aplicada, sem uma segunda escrita no banco por este fluxo. O `UPDATE` de nome exige
a assinatura estrutural e o SHA-256 domain-separated exato do array historico de
`statements`; assim um replay limpo de `mcp_exec`, `statements` nulos, conteudo
hibrido ou um corpo divergente permanecem intocados. Esse comportamento e a
idempotencia sao simulados em PostgreSQL 17 pelo guard offline.
Na referencia Gmail, a reconciliacao altera somente `statements[3]`; os demais
elementos de evidencia permanecem intactos mesmo se divergirem do resumo esperado.

Essa proveniencia nao autoriza excecoes futuras por analogia: toda nova divergencia
precisa de evidencia propria e hashes exatos, revisados em PR.

Em 31/08/2026, o run vivo `33383636827`, já na `main` e após validar o
fingerprint do projeto oficial, confirmou paridade de versões `317/317` e
detectou seis diferenças entre o replay local e a representação histórica do
ledger (`20260829060000` a `20260829110000`). O guard reforçado publicou somente
`ledger_name` e os hashes domain-separated/canônicos; nenhum elemento bruto de
`statements` foi registrado. As seis evidências foram fixadas individualmente no
manifesto: a `060000` como `safer-replay`, pois restaura os predicados do G-11,
e as demais como `format-only`, sustentadas pelo histórico Git e pelos nomes
idênticos do ledger.

O mesmo run observou a versão `20260830170000` já registrada. Dez minutos antes,
o run `33382898512` ainda media 316 registros e a apontava como única ausente.
O dry-run controlado `33383664637` não foi a origem da escrita: ele encontrou
`missing_count=0` e encerrou antes dos passos de runtime, dry-run do CLI e apply.
Essa concorrência é preservada como evidência operacional; nenhum registro do
ledger foi reescrito para mascará-la.

Por isso o guard tambem deve ser executado sem `DESTINO_URL` nos checks offline;
nesse modo apenas a consulta ao ledger e pulada.

---

## 3. `CREATE INDEX CONCURRENTLY` nao roda pelo gateway MCP

Erro `25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. O gateway
envolve cada chamada numa transacao.

- Tabela pequena: use `CREATE INDEX` simples. As 108 FKs de 27/08 rodaram em 278ms
  (maior tabela: 584 kB / 41 linhas).
- Tabela grande: rode por `psql` direto, fora de transacao.

O mesmo vale para `VACUUM` e `DROP INDEX CONCURRENTLY`.

---

## 4. `_foreign/` e `_superseded/`

Diretorios que comecam com `_` ficam fora do glob `supabase/migrations/*.sql`, logo fora
do `supabase db push`. Nada foi apagado.

| Diretorio | O que guarda |
|---|---|
| `_foreign/` | 7 migrations do Supabase self-hosted / Evolution, commitadas no repo errado |
| `_superseded/` | 4 migrations cuja DDL nunca foi aplicada aqui — os objetos vieram de outras migrations, ja registradas |

Cada diretorio tem um `README.md` com a prova. Leia antes de mover qualquer coisa de volta.

### Como confirmar que uma migration nao pertence a este banco

```sql
SELECT to_regclass('public.tabela_que_ela_manipula');  -- NULL = nao existe aqui
```

Cuidado com colisao de nome: `20260612150000` dropava `idx_contacts_name_trgm` pensando em
`evolution_contacts` do self-hosted, mas esse indice **existe** aqui em `public.contacts`.
Verificar a tabela nao basta — verifique tambem os nomes de indice e de funcao.

### Como confirmar que uma migration foi superada

Existir a tabela nao prova que o arquivo rodou. Compare objeto a objeto e rastreie a origem:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE array_to_string(statements,' ') ILIKE '%CREATE TABLE%minha_tabela%';
```

### Caso concreto: `20261001341230_f51_*` foi superada — nao editar, a substituta e a `f51c`

`20261001341230_f51_multiplix_confirm_dispatch.sql` declara a funcao com
`CREATE FUNCTION public.multiplix_confirm_dispatch(...)`, **sem `OR REPLACE`**. Ela aborta com
`42723 function "multiplix_confirm_dispatch" already exists with same argument types` em
qualquer banco onde a funcao ja exista — e neste banco ela existe desde
`20261001351230_f51a_multiplix_confirm_dispatch_fn.sql` (a parte aditiva, aplicada antes).

**Nao edite o arquivo antigo.** A versao que o substitui e:

```
supabase/migrations/20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql
```

### Caso concreto: `20261002701230_f62_*` foi superada — a substituta e a `f62b`

`20261002701230_f62_resposta_correlacionada.sql` cria `attribute_multiplix_item_reply(...)` e o
`CREATE FUNCTION` **passa sem reclamar** — mas a funcao quebra na **primeira chamada**:

- `SELECT COALESCE(NULLIF(value, '')::numeric, 72) INTO v_window FROM public.talkx_settings ...`
  → `talkx_settings.value` e **jsonb** (nao `text`), e `NULLIF(jsonb, '')` nao existe em Postgres.
  O sintoma que chega ao log e so o `CONTEXT: PL/pgSQL function
  attribute_multiplix_item_reply(text,text,text) line 31 at SQL statement`.

O erro nao aparece na criacao da funcao, em `deno check`, nem em revisao de texto: so no primeiro
contato que responder — isto e, em producao. Um erro irmao (`column item.replied_at does not
exist`) apareceu so no harness de banco, porque o fixture nao carregava a f51.

**No mesmo PR a `f62` foi descartada da arvore** — ela **nunca chegou a ser aplicada**. A migration
entregue e a `f62b`, que cria a funcao corrigida na **mesma assinatura** `(text, text, text)`, entao
nenhum chamador (o edge `_shared/talkx-reply.ts`) precisa mudar.

### Armadilha: editar uma migration ja registrada como pendente nao tem saida pelo caminho feliz

O `hermes-db-migrar` grava o sha256 do arquivo no momento do registro
(`~/.local/share/hermes-guard/mig-sha/<arquivo>.sql`) e o `hermes-tarefa-fechar` **recusa** fechar
enquanto o sha do arquivo divergir do registrado. A mensagem orienta a rodar `hermes-db-migrar
<arquivo>` de novo "para revalidar e registrar" — mas isso **nao funciona**: a guarda de versao exige
`version > max(version)` do ledger, e basta **outro chat** ter aplicado uma versao maior nesse
meio-tempo para a revalidacao virar impossivel (`ERRO: versao ... nao e maior que max(version)=... no
ledger`). O `--dry-run` tambem nao atualiza o sha (so imprime o SQL que seria rodado).

Regra pratica: **nao edite uma migration depois de registra-la como pendente.** Se errou, registre
uma substituta com `--nova` e **remova o arquivo errado da arvore** (foi o que este PR fez: o
`hermes-tarefa-fechar` aceita quando o arquivo nao esta mais la, e o `hermes-tarefa-mergear`
recalcula os pendentes a partir do PR). Deixar o arquivo errado na arvore, com conteudo diferente do
registrado, trava o fechamento nos dois caminhos.

### O hash da f51 no ledger diverge do arquivo — e a excecao registrada

O `O_MIGRATIONS` do `db-live-guard.yml` fica **vermelho** por causa dessa migration, e nao por
erro de conteudo: o arquivo no repo declara a funcao com `CREATE FUNCTION` (sem `OR REPLACE`),
enquanto o que **rodou** — na aplicacao pos-merge de 02/10/2026 — foi a versao equivalente
**com** `OR REPLACE`, que e a unica diferenca. O ledger preserva o que foi aplicado, entao os
dois hashes divergem (`arquivo=7cec99db...`, `ledger=ba9faefd...`).

**O arquivo nao pode ser reescrito** (migration registrada e imutavel, regra 7 do CLAUDE.md) e
**mover para `_superseded/` PIORA**: como a versao esta no ledger, o guard passaria a acusar
`Registro no banco sem arquivo no repo (DDL fora do Git)`, que e erro sem excecao. O caminho e o
**registro**:

```
scripts/db-audit/migration-evidence.json  →  kind: "ledger-divergence/pinned-replay"
                                              reason: "safer-replay"
```

Os quatro hashes saem medidos, nunca digitados:

```bash
# hashes do ARQUIVO (valida contra as entradas existentes: 50 amostras recalcularam certo)
node .tmp/calc-hashes.mjs supabase/migrations/20261001341230_f51_multiplix_confirm_dispatch.sql
# hashes do LEDGER: reconstroi os statements com o MESMO splitStatements do
# register-migration.mjs e confere o resultado contra o valor que o Postgres calcula
node .tmp/calc-ledger.mjs supabase/migrations/20261001341230_f51_multiplix_confirm_dispatch.sql
```

Para provar verde **sem** a `DESTINO_URL` (o guard aceita `PSQL_BIN` fake e `MIGRATIONS_DIR` de
fixture — sao as variaveis que ele documenta para teste offline): monte um diretorio com **so** a
migration alvo, um `psql` falso que imprime o JSON do ledger e rode com
`MIGRATION_EVIDENCE_PATH` apontando para um manifesto com **so** a excecao testada. Sem a excecao
o guard falha com `conteudo SQL divergente`; com ela, `OK`. Medido em 02/10/2026.

**Duas correcoes factuais sobre esta migration** (levantadas na auditoria de ledger de 02/10/2026):

1. O cabecalho da `f51c` afirma que o ledger **nunca** registrou a f51. Isso **deixou de ser
   verdade** em 02/10/2026: a f51 **esta** registrada (`version=20261001341230`,
   `name=f51_multiplix_confirm_dispatch`, 22 statements) — foi ela que entrou no ledger na
   aplicacao pos-merge. A `f51c` continua sendo a substituta canonica do **conteudo**, mas o
   registro existe. A f51c e migration ja aplicada: **corrigir no texto dela nao vale a pena**
   (regra 7), a correcao fica aqui.

2. **Num banco zerado, a ordem f51 -> f51a quebra.** A f51 declara a funcao com `CREATE FUNCTION`
   (sem `OR REPLACE`) e a f51a repete a declaracao: aplicando as duas em sequencia num banco novo,
   a **f51a** aborta com `42723 function "multiplix_confirm_dispatch" already exists with same
   argument types` (a f51, vindo antes, ja a criou). No banco atual isso nao aparece porque a
   f51 nunca rodou de verdade (entrou no ledger pelo replay com `OR REPLACE`). **Efeito pratico:
   `supabase db reset` / ambiente novo pela cadeia de arquivos nao sobe.** Nao corrigido aqui
   porque exige mudar uma migration aplicada ou inverter a ordem — decisao de outra tarefa.

Ela reafirma a funcao com `CREATE OR REPLACE` e traz o que faltava (ACL da RPC, `COMMENT`s,
`CHECK` de `reply_attribution`, as duas funcoes de trigger de bump de versao e os triggers).

Banco novo, com as migrations aplicadas em ordem, **nao tropeca**: `20261001341230` cria a
funcao (primeira a rodar), `20261001351230_f51a` e idempotente e `20261002461230_f51c` reafirma
tudo com `OR REPLACE`. O defeito so aparece em banco que **ja** tenha a funcao quando a
`20261001341230` tenta rodar — por isso a substituta existe, e por isso a `f51c` vai depois
das duas na ordem de versao.

Para confirmar o que esta no ledger deste banco:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE name ILIKE '%f51%' ORDER BY version;
```

---

### A condicao repetida na f59 (inofensiva, registrada para nao virar duvida)

A `20261002651230_f59_dead_letters_consultavel.sql` tem, no `list_multiplix_dead_letters`, a
condicao `AND i.status = 'failed'` **duas vezes** — uma antes do comentario que explica o criterio
do dead letter e outra depois. As duas são a **mesma** condicao, então o resultado e identico e a
consulta esta correta (provada verde no harness de banco descartavel e conferida no ledger).

**Nao corrija reescrevendo o arquivo**: a migration esta registrada e e imutavel (regra 7 do
CLAUDE.md) — e o proprio `hermes-db-migrar` recusa, porque a reserva da versao pertence a tarefa
que a aplicou. Reescrever criaria divergencia arquivo × ledger (o caso da f51 acima) sem ganho
nenhum, ja que a linha extra nao muda o plano de execucao. Criar uma migration NOVA so para
reescrever a funcao inteira seria pior: duplicaria ~70 linhas de corpo para tirar uma linha
repetida. **Fica como esta** — aqui registrado para que ninguem gaste tempo investigando depois.

## 5. Operacao pontual nao e migration

`VACUUM`, limpeza de bloat, backfill de uma vez — nada disso deve virar migration
replicavel. Se precisar registrar, o arquivo deve conter **so** o que e seguro reaplicar.

Exemplo real: `20260827130500_vacuum_autovacuum_threshold_reset_m05.sql`. O que foi executado incluia
`ALTER TABLE ... SET (autovacuum_vacuum_threshold=0, autovacuum_vacuum_scale_factor=0)` e
um `cron.schedule('one-time-vacuum-bloated-tables', '* * * * *', ...)`. O arquivo commitado
emite apenas os `RESET` idempotentes. Reaplicar o original faria o autovacuum disparar a
cada tupla morta e recriaria um cron de minuto em minuto — que, nas duas execucoes
registradas em `cron.job_run_details` (18:03 e 18:04 de 27/08/2026), saiu com
`status='failed'`.

---

## 6. Checklist antes de `supabase db push`

```sh
node scripts/db-audit/check-migration-drift.mjs        # DESTINO_URL setado
node --test scripts/db-audit/check-migration-drift.test.mjs  # fixtures + psql fake
node scripts/db-audit/supabase-usage-guard.mjs         # offline
ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d   # versao duplicada
```

A ultima linha existe porque isso ja aconteceu: em 27/08/2026 duas sessoes criaram
arquivos diferentes com o prefixo `20260827130500`.

---

## 7. Artefatos gerados automaticamente

`src/integrations/supabase/types.ts`, `supabase/schema-catalog.json` e
`supabase/schema-manifest.json` sao regenerados pelo workflow `types-sync`
(`.github/workflows/types-sync.yml`).

**Nunca editar esses tres arquivos manualmente.** Qualquer edicao sera sobrescrita
no proximo push de migration ou no cron semanal (segunda, 06:00 UTC).

A regra de fechamento tripla foi simplificada:

- ~~migration + registro no banco + catalog + manifesto + types~~ (anterior — manual, sujeita a drift)
- **migration + registro no banco** (atual — maquina propoe catalogo, manifesto e types em PR)

### Para sessoes Claude

Nao incluir `types.ts`, `schema-catalog.json` nem `schema-manifest.json` em commits de migration.
Ao adicionar uma tabela nova, o types sera atualizado automaticamente pelo bot.

### Para diagnosticar drift manual

Se o `types.ts` estiver desatualizado, dispare manualmente:
`GitHub Actions > types-sync > Run workflow`

O `db-live-guard.yml` tambem verifica o frescor dos tres artefatos contra o banco
e falha se houver divergencia. Ele nao executa codigo de pull request nem expoe
`DESTINO_URL` a eventos nao confiaveis.

---

## 7. Auditoria de arquivos que nao aplicam (replay local, 03/10/2026)

O replay local das 768 migrations (`scripts/db-audit/replay-local.sh`, relatorio em
`docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md`) aponta arquivos que **nao aplicam**. Cada um foi
investigado no banco canonico — o erro no log **nao** decide se ha trabalho a fazer. Situacao dos seis:

| Arquivo | Erro no replay | Situacao real |
|---|---|---|
| `20260927450000_fix_indexes_checks_cleanup.sql` | `syntax error at or near "VAFIDD"` | **Superada.** O ledger atribui esta versao a `gamification_guard_fix_xp_cap`; o arquivo **nunca aplicou**. As constraints que ele cria existem e estao `validated=true`. **Nada a reparar.** |
| `20260916230000_talkx_e93_settings.sql` | `syntax error at or near "NOT"` (`CREATE POLICY IF NOT EXISTS` nao existe no PG) | **Superada** por `20260930112833_talkx_settings_policies_replay_safe` e `20260930410000_talkx_settings_replay_idempotent`. `talkx_settings` existe, RLS on, 2 politicas. **Nada a reparar.** |
| `20260929370000_contacts_soft_delete_and_search_filters.sql` | `cannot change return type` | **Superada.** O filtro `deleted_at IS NULL` que ela queria **ja existia** em producao, adicionado antes por `20260929140000_search_contacts_returns_address`; a versao vigente e a de `20260930450000_contacts_include_legacy_filter`. **Nada a reparar.** |
| `20260925170000_add_reminders_pending_to_tab_counts.sql` | `cannot change return type` | **Intencao nao chegou.** `get_conversation_tab_counts` em producao devolve 3 colunas; `reminders_pending` **nunca existiu**. Causa: `create or replace` nao muda tipo de retorno e o `DROP FUNCTION` que resolveria esta comentado no arquivo irmao. Impacto zero hoje (o app removeu o campo em `useConversationTabCounts.ts`). **Decisao pendente:** reparar por versao nova ou formalizar o abandono. |
| `20260928140200_tab_counts_tasks_own.sql` | `cannot change return type` | Mesma funcao e mesma situacao do anterior. |
| `20260926410000_add_fk_support_indexes.sql` | `relation ... already exists` | **Nao idempotente**, inerte no banco real (o indice ja existe). **Nada a reparar.** |

### Como medir isso (o metodo importa)

Nao basta ler o log do replay. Pergunte ao banco canonico o que **de fato** existe:

```sql
-- 1) a funcao existe como o arquivo declara?
select pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '<funcao>';

-- 2) os marcadores da intencao estao no corpo aplicado?
select position('<trecho>' in p.prosrc)  -- 0 = ausente
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '<funcao>';
```

Contagem de colunas menor que a declarada ⇒ o `create or replace` falhou **em producao tambem**.

**Armadilha que quase virou regressao:** `search_contacts` em producao nao tem a clausula
`queue_members` que o arquivo de 29/09 carregava — pareceu intencao perdida. Nao era: o ultimo arquivo
que define a funcao (`20260930450000_contacts_include_legacy_filter.sql`) usa `get_visible_agent_ids`,
ou seja, o modelo de visibilidade foi **substituido de proposito**. "Reparar" ali teria reintroduzido
um caminho de autorizacao aposentado. **Compare marcador ausente com o ultimo arquivo que define o
objeto antes de tratar como defeito.**

