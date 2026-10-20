Especialista: workersql
Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê

- `supabase/migrations/20261015224516_audio_memes_storage_paths.sql` (novo): atende os 4 itens do cartão (PK-16, doc 11 da 2ª passada) num só arquivo aditivo.
- (A) `storage.objects` do bucket `audio-memes`: as 3 policies de escrita passam a exigir, para o atendente comum, a pasta `<auth.uid()>/`, e admin/supervisor seguem livres nas 3. Achado real do cartão: INSERT e UPDATE já tinham a rama `is_admin_or_supervisor`, mas a policy de **DELETE tinha perdido essa rama** nas reconstruções de 20260402214625 e 20260511233306 — admin/supervisor não conseguia apagar o arquivo de um meme de outro autor. A UPDATE ganhou `WITH CHECK` explícito (antes só tinha `USING`).
- (B) Bucket temporário do trocador de voz: `voice-changer-tmp` **privado** (`public = false`), 25 MiB, MIME de áudio, com policies de leitura/escrita/atualização/exclusão restritas à pasta do próprio usuário (admin/supervisor livres). Antes o trocador de voz gravava no bucket público, sem TTL.
- (B2) Expurgo por TTL no molde do PE-102: função `public.purge_voice_changer_tmp(p_ttl_hours, p_limit)` (SECURITY DEFINER, `search_path` fixo, EXECUTE só para `service_role`) + job horário `voice-changer-tmp-purge` no `pg_cron`. A função enfileira os objetos vencidos na fila de expurgo de Storage já existente (`talkx_storage_purge_queue`, M-DB-01); quem apaga o objeto e o arquivo é o drenador da M-DB-01, pela API do Storage — não se faz DELETE direto em `storage.objects` (o gatilho `storage.protect_delete()` bloqueia, e apagar só a linha deixaria órfão o arquivo do Storage).
- (C) `audio_memes` e `audio_meme_favorites` adicionadas à publicação `supabase_realtime` (idempotente; realtime do catálogo e dos favoritos).
- `supabase/tests/audio_memes_storage_paths.sql` (novo): a prova. Parte 1 confere o estado final (policies com rama de admin, bucket privado com limites, função, job, publicação). Parte 2 roda como os papéis REAIS (`authenticated`): atendente sobe na própria pasta e é **negado** na pasta de outro (42501), e o expurgo enfileira só o objeto vencido, preservando o novo. A Parte 2 cria a fila de expurgo dentro da transação descartada (fixture) porque o replay do banco local ainda pula essa migration.

## Prova

- Arquivos no diff: 2 (1 migration nova + 1 teste de banco novo, `supabase/tests/audio_memes_storage_paths.sql`). Nenhum outro arquivo foi tocado.
- o teste é de BANCO: suíte `.sql` em `supabase/tests/`, executada à mão contra o banco local (o runner automático do `zapp-verify` cobre `.test.ts`/`Edge`, não `.sql`). Ele falha SEM a migration (linha vermelha abaixo) e passa com ela — é a prova do defeito, não um teste tautológico.
- vermelho antes: `docker exec -i <db> psql -v ON_ERROR_STOP=1 < supabase/tests/audio_memes_storage_paths.sql` → `ERROR: audio_memes_storage_paths: estado final incompleto -> policy audio-memes sem admin: Users can delete own audio memes; bucket voice-changer-tmp ausente/nao-privado/sem limite; ... funcao purge_voice_changer_tmp ausente; fora da publicacao realtime: audio_memes, audio_meme_favorites`
- migration aplicada: `hermes-db-migrar supabase/migrations/20261015224516_audio_memes_storage_paths.sql` → saída do bloco de blindagem sem erro (o próprio arquivo só commita se o estado final existir)
- verde depois: `docker exec -i <db> psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/audio_memes_storage_paths.sql` → `NOTICE: PK-16 PARTE 1 OK` / `NOTICE: PK-16 PARTE 2 OK: pasta alheia negada (42501)` / `NOTICE: PK-16 PARTE 2 OK: vencido enfileirado, novo preservado ({"bucket": "voice-changer-tmp", "enqueued": 1, "ttl_hours": 24})` → `ROLLBACK`
- rollback provado: as linhas `-- Rollback (SQL executavel, na ordem)` rodadas dentro de `begin;/rollback;` no banco local → todas as 19 sentenças executam sem erro (desagenda o job, dropa a função, tira as duas tabelas da publicação, remove as 4 policies do bucket temporário, restaura as 3 policies do `audio-memes` ao estado exato anterior — DELETE sem rama de admin, UPDATE sem WITH CHECK — e remove o bucket quando vazio).
- critério 4 (zapp-verify verde): `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (456s)` / `EXIT=0`. O `banco_local` aparece como `NÃO VERIFICADO: sem nome de conjunto` porque é assim que o próprio `hermes-tarefa-fechar` chama o verificador; a prova de banco deste cartão é o teste `supabase/tests/audio_memes_storage_paths.sql`, cujo arquivo é manual (não entra em runner automático) — ele foi executado à mão contra o banco local e está na prova acima.

## O que NÃO fiz e por quê

- Não mudei caminho de upload no front nem na Edge: quem escreve `meme_<ts>_<uuid>.ext` é o PK-17 (hugo). Esta migration entrega o CONTRATO do banco (pasta `<auth.uid()>/`); registrei no comentário do cartão o que o front precisa ajustar.
- Não fiz DELETE direto em `storage.objects`: deixaria o arquivo órfão no Storage. O expurgo passa pela fila e pelo drenador da M-DB-01, como manda o repositório.
- Não toquei o banco de produção nem `git push`: por regra, só o Joaquim autoriza.
