Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 187s;OK lint 1s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (15/10 21:47, gerados por máquina: valem mais que números escritos à mão)
```
 ...1136_audio_memes_bucket_limits_admin_delete.sql |  48 +++++
 supabase/tests/audio_memes_bucket_admin_delete.sql | 213 +++++++++++++++++++++
 2 files changed, 261 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261016001136_audio_memes_bucket_limits_admin_delete.sql, supabase/tests/audio_memes_bucket_admin_delete.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bPOLICY\b


## O que mudou e por quê
- supabase/migrations/20261016001136_audio_memes_bucket_limits_admin_delete.sql (nova, aditiva):
  (1) policy de DELETE "Admins can delete any audio meme" no bucket audio-memes, TO authenticated,
  USING bucket_id = 'audio-memes' AND public.is_admin_or_supervisor(auth.uid()) — policy permissiva que
  SOMA-SE a "Users can delete own audio memes", que NAO foi tocada;
  (2) teto e filtro de tipo passam a valer no servidor — file_size_limit = 5242880 (5 MB),
  allowed_mime_types = {audio/*} — com guarda que falha alto se o bucket nao existir. O bucket continua
  public = true.
- supabase/tests/audio_memes_bucket_admin_delete.sql (prova nova; roda como papel real, em transacao que
  termina em ROLLBACK).

Em linguagem comum, o que muda:
- admin/supervisor: passa a apagar QUALQUER audio meme do bucket, inclusive os antigos gravados na raiz.
  O app grava o arquivo sem pasta (`meme_<ts>_<uuid>.mp3`, em src/hooks/communication/useAudioMemes.ts) e a
  policy antiga comparava a pasta com o id do usuario: ela nunca casava, entao NINGUEM conseguia apagar esses
  arquivos e o app mostrava o aviso de "arquivo ficou orfao".
- agente comum: nada muda — apaga o arquivo da pasta dele e continua barrado no meme de outro.
- visitante (anon): nada muda — nao apaga, e a leitura do bucket publico segue igual.
- qualquer cliente autenticado: upload acima de 5 MB ou fora de audio/* passa a ser recusado pelo servidor,
  nao apenas pelo navegador.

## Prova
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK; `banco_local` e pulado por nao receber nome de conjunto — e assim que o fechar chama). O banco em si esta provado pelo teste abaixo, rodado no conjunto `v2-26101521094dda` com as migrations reais.
- vermelho antes (migration desfeita no banco local): `zapp-db-local psql . v2-26101521094dda < supabase/tests/audio_memes_bucket_admin_delete.sql`
  -> `NOTICE: T1 FALHOU: admin apagou 0 linha(s) do meme de outro usuario, esperado 1` / `NOTICE: T2 FALHOU: admin apagou 0 linha(s) do objeto legado na raiz, esperado 1` / `NOTICE: T7 FALHOU: file_size_limit = <NULL>, esperado 5242880 (5 MB)` / `ERROR: PROVA FALHOU: 3 de 8 verificacoes falharam`
- verde depois (mesmo comando, migration aplicada): `NOTICE: PROVA OK: 8 de 8 verificacoes passaram`, exit 0.
- rollback executado de verdade, depois de aplicada: `drop policy if exists "Admins can delete any audio meme" on storage.objects;` -> `DROP POLICY`; `update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'audio-memes';` -> `UPDATE 1`; estado conferido = `0` policy, `NULL|NULL|t`. A migration foi reaplicada em seguida com `hermes-db-migrar <arquivo>` -> `DROP POLICY / CREATE POLICY / DO / UPDATE 1 / COMMIT`, e foi esse estado que gerou o verde acima.
- `node scripts/ci/check-test-inventory.mjs` reprova 6 `.test.sh` PRE-EXISTENTES em scripts/db-audit/ (nenhum deles e meu). Minha prova e `.sql` em supabase/tests/, caminho que o inventario nao olha e que o db-guard roda por glob — nada foi registrado, removido ou editado em workflow.
- Escopo do diff: so a policy nova e um UPDATE de uma linha de storage.buckets. Nenhum GRANT/ACL, nenhuma tabela, nenhum dado de tabela do app, nenhum gatilho; o bucket segue publico.

## O que NAO fiz e por que
- Nao toquei na policy "Users can delete own audio memes" nem na leitura publica (criterio 2 do cartao): sao provadas sem regressao no proprio teste (T3 e T6).
- Nao deixei o bucket privado nem troquei para URL assinada: manter publico e criterio do cartao (audio_memes.audio_url guarda a URL publica) e a decisao de migrar para URL assinada e do dono.
- Nao editei arquivo fora de supabase/migrations/ e supabase/tests/.
- Achado fora do escopo (comentado no cartao, nao corrigido): como o app grava os audios na RAIZ do bucket, a policy "dono apaga o proprio" (pasta = auth.uid()) nao casa para uploads do app — um agente comum hoje nao consegue apagar o proprio meme. Correcao exige policy por owner ou upload em pasta do usuario: outro cartao.
