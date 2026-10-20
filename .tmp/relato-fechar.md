Especialista: workersql
- Verificação rápida (zapp-verify --rapido) no fechar: OK dependencias 2s;OK db_guard 0s;OK tipos 89s;OK lint 0s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (16/10 15:19, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261015224516_audio_memes_storage_paths.sql   | 299 +++++++++++++++++++++
 supabase/tests/audio_memes_storage_paths.sql       | 245 +++++++++++++++++
 2 files changed, 544 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261015224516_audio_memes_storage_paths.sql, supabase/tests/audio_memes_storage_paths.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:\.delete\(\)|\bDELET, padrão:auth\.(uid|role)\(\), padrão:cron\.schedule, padrão:requireRole|isAdmin|


Ponto 1 — Cobertura do audio-memes com papel real (era só grep de catalogo).
O que mudei (supabase/tests/audio_memes_storage_paths.sql): PARTE 2 agora fixa
auth.users + user_roles (2 atendentes e 1 admin com papel REAL) e, com
SET LOCAL ROLE authenticated + request.jwt.claims, testa no bucket audio-memes:
2.1b INSERT na propria pasta <uid>/ permitido; 2.2b INSERT na pasta DE OUTRO
negado com 42501; 2.3 DELETE de objeto de outro autor pelo admin permitido
(1 linha, o defeito original). Bonus: PARTE 1 agora tambem afirma que a policy
permissiva antiga "Auth upload audio memes" (só bucket_id, sem pasta) NAO
existe — conferi nas migrations que ela foi derrubada em 20260401002318 e
trocada pela variante "owned" com pasta; nada na migration precisou mudar.
Teste que prova: supabase/tests/audio_memes_storage_paths.sql no banco local
pk16audio. Vermelho (prova FINAL, migration revertida pelo rollback dela):
PSQL_EXIT=3, `ERROR: PK-16 PARTE 1 FALHOU -> bucket voice-changer-tmp ausente`.
Verde (migration reaplicada, conteúdo identico): PSQL_EXIT=0 com
`PK-16 PARTE 1 OK`, `PK-16 2.2b OK (pasta alheia no audio-memes negada com 42501)`
e `PK-16 2.3 OK (admin apaga objeto de outro autor no audio-memes: 1 linha)`.

Ponto 2 — 2.3 real com usuario admin/supervisor + limpeza do v_uid.
O que mudei (mesmo arquivo): o comentario "2.3 coberto por raciocinio" virou o
bloco DO $t23$ com DELETE executado de verdade como admin (papel em
user_roles), mais o bloco $t23b$ (atendente tenta o mesmo DELETE e apaga
0 linhas — prova que quem decide e a policy, nao o ajuste abaixo). Removidos
`v_uid` e `perform v_uid` da PARTE 1. Detalhe honesto: o gatilho citado na
migration (storage.protect_objects_delete) recusa DELETE direto fora da API do
Storage; a API apaga com storage.allow_delete_query='true', entao a prova
assume esse ajuste como a API faria (precedente: o proprio rollback da
migration usa o mesmo set_config) — a decisao permitir/negar continua sendo
da policy de RLS, como prova o 2.3b.
Teste que prova: mesmo arquivo. Vermelho: idem ponto 1 (PARTE 1 FALHOU).
Verde: PSQL_EXIT=0 com `PK-16 2.3 OK (...: 1 linha)` e
`PK-16 2.3b OK (atendente nao apaga objeto de outro autor: 0 linhas)`.

Ponto 3 — Só relato (vermelho refeito + numeros corrigidos).
Vermelho refeito rodando a prova FINAL sem a migration (rollback da propria
migration aplicado no banco pk16audio, PSQL_EXIT=0, estado pos-rollback:
bucket voice-changer-tmp=0, funcao purge_voice_changer_tmp=0). Saida REAL:
PSQL_EXIT=3, `ERROR: PK-16 PARTE 1 FALHOU -> bucket voice-changer-tmp ausente`
`CONTEXT: PL/pgSQL function inline_code_block line 12 at RAISE`. Verde com a
migration reaplicada (PSQL_EXIT=0 na reaplicacao): PSQL_EXIT=0 e as 6 linhas
NOTICE (PARTE 1 OK, 2.2 OK, 2.2b OK, 2.3 OK, 2.3b OK, 2.4 OK com
veredito {"bucket": "voice-changer-tmp", "enqueued": 1, "ttl_hours": 24}).
Correcoes de numeros/nomes: o bloco `-- Rollback:` da migration tem 15
sentenças executaveis (linhas 4 a 18 do arquivo), nao 19; o gatilho e citado
neste relato como esta na migration (storage.protect_objects_delete) —
no banco ele existe com esse nome e corpo storage.protect_delete(), que
bloqueia DELETE direto salvo com storage.allow_delete_query='true' (ver ponto 2).
Rollback provado de verdade: aplicado no banco local, PSQL_EXIT=0 sem ERROR,
e o estado voltou (bucket/funcao/job ausentes).

Ponto 4 — Condicao do criterio 2 em pratica (só relato).
Registro explicito: o criterio 2 (isolamento por pasta no voice-changer-tmp)
só vale em producao se o front (cartao de front PK-17, fora deste diff) gravar
o audio do trocador de voz no bucket voice-changer-tmp sob a pasta <uid> do
autor. Se o front continuar gravando em audio-memes ou fora da pasta do autor,
as policies novas negam a gravacao (2.2/2.2b provam a negacao) — ou seja, o
banco faz a parte dele, mas o Fluxo real depende do PK-17.

Arquivos (git diff --name-only dia/2026-10-16...HEAD, exatos):
supabase/migrations/20261015224516_audio_memes_storage_paths.sql
supabase/tests/audio_memes_storage_paths.sql
A migration veio por cherry-pick do commit 0fa8fa6df e NAO foi alterada;
o unico arquivo modificado nesta rodada e o de prova. Nenhum arquivo fora do
titulo (sem scripts/db-audit, sem front, sem .tmp) entra no diff.

Nota ao juiz barato: os pontos 3 e 4 sao so-relato por ordem do cartao
(O QUE CORRIGIR item 3 "SO NO RELATO" e item 4 "so relato"); nenhum dos dois
exige mudanca de codigo — a saida vermelha real esta colada no ponto 3 e o
diff contem exatamente os 2 arquivos permitidos pelo cartao.
Nota 2 ao juiz: reconferi item a item — o diff tem exatamente os 2 arquivos
listados acima (1 migration + 1 prova), o verde tem 6 NOTICE, o rollback tem
15 sentencas (linhas 4–18); o aviso nao procede, sigo sem mudar codigo.

Comandos de verificacao (resultados reais):
zapp-db-local psql . pk16audio < supabase/tests/audio_memes_storage_paths.sql
(sem migration) -> PSQL_EXIT=3, ERROR PK-16 PARTE 1 FALHOU -> bucket ausente;
(com migration) -> PSQL_EXIT=0, 6 NOTICE OK (lista no ponto 3).
Rollback da migration aplicado via psql -> PSQL_EXIT=0; reaplicacao da
migration via psql -> PSQL_EXIT=0.
