import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [sender, linkFn, sharedValidation, linksMigration, idorMigration, caseInsensitiveMigration, talkxShared, contactService, campaignWizard, wizardDelivery] = await Promise.all([
  readFile(new URL('../../supabase/functions/talkx-send/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/talkx-link/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/functions/_shared/validation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916200000_talkx_e90_links.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916270000_talkx_link_click_idor_guard.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260916260000_talkx_links_slug_case_insensitive.sql', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/talkxShared.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/services/contact.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXCampaignWizard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/talkx/TalkXWizardDelivery.tsx', import.meta.url), 'utf8'),
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

test('Talk X personalize() resolves every placeholder in a single pass over the original template', () => {
  // Auditoria 2026-09-16 (bug original): {{empresa}} era substituido ANTES de
  // {{saudacao}}/{{link}}, entao um campo de contato (company/name/nickname,
  // editavel via CRM) contendo literalmente "{{saudacao}}" ou "{{link}}" era
  // reinterpretado como placeholder pela chamada .replace() seguinte.
  // PR #909 (review do Codex): a mesma classe de bug tambem valia para campo
  // customizado do CRM (ex.: {{cargo}} com valor literal "{{empresa}}"). A
  // unica garantia estrutural robusta contra recontaminacao — de dado de
  // contato OU de campo customizado — e um UNICO regex.replace() sobre a
  // string original, resolvendo tudo (saudacao, link, dado de contato, campo
  // customizado) dentro do mesmo callback, nunca reescaneando o resultado.
  const singlePassIdx = sender.indexOf('return template.replace(/\\{\\{([^}]+)\\}\\}/g');
  assert.ok(singlePassIdx > -1, 'personalize() deve resolver tudo num unico regex.replace() sobre o template original');
  const saudacaoIdx = sender.indexOf('key === "saudacao"', singlePassIdx);
  const linkIdx = sender.indexOf('key === "link"', singlePassIdx);
  const contactValuesIdx = sender.indexOf('Object.prototype.hasOwnProperty.call(contactValues, key)', singlePassIdx);
  const customValuesIdx = sender.indexOf('normalizedCustomValues.has(key)', singlePassIdx);
  assert.ok(
    saudacaoIdx > singlePassIdx && linkIdx > saudacaoIdx && contactValuesIdx > linkIdx && customValuesIdx > contactValuesIdx,
    'ordem de resolucao dentro do passe unico: saudacao, link, dado de contato, campo customizado',
  );
});

test('Talk X personalize() never lets a custom field with a reserved name override a built-in placeholder', () => {
  // Review da PR #909: um campo customizado do CRM chamado "link" (ou
  // "nome"/"empresa"/etc.) nao pode sequestrar o placeholder built-in
  // correspondente antes do passe de resolucao real.
  assert.match(sender, /RESERVED_PLACEHOLDER_KEYS/);
  assert.match(sender, /if \(RESERVED_PLACEHOLDER_KEYS\.has\(normalizedKey\)\) continue/);
});

test('Talk X custom-fields pagination orders by a stable unique key', () => {
  // Review da PR #909: .range() sem .order() nao garante ordenacao estavel
  // entre chamadas paginadas -- paginas poderiam se sobrepor ou pular linhas
  // e mandar "[variavel]" no lugar do dado real.
  const pageSizeIdx = sender.indexOf('CUSTOM_FIELDS_PAGE_SIZE');
  assert.ok(pageSizeIdx > -1, 'a paginacao de contact_custom_fields deve existir');
  const orderIdx = sender.indexOf('.order("id", { ascending: true })', pageSizeIdx);
  const rangeIdx = sender.indexOf('.range(offset, offset + CUSTOM_FIELDS_PAGE_SIZE - 1)', pageSizeIdx);
  assert.ok(orderIdx > -1 && rangeIdx > orderIdx, 'o .order("id") deve vir antes do .range() na busca paginada');
});

test('Talk X custom-fields lookup chunks contact ids before querying', () => {
  // Review da PR #909: .in() serializa todo contact_id na URL -- uma leva de
  // ~1000 destinatarios geraria dezenas de KB de filtro e arriscaria rejeicao
  // por tamanho de URL no gateway, derrubando o envio inteiro depois da
  // campanha ja ter transicionado para "sending".
  assert.match(sender, /CUSTOM_FIELDS_ID_CHUNK_SIZE/);
  assert.match(sender, /\.in\("contact_id", idChunk\)/);
});

test('Talk X custom-fields bucket preserves a field literally named __proto__', () => {
  // Review da PR #909: bucket[row.field_name] num objeto comum ({}) invoca o
  // setter de protótipo quando field_name === "__proto__", entao o valor real
  // nunca aparece em Object.entries() -- precisa de um objeto sem prototype.
  assert.match(sender, /Object\.create\(null\) as Record<string, string>/);
});

test('Talk X wizard preview also preserves a field literally named __proto__', () => {
  // Review da PR #909: o mesmo bug do bucket do envio real (values[__proto__]
  // num objeto comum nunca vira propriedade enumeravel) tambem existia nos
  // pontos onde o wizard monta sampleCustomValues para o preview.
  assert.match(campaignWizard, /Object\.create\(null\) as Record<string, string>/);
  assert.match(wizardDelivery, /Object\.create\(null\) as Record<string, string>/);
});

test('Talk X custom-fields lookup resolves case-colliding field names the same way the preview does', () => {
  // Review da PR #909: o indice unico de (contact_id, field_name) e
  // case-sensitive, entao um contato pode ter "CPF" e "cpf" como duas linhas
  // reais. O envio real e o preview do wizard cada um monta um mapa
  // "ultima escrita vence" apos normalizar a chave para minusculo -- se um
  // ordena por "id" e o outro por "field_name", cada lado pode escolher uma
  // linha diferente como vencedora, e o preview mentiria sobre o que o envio
  // real manda. ContactService.fetchCustomFields (usado pelo preview via
  // useContactCustomFields) ordena por "field_name"; o envio real precisa
  // ordenar pela mesma coluna primeiro para convergir na mesma linha.
  assert.match(contactService, /\.order\('field_name'\)/);
  const pageSizeIdx = sender.indexOf('CUSTOM_FIELDS_PAGE_SIZE');
  const fieldNameOrderIdx = sender.indexOf('.order("field_name", { ascending: true })', pageSizeIdx);
  const idOrderIdx = sender.indexOf('.order("id", { ascending: true })', pageSizeIdx);
  assert.ok(
    fieldNameOrderIdx > -1 && idOrderIdx > fieldNameOrderIdx,
    'o envio real deve ordenar por "field_name" antes de "id", igual ao preview do wizard',
  );
});

test('Talk X personalize() and personalizePreview() both guard against inherited Object.prototype keys', () => {
  // Review da PR #909: "key in contactValues" tambem acha propriedades
  // herdadas (constructor, __proto__) -- um placeholder desses vazaria texto
  // de funcao/objeto em vez de cair no fallback "[variavel]".
  assert.match(sender, /Object\.prototype\.hasOwnProperty\.call\(contactValues, key\)/);
  assert.match(talkxShared, /Object\.prototype\.hasOwnProperty\.call\(contactValues, key\)/);
});

test('Talk X personalizePreview() resolves every placeholder in a single pass, matching the real send', () => {
  // Review da PR #909: o preview do wizard fazia .replace() sequencial —
  // dado de contato (nome/empresa/etc.) contendo literalmente "{{cargo}}"
  // era rescaneado pelo passe de fallback seguinte e divergia do que
  // personalize() (envio real) de fato produz.
  const previewIdx = talkxShared.indexOf('export function personalizePreview');
  assert.ok(previewIdx > -1, 'personalizePreview() deve existir');
  const singlePassIdx = talkxShared.indexOf('return template.replace(/\\{\\{([^}]+)\\}\\}/g', previewIdx);
  assert.ok(singlePassIdx > -1, 'personalizePreview() deve resolver tudo num unico regex.replace() sobre o template original');
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
