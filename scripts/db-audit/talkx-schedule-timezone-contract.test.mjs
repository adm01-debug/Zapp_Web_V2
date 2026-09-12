import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, sender, editor, delivery, scheduled] = await Promise.all([
  readFile(new URL('../../supabase/migrations/20260911200000_persist_talkx_schedule_timezone.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/talkx-send/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/useCampaignEditor.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXWizardDelivery.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignScheduled.tsx', import.meta.url), 'utf8'),
]);

test('Talk X persists an IANA timezone and rejects unsafe scheduling configuration', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS schedule_timezone text/i);
  assert.match(migration, /pg_timezone_names/i);
  assert.match(migration, /schedule_timezone SET DEFAULT 'America\/Sao_Paulo'/i);
  assert.match(migration, /send_window_start < send_window_end/i);
  assert.match(migration, /talkx_schedule_must_be_future/i);
  assert.match(migration, /RETURN COALESCE\(NEW, OLD\)/i);
  assert.match(migration, /IF TG_OP = 'INSERT'/i);
  assert.match(migration, /IF TG_OP = 'DELETE'/i);
  assert.match(migration, /talkx_campaigns_schedule_timezone_valid[\s\S]*?NOT VALID/i);
  assert.match(migration, /talkx_campaigns_send_window_valid[\s\S]*?NOT VALID/i);
});

test('Talk X evaluates the delivery window in the campaign timezone and fails closed', () => {
  assert.match(sender, /function deliveryWindowStatus/);
  assert.match(sender, /schedule_timezone/);
  assert.match(sender, /invalid_schedule_timezone/);
  assert.doesNotMatch(sender, /nowBR|hmBR|horário de Brasília/);
  assert.match(sender, /const windowStatus = deliveryWindowStatus\(campaign\)/);
  assert.match(sender, /extractMessageId/);
  assert.match(sender, /sendWhatsAppAudio/);
  assert.match(sender, /missing_provider_message_id/);
});

test('Talk X wizard preserves the selected timezone through payload and review', () => {
  assert.match(editor, /schedule_timezone: scheduleTimezone/);
  assert.match(editor, /campaign\?\.schedule_timezone \|\| DEFAULT_SCHEDULE_TIMEZONE/);
  assert.match(editor, /sendWindowStart >= sendWindowEnd/);
  assert.match(editor, /horário selecionado é ambíguo/);
  assert.match(delivery, /min=\{ed\.minimumScheduledAt\}/);
  assert.doesNotMatch(delivery, /new Date\(ed\.scheduledAt\)\.toISOString\(\)/);
  assert.match(scheduled, /schedule_timezone \|\| DEFAULT_SCHEDULE_TIMEZONE/);
  assert.match(scheduled, /schedule_timezone: localTz/);
});
