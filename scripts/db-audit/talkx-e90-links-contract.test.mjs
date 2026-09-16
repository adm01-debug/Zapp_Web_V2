import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [sender, linkFn, sharedValidation, linksMigration, idorMigration, caseInsensitiveMigration] = await Promise.all([
  readFile(new URL('../../supabase/functions/talkx-send/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/talkx-link/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/_shared/validation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916200000_talkx_e90_links.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916270000_talkx_link_click_idor_guard.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916260000_talkx_links_slug_case_insensitive.sql', import.meta.url), 'utf8'),
]);

test('Talk X {{link}} resolves to a real per-recipient tracking URL at the real send call site', () => {
  // Auditoria 2026-09-16: personalize() ja tinha o parametro trackingUrl na
  // assinatura, mas o call site real do envio nunca o passava -- a feature
  // inteira nao tinha nenhum efeito pratico. Trava a regressao: precisa
  // existir uma busca de link ANTES do loop de envio e o 5o argumento tem
  // que ser passado na chamada real (nao a de teste/dummy do preview).
  assert.match(sender, /from\("talkx_links"\)/);
  assert.match(sender, /order\("created_at", \{ ascending: true \}\)/);
  assert.match(sender, /const trackingUrlFor = \(recipientId: string\)/);
  assert.match(sender, /functions\/v1\/talkx-link\?s=\$\{encodeURIComponent\(trackingLink\.slug\)\}&r=\$\{encodeURIComponent\(recipientId\)\}/);
  const realCallIdx = sender.indexOf('?? personalize(');
  const trackingArgIdx = sender.indexOf('trackingUrlFor(recipient.id as string)');
  assert.ok(realCallIdx > -1 && trackingArgIdx > -1, 'o call site real de personalize() e o argumento trackingUrlFor devem existir');
  assert.ok(trackingArgIdx > realCallIdx && trackingArgIdx - realCallIdx < 300, 'trackingUrlFor deve ser o argumento do call site real (nao do preview de teste)');
});

test('Talk X personalize() resolves contact-derived placeholders last and in a single pass', () => {
  // Auditoria 2026-09-16: {{empresa}} era substituido ANTES de {{saudacao}}/
  // {{link}}, entao um campo de contato (company/name/nickname, editavel via
  // CRM) contendo literalmente "{{saudacao}}" ou "{{link}}" era reinterpretado
  // como placeholder pela chamada .replace() seguinte. Trava: saudacao/
  // customVars/link tem que aparecer no código-fonte ANTES do bloco
  // contactValues, e as 4 substituições de dado de contato têm que ser um
  // único regex.replace() (não 4 chamadas encadeadas) para não se
  // recontaminarem entre si.
  const saudacaoIdx = sender.indexOf('replace(/\\{\\{saudacao\\}\\}/gi');
  const contactValuesIdx = sender.indexOf('const contactValues');
  assert.ok(saudacaoIdx > -1 && contactValuesIdx > -1, 'ambos os trechos devem existir');
  assert.ok(saudacaoIdx < contactValuesIdx, 'saudação deve ser resolvida antes do bloco de dado de contato');
  assert.match(sender, /result = result\.replace\(\/\\\{\\\{\(nome_completo\|nome\|apelido\|empresa\)\\\}\\\}\/gi/);
});

test('Talk X link redirect enforces rate limiting on both GET and POST', () => {
  assert.match(linkFn, /import \{[^}]*enforceRateLimit[^}]*\} from "\.\.\/_shared\/validation\.ts"/);
  assert.match(linkFn, /enforceRateLimit\(`talkx-link:click:\$\{clientIp\}`/);
  assert.match(linkFn, /enforceRateLimit\(`talkx-link:convert:\$\{clientIp\}`/);
  assert.match(linkFn, /status: 429/);
});

test('Talk X link redirect uses the shared, spoof-resistant client IP extractor', () => {
  // getClientIP() usa o IP mais a direita do X-Forwarded-For (adicionado
  // pelo proxy confiavel); a extracao antiga usava o primeiro IP, que o
  // cliente controla.
  assert.match(linkFn, /import \{[^}]*getClientIP[^}]*\} from "\.\.\/_shared\/validation\.ts"/);
  assert.doesNotMatch(linkFn, /x-forwarded-for.*split\(","\)\[0\]/);
  assert.match(sharedValidation, /export function getClientIP/);
});

test('Talk X link click IP hash salt is not a hardcoded public literal', () => {
  assert.doesNotMatch(linkFn, /"talkx-salt"/);
  assert.match(linkFn, /TALKX_LINK_IP_SALT/);
});

test('Talk X link click/convert reject cross-campaign recipient and link_id (IDOR)', () => {
  assert.match(linkFn, /link_id does not belong to recipient's campaign/);
  assert.match(idorMigration, /v_recipient_campaign IS NULL OR v_recipient_campaign <> v_link\.campaign_id/);
  assert.match(idorMigration, /p_recipient := NULL/);
});

test('Talk X link slug matching is case-insensitive end to end', () => {
  // Slug curto compartilhado em WhatsApp/impresso e tipado por humanos --
  // "Abc123" e "abc123" precisam resolver para o mesmo link.
  assert.match(caseInsensitiveMigration, /DROP CONSTRAINT talkx_links_slug_key/);
  assert.match(caseInsensitiveMigration, /CREATE UNIQUE INDEX talkx_links_slug_lower_key ON public\.talkx_links \(lower\(slug\)\)/);
  assert.match(caseInsensitiveMigration, /WHERE lower\(slug\) = lower\(p_slug\)/);
});

test('Talk X E90 tables ship with RLS on and zero public grants by default', () => {
  assert.match(linksMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(linksMigration, /REVOKE ALL ON public\.talkx_links\s+FROM PUBLIC/);
  assert.match(linksMigration, /REVOKE ALL ON public\.talkx_link_clicks\s+FROM PUBLIC/);
  assert.match(linksMigration, /REVOKE ALL ON public\.talkx_conversions\s+FROM PUBLIC/);
});
