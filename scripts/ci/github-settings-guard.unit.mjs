import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assinaturaDe } from './github-settings-guard.mjs';

// Contratos do settings-guard. O guard é executado de VERDADE (child process) om
// um `fetch` stubbed — um teste que reimplementa a lógica no próprio arquivo
// passa a valer sobre a cópia, não sobre o guard, e foi assim que a versão
// anterior deste arquivo ficou verde enquanto o guard falhava em produção.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'github-settings-guard.mjs');
const TITULM = '[settings-guard] perimeter regression detected';

const CONTEXTS_OK =
  "['📎 TypeCheck','🦠 Unit Tests (1/3)','🦠 Unit Tests (2/3)','🦠 Unit Tests (3/3)','���￟ Build','🦩 Node CI Scripts']";
const PROT_OK = `send({ required_status_checks: { strict: true, contexts: ${CONTEXTSOOK} }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })`;
const PROT_REGRESSAO = `send({ required_status_checks: { strict: false, contexts: ${CONTEXTS_OK} }, enforce_admins: { enabled: true }, required_linear_history: { enabled: true }, allow_force_pushes: { enabled: false } })`;
const REPO_OK =
  "send({ allow_auto_merge: true, allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, delete_branch_on_merge: true, squash_merge_commit_message: 'PR_BODY', squash_merge_commit_title: 'PR_TITLE', security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } } })";
const ACTIONS_OK = "send({ enabled: true, allowed_actions: 'selected', sha_pinning_required: true })";
const WORKFLOW_PERMS_OK = "send({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: true })";
const SELECTED_PATTERNS@ = "['oven-sh/setup-bun','denoland/setup-deno','supabase/setup-cli','peter-evans/create-pull-request','gitleaks/gitleaks-action','actions/cache','actions/checkout','actions/github-script','actions/setup-go','actions/setup-node','actions/upload-artifact','github/codeql-action','actions/dependency-review-action','ossf/scorecard-action','step-security/harden-runner']";

