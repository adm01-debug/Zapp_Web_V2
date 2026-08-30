import { describe, it, expect } from 'vitest';
import * as S from '../../supabase/functions/_shared/schemas.ts';

const UUID = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
type Case = { payload: unknown; hint: string };
type Suite = { schema: { safeParse: (d: unknown) => { success: boolean } }; valid: unknown[]; invalid: Case[] };

// Tabela de contrato: TODO schema exportado tem casos de payload válido,
// campo ausente, tipo incorreto e valor vazio (quando aplicável ao shape).
const suites: Record<string, Suite> = {
  UUIDSchema: { schema: S.UUIDSchema, valid: [UUID], invalid: [
    { payload: 'not-a-uuid', hint: 'formato' }, { payload: 123, hint: 'tipo' }, { payload: '', hint: 'vazio' }] },
  EmailSchema: { schema: S.EmailSchema, valid: ['a@b.co'], invalid: [
    { payload: 'x', hint: 'formato' }, { payload: 5, hint: 'tipo' }, { payload: '', hint: 'vazio' }] },
  MessageSchema: { schema: S.MessageSchema, valid: [{}, { sender: 'a', content: 'b' }], invalid: [
    { payload: { sender: 5 }, hint: 'tipo' }, { payload: 'texto', hint: 'root não-objeto' }] },
  AiSuggestReplySchema: { schema: S.AiSuggestReplySchema, valid: [{}, { messages: [{}], contactId: UUID }], invalid: [
    { payload: { messages: 'x' }, hint: 'tipo' }, { payload: { contactId: 'x' }, hint: 'uuid' }] },
  AiEnhanceMessageSchema: { schema: S.AiEnhanceMessageSchema, valid: [{ message: 'oi' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { message: 1 }, hint: 'tipo' },
    { payload: { message: '' }, hint: 'vazio' }, { payload: { message: 'a', tone: 'x' }, hint: 'enum' }] },
  AiConversationAnalysisSchema: { schema: S.AiConversationAnalysisSchema, valid: [{ messages: [{}, {}, {}, {}, {}] }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { messages: [{}] }, hint: 'min 5' }, { payload: { messages: {} }, hint: 'tipo' }] },
  AiConversationSummarySchema: { schema: S.AiConversationSummarySchema, valid: [{ messages: [{}, {}, {}, {}, {}] }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { messages: [] }, hint: 'vazio' }] },
  AiAutoTagSchema: { schema: S.AiAutoTagSchema, valid: [{}, { contactId: UUID }], invalid: [
    { payload: { messages: 3 }, hint: 'tipo' }, { payload: { contactId: 'x' }, hint: 'uuid' }] },
  AiChurnAnalysisSchema: { schema: S.AiChurnAnalysisSchema, valid: [{ contactIds: [UUID] }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { contactIds: [] }, hint: 'vazio' }, { payload: { contactIds: ['x'] }, hint: 'uuid' }] },
  AiClassifyTicketsSchema: { schema: S.AiClassifyTicketsSchema, valid: [{}, { limit: 10 }], invalid: [
    { payload: { limit: 'x' }, hint: 'tipo' }, { payload: { limit: 0 }, hint: 'faixa' }] },
  ElevenLabsTTSSchema: { schema: S.ElevenLabsTTSSchema, valid: [{ text: 'a' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { text: '' }, hint: 'vazio' }, { payload: { text: 1 }, hint: 'tipo' }] },
  ElevenLabsSFXSchema: { schema: S.ElevenLabsSFXSchema, valid: [{ prompt: 'a' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { prompt: '' }, hint: 'vazio' }, { payload: { prompt: 'a', mode: 'x' }, hint: 'enum' }] },
  ElevenLabsDialogueSchema: { schema: S.ElevenLabsDialogueSchema, valid: [{ script: [{ voice_id: 'v', text: 't' }] }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { script: [] }, hint: 'vazio' },
    { payload: { script: [{ voice_id: 'v' }] }, hint: 'nested ausente' }, { payload: { script: [{ voice_id: 'v', text: '' }] }, hint: 'nested vazio' }] },
  ElevenLabsVoiceDesignPreviewSchema: { schema: S.ElevenLabsVoiceDesignPreviewSchema, valid: [{ description: 'd' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { description: '' }, hint: 'vazio' }, { payload: { action: 'x', description: 'd' }, hint: 'literal' }] },
  ElevenLabsVoiceDesignCreateSchema: { schema: S.ElevenLabsVoiceDesignCreateSchema, valid: [{ action: 'create', voice_name: 'n', generated_voice_id: 'g' }], invalid: [
    { payload: { action: 'create', voice_name: 'n' }, hint: 'ausente' }, { payload: { action: 'create', voice_name: '', generated_voice_id: 'g' }, hint: 'vazio' }] },
  TranscribeAudioSchema: { schema: S.TranscribeAudioSchema, valid: [{ audioUrl: 'https://x.co/a.mp3' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { audioUrl: 'x' }, hint: 'url' },
    { payload: { audioUrl: 'https://x.co/a.mp3', languageCode: 'xx' }, hint: 'enum' }] },
  ClassifyAudioMemeSchema: { schema: S.ClassifyAudioMemeSchema, valid: [{}, { audio_url: null }], invalid: [
    { payload: { audio_url: 'nao-e-url' }, hint: 'url' }, { payload: { file_name: 7 }, hint: 'tipo' }] },
  ClassifyEmojiSchema: { schema: S.ClassifyEmojiSchema, valid: [{}, { image_url: null }], invalid: [
    { payload: { image_url: 'x' }, hint: 'url' }] },
  ClassifyStickerSchema: { schema: S.ClassifyStickerSchema, valid: [{}], invalid: [
    { payload: { image_url: 'x' }, hint: 'url' }] },
  SendEmailSchema: { schema: S.SendEmailSchema, valid: [{ to: 'a@b.co', subject: 's' }, { to: ['a@b.co'], subject: 's' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { to: 'a@b.co', subject: '' }, hint: 'vazio' },
    { payload: { to: 5, subject: 's' }, hint: 'tipo' }, { payload: { to: [], subject: 's' }, hint: 'array vazio' }] },
  SentimentAlertSchema: { schema: S.SentimentAlertSchema, valid: [{ contactId: UUID, contactName: 'n', sentimentScore: 50, analysisId: UUID }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { contactId: UUID, contactName: 'n', sentimentScore: 'x', analysisId: UUID }, hint: 'tipo' },
    { payload: { contactId: UUID, contactName: 'n', sentimentScore: 150, analysisId: UUID }, hint: 'faixa' }] },
  RateLimitAlertSchema: { schema: S.RateLimitAlertSchema, valid: [{ ip_address: '1.2.3.4', endpoint: '/x', request_count: 1, blocked: true }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { ip_address: '1.2.3.4', endpoint: '/x', request_count: 'x', blocked: true }, hint: 'tipo' },
    { payload: { ip_address: '1.2.3.4', endpoint: '/x', request_count: 1, blocked: 'yes' }, hint: 'tipo bool' }] },
  ApprovePasswordResetSchema: { schema: S.ApprovePasswordResetSchema, valid: [{ requestId: UUID, action: 'approve' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { requestId: 'x', action: 'approve' }, hint: 'uuid' },
    { payload: { requestId: UUID, action: 'x' }, hint: 'enum' }] },
  ChatbotL1Schema: { schema: S.ChatbotL1Schema, valid: [{ contactId: UUID, message: 'm' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { contactId: UUID, message: '' }, hint: 'vazio' },
    { payload: { contactId: 'x', message: 'm' }, hint: 'uuid' }] },
  DetectNewDeviceSchema: { schema: S.DetectNewDeviceSchema, valid: [{ device_fingerprint: 'f', browser: 'b', os: 'o', device_name: 'd' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { device_fingerprint: '', browser: 'b', os: 'o', device_name: 'd' }, hint: 'vazio' }] },
  ScheduledReportSchema: { schema: S.ScheduledReportSchema, valid: [{ reportId: UUID }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { reportId: 'x' }, hint: 'uuid' }] },
  SicoobBridgeNewMessageSchema: { schema: S.SicoobBridgeNewMessageSchema,
    valid: [{ action: 'new_message', message_id: '1', sender_name: 'n', singular_id: 's', content: 'c', vendedor_user_id: 'v' }], invalid: [
    { payload: { action: 'new_message', message_id: '1', sender_name: 'n', singular_id: 's', vendedor_user_id: 'v' }, hint: 'content ausente' },
    { payload: { action: 'new_message', message_id: '1', sender_name: 'n', singular_id: 's', content: '', vendedor_user_id: 'v' }, hint: 'vazio' },
    { payload: { action: 'x', message_id: '1', sender_name: 'n', singular_id: 's', content: 'c', vendedor_user_id: 'v' }, hint: 'literal' }] },
  SicoobBridgeMarkReadSchema: { schema: S.SicoobBridgeMarkReadSchema, valid: [{ action: 'mark_read', external_ids: ['1'] }], invalid: [
    { payload: { action: 'mark_read' }, hint: 'ausente' }, { payload: { action: 'mark_read', external_ids: [] }, hint: 'vazio' }] },
  SicoobBridgeReplySchema: { schema: S.SicoobBridgeReplySchema, valid: [{ contact_id: UUID, content: 'c' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { contact_id: UUID, content: '' }, hint: 'vazio' },
    { payload: { contact_id: 'x', content: 'c' }, hint: 'uuid' }] },
  GmailSendActionSchema: { schema: S.GmailSendActionSchema, valid: [{ action: 'send', account_id: UUID }], invalid: [
    { payload: { action: 'send' }, hint: 'ausente' }, { payload: { action: 'x', account_id: UUID }, hint: 'enum' },
    { payload: { action: 'send', account_id: 'x' }, hint: 'uuid' }] },
  GmailOAuthActionSchema: { schema: S.GmailOAuthActionSchema, valid: [{ action: 'get-auth-url' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { action: 'x' }, hint: 'enum' }] },
  WebAuthnActionSchema: { schema: S.WebAuthnActionSchema, valid: [{ action: 'registration-options' }], invalid: [
    { payload: { action: 'x' }, hint: 'enum' }, { payload: { action: 'registration-options', userId: 'x' }, hint: 'uuid' }] },
  ExternalDbBridgeSchema: { schema: S.ExternalDbBridgeSchema, valid: [{ action: 'select', table: 't' }], invalid: [
    { payload: { action: 'x' }, hint: 'enum' }, { payload: { action: 'select', limit: 0 }, hint: 'faixa' }] },
  EvolutionWebhookEnvelopeV1Schema: { schema: S.EvolutionWebhookEnvelopeV1Schema, valid: [
    { event: 'messages.upsert', instance: 'wpp' }, { event: 'e', instance: 'i', data: { a: 1 }, extra: true }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { event: '', instance: 'i' }, hint: 'vazio' },
    { payload: { event: 1, instance: 'i' }, hint: 'tipo' }] },
  EvolutionWebhookEnvelopeV2Schema: { schema: S.EvolutionWebhookEnvelopeV2Schema, valid: [
    { event: 'e', instance: 'i', data: {} }], invalid: [
    { payload: { event: 'e', instance: 'i' }, hint: 'data ausente' },
    { payload: { event: 'e', instance: 'i', data: 'x' }, hint: 'data tipo' }] },
  ElevenLabsWebhookV1Schema: { schema: S.ElevenLabsWebhookV1Schema, valid: [{}, { type: 'tts.completed', extra: 1 }], invalid: [
    { payload: { type: 123 }, hint: 'tipo' }, { payload: 'str', hint: 'root' }] },
  ElevenLabsWebhookV2Schema: { schema: S.ElevenLabsWebhookV2Schema, valid: [{ type: 't' }, { event_type: 'e' }], invalid: [
    { payload: {}, hint: 'identificação ausente' }] },
  GmailCronSyncHeadersSchema: { schema: S.GmailCronSyncHeadersSchema, valid: [{ 'x-cron-secret': 's' }], invalid: [
    { payload: {}, hint: 'ausente' }, { payload: { 'x-cron-secret': '' }, hint: 'vazio' }] },
};

