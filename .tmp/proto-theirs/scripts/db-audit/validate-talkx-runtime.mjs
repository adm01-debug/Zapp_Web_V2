// W28 (2026-10-01): extrai a validacao do bundle Talk X do heredoc inline do db-migrate.yml.
// Lê RUNTIME_JSON do env. Exit != 0 se o proof divergir do contrato.
const proof = JSON.parse(process.env.RUNTIME_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.table_count === 2
  && proof.rls_table_count === 2
  && proof.recipient_rollout_column_count === 11
  && proof.campaign_rollout_column_count === 4
  && proof.function_count === 15
  && proof.security_definer_match_count === 15
  && proof.safe_path_count === 15
  && proof.anonymous_execute_count === 0
  && proof.authenticated_execute_match_count === 15
  && proof.service_execute_match_count === 15
  && proof.trigger_count === 2
  && proof.enabled_trigger_count === 2
  && proof.constraint_count === 7
  && proof.validated_constraint_count === 7
  && proof.index_count === 3
  && proof.valid_ready_index_count === 3
  && ['function', 'trigger', 'constraint', 'index'].every((kind) =>
    /^[a-f0-9]{64}$/.test(proof[`${kind}_definition_sha256`] || '')
  );
if (!ok) {
  console.error('Runtime Talk X pos-migration divergiu do contrato esperado.');
  process.exit(1);
}
