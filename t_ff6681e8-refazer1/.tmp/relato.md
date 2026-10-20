Especialista: semisenior
skill de area: fabrica:area-testes-do-produto. Decisao do cartao: MANTER os redondos (prova funcional abaixo).

## O que mudou e por que
- supabase/tests/chat_media_buckets_limits.sql (reescrito, 177 linhas): T0 agora prova bucket fechado em sessao restrita (T0a: SET ROLE authenticated + sem bypass + 0 buckets visiveis) e no estrutural (T0b: existe + public=false); T1 com tetos EXATOS por bucket (audio-messages = 16777216, whatsapp-media = 104857600, do catalogo); T2 sem numero redondo (audio-messages = exatamente os 6 MIMEs de audio; whatsapp-media contem os 24 MIMEs das 4 familias); T3/T4 sobre metadata->>'mimetype' (storage.objects nao tem coluna media_type).

## Prova (banco local v2-base-596f08c8, Postgres 17, tudo com ROLLBACK; base intacta)
- vermelho antes: `psql -f chat_media_buckets_limits.sql` → `ERROR: T1 reprovado: audio-messages exige teto de 16 MB (16777216, teto do audio em :37); atual=<NULL>` (T0 passa; T1/T2 detectam a migration ausente)
- verde depois (PK-26 simulado em transacao): → `NOTICE: PK-26 buckets OK: 2 privados, tetos 16/100 MB, allowlists por familia` + `DO`
- negativo T0 (public=true): → `ERROR: T0 reprovado: whatsapp-media ficou publico (public=t)`
- negativo T1 (teto 1 GB): → `ERROR: T1 reprovado: whatsapp-media exige teto de 100 MB (104857600, teto do documento em :69); atual=1073741824`
- negativo T0a (policy temporaria expondo metadado): → `ERROR: T0a reprovado: papel restrito enxerga 8 bucket(s); metadado de bucket privado nao pode vazar`
- negativo T2 (5 de 6 MIMEs): → `ERROR: T2 reprovado: audio-messages exige exatamente os 6 MIMEs de audio do catalogo (:38-:45); atual={audio/aac,audio/amr,audio/mpeg,audio/ogg,audio/opus}`
- negativo T4 (objeto .exe): → `ERROR: T4 reprovado: executavel em bucket de midia`
- tolerancia T3 (objeto legado sem mimetype): verde mantido
- pos-provas: `storage.objects` = 0 linhas, policies temporarias = 0 (tudo desfeito)

## Pontos do revisor
- Ponto 1 (nomes inventados): NAO PROCEDE como receita. Verifiquei antes de obedecer: chat-audio/chat-video/chat-docs/chat-images tem zero ocorrencias em HEAD, dia/2026-10-14 e supabase/; docs/ledger/limites.md e corpo-pr.md nao existem nesses estados; a migration integrada 20260905030000 cria e fecha whatsapp-media/audio-messages (:11) com 6.074 objetos (:2); o banco local migrado tem os 2 buckets privados e nenhum chat-*. Trocar os nomes criaria um T0 que falha para sempre ('bucket nao existe'). Mantive os nomes reais e provei T0/T1/T2 neles, cada expectativa ligada ao trecho que a sustenta (comentarios :3-:18 do arquivo).
- Ponto 2 (T0 em sessao elevada): resolvido — supabase/tests/chat_media_buckets_limits.sql:76-94. T0a roda SET ROLE authenticated (funciona a partir de service_role, verificado), prova current_user, rolbypassrls=false e 0 buckets visiveis; RESET ROLE no caminho feliz e no EXCEPTION. Prova: negativo T0a acima.
- Ponto 3 (teto frouxo): resolvido — supabase/tests/chat_media_buckets_limits.sql:111-119. Tetos exatos do catalogo src/utils/whatsappFileTypes.ts: audio-messages = 16 MB (:37), whatsapp-media = 100 MB (:69, maior familia do bucket misto). Prova: vermelho NULL acima + negativo de 1 GB acima.
- Ponto 4 (T2 redondo): resolvido — supabase/tests/chat_media_buckets_limits.sql:121-134. audio-messages = conjunto exato dos 6 MIMEs (:38-:45, <@ + @> + tamanho 6); whatsapp-media = superconjunto dos 24 MIMEs das 4 familias (informa qual MIME falta). Prova: negativo de 5/6 acima.
- Decisao (manter ou trocar): MANTER, com prova funcional nos mantidos (ver Ponto 1). Justificativa do ledger: nao ha ledger observavel com os 4 nomes; ha grep zerado + migration integrada + banco local.

## O que NAO fiz e por que
- Nao criei a migration do PK-26: o cartao proibe (só o teste).
- Nao toquei nos 2 arquivos .test.ts: a recusa so cita o .sql; diff = 1 arquivo.
- Nao rodei zapp-verify --rapido: ele nao toca supabase/tests (cabecalho do arquivo); a suite do arquivo foi executada direto no Postgres (provas acima).
- Nao usei cherry-pick/patch/checkout do trabalho anterior: proibido pelo cartao; reescrevi a partir do proposito e verifiquei tudo do zero.

## Risco conhecido (colisao semantica, nao deste cartao)
- Existe a trilha N-010 nao integrada (commit e5a85fb3d7) fixando 25 MB nos mesmos buckets; se ela integrar, este contrato (16/100 MB do catalogo) fica vermelho. Decisao do valor e do integrador/Joaquim; meu contrato deriva do catalogo do front, citado por linha.
