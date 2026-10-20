
# ═══════════════════════════════════════════════════════════════════════════
# PROVA EXTRA (refazer 2 / t_93955b3c): o bloco `-- Rollback:` da migration
# EXECUTA e devolve o estado ANTERIOR (rollback-de-verdade).
# ═══════════════════════════════════════════════════════════════════════════
RB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/299-talk-x-cancelamento-em-voo-261016011-2610160114d52c/.tmp/rollback-299.sql"
sed -n '/^-- CREATE OR REPLACE FUNCTION/,$p' "$new_migration" | sed 's/^-- \{0,1\}//' > "$RB"
[[ -s "$RB" ]] || fail 'ROLLBACK: bloco `-- Rollback:` ausente ou vazio na migration'
psql_test < "$RB" >/dev/null || fail 'ROLLBACK: o bloco `-- Rollback:` NAO executou no banco'
pass 'ROLLBACK: o bloco `-- Rollback:` executa sem erro no PostgreSQL 17 descartavel'

def_pos="$(psql_q "SELECT position('provider_dispatch_started_at IS NULL' in pg_get_functiondef('public.transition_talkx_campaign(uuid,text,text,uuid)'::regprocedure))::text;")"
[[ "$def_pos" == '0' ]] || fail "ROLLBACK: a definicao ainda cita a guarda de em-voo [pos=$def_pos]"
pass 'ROLLBACK: a definicao voltou a versao anterior (sem a guarda de em-voo)'

C9='50000000-0000-0000-0000-0000000000a9'
C9P='51000000-0000-0000-0000-0000000000a9'
C9F='51000000-0000-0000-0000-0000000000b9'
T9="$(setup_campaign "$C9" "$C9P" "$C9F")"
psql_q "$service_session SELECT public.transition_talkx_campaign('$C9', 'cancel', NULL, NULL);" >/dev/null
pos_rollback="$(psql_q "SELECT status || '|' || COALESCE(delivery_claim_token::text,'NULL') FROM public.talkx_recipients WHERE id='$C9F';")"
[[ "$pos_rollback" == 'cancelled|NULL' ]] || fail "ROLLBACK: o comportamento anterior nao voltou [obtido: $pos_rollback]"
err9="$(psql_err "$service_session SELECT public.record_talkx_recipient_sent('$C9F', '$T9'::uuid, 'prov-rollback');")"
[[ "$err9" == *talkx_delivery_claim_conflict* ]] || fail "ROLLBACK: o recibo deveria voltar a falhar [obtido: $err9]"
pass "ROLLBACK: o defeito ANTERIOR volta ('$pos_rollback' + recibo recusado) — o rollback restaura o estado"
