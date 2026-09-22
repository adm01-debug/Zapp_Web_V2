#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container_name="zapp-runtime-config-test-$$"
test_dir=$(mktemp -d)
cleanup() {
  if [[ "$container_name" =~ ^zapp-runtime-config-test-[0-9]+$ ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
docker run --rm -d --network none --name "$container_name" \
  -e POSTGRES_PASSWORD=runtime_fixture_only postgres:17-alpine >/dev/null
ready=false
for attempt in $(seq 1 45); do
  logs=$(docker logs "$container_name" 2>&1)
  if [[ "$logs" == *'PostgreSQL init process complete; ready for start up.'* ]] && \
    docker exec "$container_name" psql -X -U postgres -Atc 'SELECT 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'FAIL: PostgreSQL de teste não iniciou'; exit 1; }
db() { docker exec -i "$container_name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres "$@"; }
db <<'SQL'
CREATE TABLE public.messages(id int) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.contacts(LIKE public.messages INCLUDING ALL) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.email_messages(LIKE public.messages INCLUDING ALL) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.email_threads(LIKE public.messages INCLUDING ALL) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.05);
CREATE TABLE public.agent_stats(id int);
CREATE TABLE public.conversation_sla(id int);
CREATE TABLE public.message_reactions(id int);
CREATE TABLE public.notifications(id int);
CREATE TABLE public.payment_links(id int);
CREATE TABLE public.queue_goals(id int);
CREATE TABLE public.queue_members(id int);
CREATE TABLE public.queues(id int);
CREATE TABLE public.sales_deals(id int);
CREATE TABLE public.talkx_campaigns(id int);
CREATE TABLE public.talkx_recipients(id int);
CREATE TABLE public.team_message_reactions(id int);
CREATE TABLE public.team_messages(id int);
CREATE TABLE public.warroom_alerts(id int);
CREATE TABLE public.whatsapp_connections(id int);
CREATE TABLE public.whisper_messages(id int);
CREATE PUBLICATION supabase_realtime FOR TABLE
  public.agent_stats, public.contacts, public.conversation_sla,
  public.email_messages, public.email_threads, public.message_reactions,
  public.messages, public.notifications, public.payment_links,
  public.queue_goals, public.queue_members, public.queues, public.sales_deals,
  public.talkx_campaigns, public.talkx_recipients,
  public.team_message_reactions, public.team_messages, public.warroom_alerts,
  public.whatsapp_connections, public.whisper_messages;
SQL
db < "$repo_root/scripts/db-audit/runtime-config.sql" > "$test_dir/absent.jsonl"
db <<'SQL'
CREATE SCHEMA cron;
CREATE TABLE cron.job(active boolean, command text);
INSERT INTO cron.job VALUES (true, 'fixture-private-command'), (false, 'fixture-private-command');
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(public boolean);
INSERT INTO storage.buckets VALUES (true), (false);
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text, name text, statements text[]);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260901000002', 'messages_unique_dedup_index', NULL);
SQL
db < "$repo_root/scripts/db-audit/runtime-config.sql" > "$test_dir/present.jsonl"
db -c 'ALTER TABLE public.messages RESET (autovacuum_vacuum_scale_factor)' >/dev/null
db < "$repo_root/scripts/db-audit/runtime-config.sql" > "$test_dir/drift.jsonl"
TEST_EVIDENCE_DIR="$test_dir" node --input-type=module <<'JS'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { evaluateRuntimeConfig } from './scripts/db-audit/check-runtime-config.mjs';
const load = name => fs.readFileSync(`${process.env.TEST_EVIDENCE_DIR}/${name}.jsonl`, 'utf8');
const absent = evaluateRuntimeConfig(load('absent'));
assert.equal(absent.status, 'PARTIAL');
assert.equal(absent.coverage.realtime, 'VERIFIED');
assert.equal(absent.coverage.cron, 'UNAVAILABLE');
const present = evaluateRuntimeConfig(load('present'));
assert.equal(present.status, 'PARTIAL');
assert.equal(present.sections.find(row => row.section === 'cron').active_jobs, 1);
assert.equal(present.sections.find(row => row.section === 'storage').public_buckets, 1);
assert.equal(present.sections.find(row => row.section === 'ledger_limitations').records[0].statement_count, 0);
assert.doesNotMatch(load('present'), /fixture-private-command/);
assert.equal(evaluateRuntimeConfig(load('drift')).status, 'FAIL');
console.log('PASS: PostgreSQL 17 runtime audit — optional services, aggregate evidence, no command leakage, autovacuum drift detected');
JS
