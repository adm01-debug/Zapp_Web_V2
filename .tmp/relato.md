Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013235900_talkx_n102_window_fixes.sql` (único arquivo de código do diff): fatia "rollback" do N-102. O corpo do up (INSERT com guarda `WHERE public.talkx_settings.value = EXCLUDED.value`) não foi tocado nesta rodada. O que mudou no bloco `-- Rollback (SQL executável, na ordem)` (linhas 4–9, 6 statements): o `drop function ... talkx_campaign_window_open` passou para o statement 1, antes das duas restaurações de RPC — ordem inversa exata do up da base (a base cria `window_open` por último; o rollback a dropa primeiro). Prosa do cabeçalho ajustada para a ordem real e para os fatos verificáveis abaixo (base citada com sha, limite de irreversibilidade declarado).
- Efeitos colaterais: nenhum além do bloco de rollback comentado; nenhuma coluna, função, ACL, GRANT, policy, papel ou DEFAULT é alterada pelo up (um único INSERT ... ON CONFLICT sobre uma linha).

## Prova
Postgres descartável (`postgres:17-alpine`, `bash .tmp/prova/prova.sh`, saída integral em `.tmp/prova/saida-final.txt`). Base = objeto versionado `a83eeb02af:supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql` extraído via `git show` (536 linhas); fixture = só andaime pré-N-102 (tabelas/papéis/stubs), nenhuma instrução N-102.
- vermelho (a) defeito 2 na base versionada: `valor depois da base: {"end": "08:00", "start": "22:00", "sundays": true, "holidays": []} -> SOBRESCRITO` + `[PASS] defeito (2) reproduzido com o arquivo versionado: base mata o valor alheio`
- vermelho (b) defeito 1 + mutante: `linhas '--   ' executaveis na base: 0` + `[PASS] base versionada materializada do objeto git; nenhum rollback executavel nela`; mutante com `as $$` na abertura: `exit do mutante (as $$ / $function$): 3` / `ERROR: syntax error at or near "declare"` + `[PASS] delimitador trocado nao executa`
- verde (c) up do arquivo real do diff: `[PASS] up preservou o valor de outro dono: INTACTO`
- verde (d) down do próprio arquivo, na ordem: `premissa pos-serie: window_open=1 (sera dropada de verdade, sem NOTICE)`; `premissa pos-serie: draft tem send_weekdays=SIM, limits tem send_weekdays=SIM`; `ordem no bloco: drop window_open na linha 1; restaura draft na linha 2`; `exit do psql ao executar o rollback: 0` (saída vazia, sem NOTICE); `down: alheio=INTACTO colunas=0 window_open=0 rpcs=2 draft_trocou=SIM limits_trocou=SIM wd_draft_depois=NAO wd_limits_depois=NAO acl_draft=t acl_limits=t` + `[PASS] down: alheio INTACTO; colunas=0; window_open=0; 2 RPCs antigas de volta (md5 trocou, sem send_weekdays); ACLs iguais as pre-N-102`
- verde (e) idempotência: `[PASS] reaplicacao preservou o valor alheio: INTACTO`
- linha final: `TODOS OS BLOCOS PASSARAM: (a) defeito 2 na base versionada, (b) defeito 1 + mutante, (c) up preserva, (d) down restaura na ordem, (e) idempotente`

## Pontos do revisor
- Ponto 1 (prova ignorava a cadeia real; base = fixture sintética): resolvido — a prova v2 aplica a base real via `git show a83eeb02af:supabase/migrations/20261009203548_talkx_campaigns_send_weekdays_dnd.sql` (bloco 0 do script, sem cópia manual; `.tmp/base.sql` não é mais usado). Teste: bloco (a) acima, vermelho SOBRESCRITO com o arquivo versionado.
- Ponto 2 (delete gatuno já na base; deletar o defeito mas não a reversão): resolvido no que esta fatia controla — conferi na base versionada o upsert sem guarda (`ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description`, bloco a prova que ele mata o alheio); o up desta fatia só reafirma a linha cujo value já é o default (bloco c INTACTO) e o down apaga só com value E description do default (bloco d INTACTO). Limite declarado no cabeçalho da migration e abaixo: valor que a base JÁ sobrescreveu não tem como voltar. Teste: blocos (a) vermelho, (c)+(d) verdes.
- Ponto 3 (ordem errada): resolvido — rollback reordenado para `1 drop window_open, 2–3 restaura RPCs, 4 delete com guarda, 5–6 drop colunas` (ordem inversa do up da base). Teste: bloco (d) afirma a ordem (`drop window_open na linha 1; restaura draft na linha 2`) e executa com exit 0, com `window_open=1` de premissa dropada de verdade.
- Ponto 4 (prosa não batia com o rollback): resolvido — o relato agora enumera os 6 statements na ordem (`1 drop window_open, 2–3 restaura RPCs, 4 delete com guarda, 5–6 drop colunas`) e cada afirmação acima cola a linha literal da saída; o `delete` tem guarda de value E description (linha 7 do arquivo). Teste: bloco (d) confere contagens (`colunas=0 window_open=0 rpcs=2`) e o script afirma `len(linhas) == 6`.

## O que NÃO fiz e por quê
- Não editei a base `20261009203548` (objeto `a83eeb02af`, fora do escopo: o cartão proíbe e ela vive em outro cartão/branch). O upsert sem guarda e a ausência de rollback executável continuam lá; esta fatia corre depois dela no ledger.
- NÃO RESTAURO valor alheio que a base já sobrescreveu antes desta fatia: o antigo não foi gravado em lugar nenhum (sem tabela de apoio na base), então é irreversível por construção. A fatia impede nova sobrescrita (up com guarda, bloco c) e nunca apaga linha alheia (down com guarda, bloco d).
- Não criei teste versionado: o cartão cita só a migration; a prova vive em `.tmp/prova/` (não entra no diff) com as saídas coladas acima.
- ACLs das RPCs restauradas: conferi que a base reafirma `REVOKE ... FROM PUBLIC, anon (+authenticated no draft) + GRANT TO authenticated`, rede idêntica à pré-N-102; o `CREATE OR REPLACE` do rollback preserva essas ACLs (bloco d: `acl_draft=t acl_limits=t`). Sem GRANT/REVOKE extra no bloco porque nada deriva.

## Arquivos (`git diff --name-only <base>...HEAD`, colado do comando)
- `.tmp/relato.md`
- `supabase/migrations/20261013235900_talkx_n102_window_fixes.sql`
