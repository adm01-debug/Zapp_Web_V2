import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('supabase/functions/sentiment-alert/index.ts', 'utf8');

describe('sentiment-alert security contract', () => {
  it('authenticates before parsing the caller-controlled body', () => {
    expect(source.indexOf("req.method !== 'POST'")).toBeGreaterThan(-1);
    expect(source.indexOf('await requireAuth(req)')).toBeGreaterThan(-1);
    expect(source.indexOf('await requireAuth(req)')).toBeLessThan(source.indexOf('await req.json()'));
  });

  it('proves RLS visibility for the exact analysis/contact pair before creating a service client', () => {
    const callerProof = source.indexOf(".from('conversation_analyses')");
    const serviceClient = source.indexOf('requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(callerProof).toBeGreaterThan(-1);
    expect(source).toContain(".eq('id', analysisId)");
    expect(source).toContain(".eq('contact_id', contactId)");
    expect(callerProof).toBeLessThan(serviceClient);
  });

  it('uses canonical score/settings and rejects a stale analysis', () => {
    expect(source).toContain('visibleAnalysis.sentiment_score');
    expect(source).toContain('userSettings?.sentiment_alert_threshold');
    expect(source).toContain('userSettings?.sentiment_consecutive_count');
    expect(source).toContain('recentAnalyses?.[0]?.id !== analysisId');
  });

  it('uses recipient-owned preferences and an atomic database primitive', () => {
    expect(source).toContain('sentimentSettingsOwnerId(auth.userId, agentProfile?.user_id)');
    expect(source).toContain(".eq('user_id', settingsOwnerId)");
    expect(source).toContain('notificationId: analysisId');
    expect(source).toContain(".rpc('persist_sentiment_alert'");
    expect(source).not.toContain(".from('notifications')\n        .insert");
    expect(source).not.toContain(".from('audit_logs')\n      .insert");
  });

  it('escapes the HTML body and strips newlines from the subject', () => {
    expect(source).toContain('escapeHtml(contactName)');
    expect(source).toContain('singleLineLabel(contactName)');
  });
});
