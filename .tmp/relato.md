Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- scripts/db-audit/talkx-n102-window.test.sh (novo): prova REAL, em Postgres 17 descartável (docker), do contrato de public.talkx_campaign_window_open(uuid,timestamptz) e da validação de send_weekdays nas RPCs de limites, sob papéis REAIS (anon / authenticated / service_role, sem mocks). Aplica a BASE real 20261009203548 e, depois, toda a leva por glob supabase/migrations/*_talkx_n102_window_fixes.sql (tolera 1 arquivo se o integrador colapsar as 4 fatias).
- .github/workflows/db-guard.yml: UMA linha de registro (passo "Simular janela de envio e ACL do TalkX sob papeis reais (N-102)", com TALKX_N102_WINDOW_TEST_POSTGRES_IMAGE), chamando retry-disposable-postgres-test.sh. Nada mais tocado no YAML.
- O teste tem BLOCO A (estado da base = defeito) e BLOCO B (estado com a leva = contrato). `TALKX_N102_SKIP_FIX=1` não aplica a leva e reproduz o estado vermelho.

## Prova
Comando: `bash scripts/db-audit/talkx-n102-window.test.sh`
- VERMELHO (sem a correção, `TALKX_N102_SKIP_FIX=1`) → EXIT=1:
  [PASS] A1..A5 (os 4 defeitos confirmados na base)
  [FAIL] BLOCO B1: authenticated NAO deveria ter EXECUTE na RPC, obtive 't'
- VERDE (com a leva) → EXIT=0 (log completo também anexado ao cartão):
  [PASS] A1 (defeito de acesso): authenticated TEM EXECUTE na RPC (vaza a janela de campanha alheia)
  [PASS] A2 (defeito de fuso): p_at de 2026-10-12 01:00Z e avaliado como segunda UTC (local SP e domingo 22:00)
  [PASS] A3 (defeito de fuso no DND): 2026-10-13 00:30Z e lido como dentro do DND, mas em SP sao 21:30 (fora)
  [PASS] A4 (defeito de cast): send_weekdays [7] vaza 42846 na base (SQLSTATE=42846)
  [PASS] A5 (defeito de rollback): o upsert da base sobrescreveu o dnd_hours do dono B
  [INFO] leva aplicada (4): 20261013085500_..._fixes.sql 20261013230014_..._fixes.sql 20261013230015_..._fixes.sql 20261013235900_..._fixes.sql
  [PASS] B1 (acesso): authenticated chamando a RPC de campanha alheia e negado (SQLSTATE=42501)
  [PASS] B1 (acesso): so service_role executa; authenticated/anon recebem 42501
  [PASS] B2 (fuso): o dia da semana passa a ser o dia LOCAL da campanha (America/Sao_Paulo)
  [PASS] B3 (fuso no DND): a janela de nao perturbe e avaliada na hora local (21:30 fora de 22:00-08:00)
  [PASS] B4a (contrato): send_weekdays [7] e recusado com 22023 (SQLSTATE=22023)
  [PASS] B4b (contrato): send_weekdays nao-inteiro e recusado com 22023 (SQLSTATE=22023)
  [PASS] B4c (contrato): send_weekdays escalar (nao-array) e recusado com 22023 (SQLSTATE=22023)
  [PASS] B4d (contrato): send_weekdays valido [0..6] e aceito e a revision avanca (2)
  [PASS] B5: a RPC segue SECURITY DEFINER com search_path=public, pg_temp
  [PASS] B6: o upsert guardado da fatia nao toca o dnd_hours de outro dono
  [PASS] B7: rollback executavel, reversivel e preservando o dnd_hours do dono B
  [OK] Talk X N-102: window_open respeita o fuso da campanha, ACL so service_role, send_weekdays validado (22023) e rollback guardado.
- `node scripts/ci/check-test-inventory.mjs`: o meu .test.sh NÃO aparece entre os órfãos (o passo está no db-guard.yml). O check segue vermelho por 6 órfãos PRÉ-EXISTENTES de outros cartões — registrado em comentário no cartão.

## O que NÃO fiz e por quê
- Não commitei as migrations (base + 4 fatias): o cartão manda tocar só o .test.sh e a linha do db-guard.yml; a base é a preparação t_37e0dde7 e as fatias são t_24edcc38/t_a631f82f/t_59210b33/t_7fa3929d (já na fila). A prova vermelho→verde foi rodada com elas presentes no workspace; os dois logs vão anexados. O teste falha com mensagem explícita ("migration base ausente no workspace") se elas ainda não estiverem integradas.
- Não mexi no teste Deno do cartão-irmão (t_24edcc38) nem em código de produção.
- Não alterei nenhum teste existente (nem skip, nem timeout): só adicionei um arquivo e uma linha.
