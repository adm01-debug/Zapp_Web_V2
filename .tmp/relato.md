Especialista: workersql

Refazer 1 da recusa (4 pontos). O que mudou neste ciclo: testes F1e/F1f/F3m/F3n no
arquivo de prova + correcao de 2 comentarios falsos na migration + 4 linhas de
GRANT no Rollback. A migration e os testes F1a-d/F2/F3a-l sao do trabalho anterior.

Ponto 1 (relato x diff): corrigido aqui e na migration. O que o diff faz de verdade:
(i) recria as 2 policies de INSERT com WITH CHECK de autoria espelhando o gatilho
(closures ganha `closed_by = get_profile_id_for_user(auth.uid())`; eventos troca
`performed_by is null or ...` por `performed_by = ...`, pois o gatilho carimba sempre
o chamador); (ii) REVOKE de PUBLIC/anon + GRANT a authenticated/service_role nas 4
funcoes de papel (exigido pela guarda check-secdef-public-execute) e EXECUTE fechado
nas 2 funcoes de gatilho novas. O comentario "nenhum GRANT novo" da migration foi
corrigido (linhas 46-56) e o Rollback ganhou as 4 linhas que devolvem o EXECUTE a
public/anon. Motivo: sem o WITH CHECK, o carimbo do gatilho seria a unica barreira;
sem o REVOKE, anon executaria oraculo de papel (F3l prova: 0 funcoes alcancaveis).

Ponto 2 (retrato das DEFINER): a afirmacao antiga estava errada e foi retirada. O
gatilho sobrescreve sim o closed_by/performed_by explicito das RPCs DEFINER quando
ha JWT (auth.uid() presente). Prova nova no teste: F1e chama set_conversation_status
como agente e confere status=resolved + closed_by=chamador; F1f chama
transfer_conversation como admin e confere assigned_to movido + performed_by=chamador
(a RPC ja escrevia o autor explicito; o gatilho preserva o valor quando nao ha JWT
— service_role/interno). Nenhuma RPC grava outro autor ou NULL de proposito, entao
nenhum caso precisou de excecao no gatilho. Verde: `F1e OK`, `F1f OK` (abaixo).

Ponto 3 (proprio papel): acrescentados F3m/F3n no mesmo bloco authenticated nao-admin
(a0002/agente): has_role(proprio uid,'agent') = true e get_profile_role_for_check
(proprio uid) = 1 linha. Sao testes de preservacao (passam tambem sem a migration);
o que discrimina a correcao continua sendo F3a-d (oraculo: antes respondia true para
admin alheio). Verde: `F3m-n OK`.

Ponto 4 (policies existentes seguem funcionando): suite nova verde com a migration
aplicada (15 OK, 0 erro) + 3 suites de banco existentes verdes no mesmo estado:
- `zapp-db-local psql . v2-autoria-base < supabase/tests/autoria_e_oraculo_de_papel.sql` → 15 NOTICE OK, nenhum ERROR/FALHOU.
- `bash scripts/db-audit/secd-caller-check.test.sh` → `M-DB-05 (13 funcoes SEM checagem do chamador): 45 cenarios aprovados.` (EXIT=0).
- `bash scripts/db-audit/wa-tag-and-status-authorization.test.sh` → `[OK] contrato de autorizacao L1/L2 verificado` (EXIT=0).
- `bash scripts/db-audit/conversation-closures-reopen-same-day.test.sh` → `PASS: R2-DB-008` (EXIT=0).
Ressalva honesta: `dashboard-rls-authorization.test.sh` aborta na guarda de vigencia
(`helper is_admin_or_supervisor redefinido depois de 20251215... em: 20261013210006`):
o pin de extracao verbatim aponta para o arquivo antigo e o extrator e case-sensivel
(`CREATE ... $$;` vs meu `create ... $function$;`), entao atualizar o pin exigiria
reescrever o extrator — arquivo de outra area, fora do escopo do cartao (so migration
+ supabase/tests). Nao toquei nele. Comportamento preservado por construcao: as
policies chamam is_admin_or_supervisor(auth.uid()) — uid proprio, que passa em
secd_caller_ok exatamente como antes; so a consulta a uid ALHEIO muda (o defeito).

Rollback (executado de verdade): extrai as 20 linhas `;` do cabecaalho, BEGIN/COMMIT
no stack → COMMIT. Estado conferido depois: 0 gatilhos trg_bind*, 0 funcoes de
gatilho, 4/4 funcoes de papel executaveis por anon, 0 ocorrencias de secd_caller_ok
em is_admin_or_supervisor, policy de eventos de volta com `performed_by IS NULL OR`.
Migration reaplicada em seguida e suite nova re-rodada: 15 OK, 0 erro.

Vermelho-antes: sem a migration o arquivo aborta no INSERT forjado (`new row violates
row-level security policy for table "conversation_events"`) e o .tmp/vermelho_antes.sql
da entrega anterior mostra F1 com closed_by NULL + F3 com oraculo true. F3m/F3n passam
nos dois estados (preservacao, declarado acima).

Passada de efeito colateral: (1) gatilhos das tabelas tocadas: closures tem
trg_sync_contact_status_on_closure (sincroniza status — por isso F1e usa contato
virgem c0003, documentado no teste), trg_reject_repeated_closure_without_reopen,
gamificacao e crm-sync; nada desligado; (2) tudo-ou-nada: F2e/F2f conferem que UPDATE
negado nao aplicou parcial; (3) sem oraculo: F3c (id inexistente = false, igual ao
existente); (4) sem GRANT/papel/policy alem do titulo; (5) entrada invalida n/a
(cartao de ACL, sem input novo); (6) prova por comportamento com papel real, sem
regex/deparse.

Nota ao dono (lote do dia, da recusa): a gamificacao passa a contar os encerramentos
do caminho FSM (autoria ligada ao chamador); efeito esperado. Observado um WARNING
pre-existente fora do escopo: `function public.grant_agent_achievement(uuid, unknown,
text, text, bigint) does not exist` no trigger de gamificacao (só warning, nao falha).

Arquivos (git diff --name-only HEAD): supabase/migrations/20261013210006_autoria_e_oraculo_de_papel.sql, supabase/tests/autoria_e_oraculo_de_papel.sql.
Verificacao: suites acima verdes; `zapp-verify . --rapido` nao coube no orcamento do
turno (diff so SQL; sem TS tocado). NADA vai para producao (quem aplica e o Joaquim).
