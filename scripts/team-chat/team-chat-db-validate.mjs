#!/usr/bin/env node
/**
 * E97-E99: Team Chat DB validation script.
 * Verifies required tables and RPC are accessible via the Supabase REST API.
 *
 * Usage:
 *   SUPABASE_URL=https://tnnnlkbymytvtqngbbqh.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   node scripts/team-chat-db-validate.mjs
 *
 * Exit: 0 = all checks passed, 1 = one or more failures.
 */

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[team-chat-db-validate] Vars SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.'
  );
  process.exit(1);
}

// jssecurity:S5145 — o corpo da resposta REST (dado não-confiável devolvido pelo
// banco) entra no log em checkTable. Quebras de linha / caracteres de controle são
// neutralizados para impedir que esse conteúdo forje linhas de log. Mesmo helper de
// scripts/ci/github-settings-guard.mjs (consistência > solução nova).
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

let failures = 0;

/** E97: check REST accessibility of a table. */
async function checkTable(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?limit=1&select=id`;
  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      console.log(`  ✓ ${table} (HTTP ${res.status})`);
    } else {
      const body = await res.text();
      console.error(`  ✗ ${table} — HTTP ${res.status}: ${semQuebra(body.slice(0, 120))}`);
      failures++;
    }
  } catch (e) {
    console.error(`  ✗ ${table} — rede: ${e.message}`);
    failures++;
  }
}

/** E98: check RPC exists. Só HTTP 2xx prova que o RPC existe E executou; erro de
 *  autenticação (401/403), não encontrado (404) ou de servidor (5xx) reprovam.
 *  Antes bastava qualquer status != 404 para contar como sucesso — um 500 ou um
 *  401 passavam e o script saía 0 sem validar nada (achado TC-012). */
async function checkRpc(rpc, payload = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${rpc}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      console.log(`  ✓ rpc/${rpc} (HTTP ${res.status})`);
    } else {
      if (res.status === 404) {
        console.error(`  ✗ rpc/${rpc} — não encontrado (HTTP 404)`);
      } else {
        const corpo = semQuebra((await res.text()).slice(0, 120));
        console.error(`  ✗ rpc/${rpc} — resposta de erro HTTP ${res.status}: ${corpo}`);
      }
      failures++;
    }
  } catch (e) {
    console.error(`  ✗ rpc/${rpc} — rede: ${e.message}`);
    failures++;
  }
}

/** E99: check a specific column exists on a table row. */
async function checkColumn(table, column) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?limit=1&select=${column}`;
  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      console.log(`  ✓ ${table}.${column}`);
    } else {
      console.error(`  ✗ ${table}.${column} — HTTP ${res.status}`);
      failures++;
    }
  } catch (e) {
    console.error(`  ✗ ${table}.${column} — rede: ${e.message}`);
    failures++;
  }
}

console.log('\n=== Team Chat DB Validation ===\n');

console.log('→ Tabelas:');
await checkTable('team_conversations');
await checkTable('team_messages');
await checkTable('team_conversation_members');
await checkTable('department_invites');
await checkTable('department_audit_logs');

console.log('\n→ Colunas críticas:');
await checkColumn('team_messages', 'conversation_id');
await checkColumn('team_messages', 'sender_id');
await checkColumn('team_messages', 'status');
await checkColumn('department_invites', 'code');
await checkColumn('department_invites', 'expires_at');

console.log('\n→ RPCs:');
// Contrato canônico: accept_department_invite(p_code text). O código de dry-run
// não casa com convite real, então o RPC devolve {ok:false,error:'invalid_or_expired_code'}
// com HTTP 200 (ou 'not_authenticated' com a service role) sem escrever nada.
await checkRpc('accept_department_invite', { p_code: 'VALIDATE_DRY_RUN' });

console.log('');
if (failures === 0) {
  console.log('✅ Todas as verificações passaram.');
} else {
  console.error(`❌ ${failures} verificação(ões) falharam.`);
  process.exit(1);
}