describe('cobertura de contrato por schema', () => {
  for (const [name, suite] of Object.entries(suites)) {
    describe(name, () => {
      for (const [i, v] of suite.valid.entries()) {
        it(`válido #${i + 1}`, () => { expect(suite.schema.safeParse(v).success).toBe(true); });
      }
      for (const c of suite.invalid) {
        it(`inválido: ${c.hint} → resposta 422 consistente`, async () => {
          const r = (suite.schema as any).safeParse(c.payload);
          expect(r.success).toBe(false);
          const res = S.validationErrorResponse(r.error);
          expect(res.status).toBe(422);
          const body = JSON.parse(await res.text());
          expect(body.error.code).toBe('VALIDATION_ERROR');
          expect(body.error.fields.length).toBeGreaterThan(0);
          for (const f of body.error.fields) {
            expect(typeof f.path).toBe('string');
            expect(typeof f.message).toBe('string');
            expect(typeof f.code).toBe('string');
          }
        });
      }
    });
  }

  it('nenhum schema exportado ficou fora da tabela', () => {
    const exported = Object.keys(S).filter((k) => k.endsWith('Schema') && k !== 'SafeStringSchema');
    const covered = Object.keys(suites);
    const missing = exported.filter((k) => !covered.includes(k));
    expect(missing).toEqual([]);
  });

  it('SafeStringSchema remove control chars e limita tamanho', () => {
    const s = S.SafeStringSchema(10);
    expect(s.parse('a\u0000b')).toBe('ab');
    expect(s.safeParse('x'.repeat(11)).success).toBe(false);
  });
});
