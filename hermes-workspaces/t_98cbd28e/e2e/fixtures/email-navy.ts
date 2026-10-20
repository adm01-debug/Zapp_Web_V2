import type { Page, Route } from '@playwright/test';
import { installFakeSession, mockTalkXAuth } from './talkx-demo';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const SECOND_ACCOUNT_ID = '10000000-0000-4000-8000-000000000002';
const THREAD_ID = '20000000-0000-4000-8000-000000000001';
const EXTREME_THREAD_ID = '20000000-0000-4000-8000-000000000099';
const MESSAGE_ID = '30000000-0000-4000-8000-000000000001';
const EXTREME_MESSAGE_ID = '30000000-0000-4000-8000-000000000099';

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const isRead = (method: string) => method === 'GET' || method === 'HEAD';

const threads = [
  {
    id: THREAD_ID, gmail_account_id: ACCOUNT_ID, gmail_thread_id: '18abf3c2e9d4f1a2', contact_id: '40000000-0000-4000-8000-000000000001',
    subject: 'Preview deployment failed for departamento-pessoal-v3', snippet: 'Hello, Promo. The preview deployment failed. See details in your dashboard.',
    label_ids: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES'], message_count: 2, is_unread: true, is_starred: false, is_important: true,
    last_message_at: '2026-10-02T17:35:00.000Z', last_from_name: 'Vercel', last_from_address: 'notifications@vercel.com',
    assigned_to: null, status: 'open', priority: 'high', tags: ['Deploy', 'Erro', 'Vercel'], created_at: '2026-10-02T17:30:00.000Z', updated_at: '2026-10-02T17:35:00.000Z',
    contact: { id: '40000000-0000-4000-8000-000000000001', name: 'Vercel', email: 'notifications@vercel.com', avatar_url: null },
  },
  ...[
    ['Paradigma Unimed', 'Alerta sobre término da cotação', 'Venda mais para mais clientes com oportunidades qualificadas.', 'paradigma@unimedpr.net', false],
    ['Sentry', 'SENTRY-GREEN-BASKET-VQ — 2 new alerts', 'Two new alerts require attention from your team.', 'alerts@sentry.io', true],
    ['Enel Distribuição', 'Enel: Não caia em golpes', 'Confira orientações de segurança para clientes.', 'seguranca@enel.com', false],
    ['GitHub', '[GitHub] We had a problem billing your account', 'Review the billing information for your organization.', 'billing@github.com', false],
    ['ASAAS', 'Há clientes que ainda não visualizaram a fatura', 'Acompanhe agora suas cobranças pendentes.', 'avisos@asaas.com', false],
  ].map((item, index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 2}`, gmail_account_id: ACCOUNT_ID, gmail_thread_id: `gmail-thread-${index + 2}`,
    contact_id: null, subject: item[1], snippet: item[2], label_ids: ['INBOX'], message_count: index === 1 ? 2 : 1,
    is_unread: item[4], is_starred: index === 0, is_important: false, last_message_at: `2026-10-02T${15 - index}:2${index}:00.000Z`,
    last_from_name: item[0], last_from_address: item[3], assigned_to: null, status: 'open', priority: 'medium', tags: index === 0 ? ['Cotação'] : [],
    created_at: '2026-10-02T12:00:00.000Z', updated_at: '2026-10-02T12:00:00.000Z', contact: null,
  })),
  {
    id: EXTREME_THREAD_ID, gmail_account_id: ACCOUNT_ID, gmail_thread_id: 'gmail-thread-extreme', contact_id: null,
    subject: `Corpus extremo — ${'ASSUNTOSEMQUEBRA'.repeat(180)}`, snippet: 'TRECHOSEMQUEBRA'.repeat(420),
    label_ids: ['INBOX'], message_count: 1, is_unread: false, is_starred: false, is_important: false,
    last_message_at: '2026-10-01T12:00:00.000Z', last_from_name: 'REMETENTESEMQUEBRA'.repeat(80), last_from_address: 'extremo@example.com',
    assigned_to: null, status: 'open', priority: 'medium', tags: ['Extremo'], created_at: '2026-10-01T12:00:00.000Z', updated_at: '2026-10-01T12:00:00.000Z', contact: null,
  },
];

const messages = [
  {
    id: MESSAGE_ID, thread_id: THREAD_ID, gmail_message_id: 'gmail-message-1', gmail_account_id: ACCOUNT_ID,
    from_address: 'notifications@vercel.com', from_name: 'Vercel', to_addresses: ['admin@zapp.local'], cc_addresses: [], bcc_addresses: [],
    reply_to_address: 'support@vercel.com', subject: threads[0].subject, body_text: 'Hello, Promo.\n\nThe preview deployment for departamento-pessoal-v3 failed.\n\nOpen the deployment dashboard to inspect the build log.',
    body_html: '<p>Hello, <strong>Promo</strong>.</p><p>The preview deployment for <strong>departamento-pessoal-v3</strong> failed.</p><p>Open the deployment dashboard to inspect the build log.</p>',
    snippet: 'The preview deployment failed.', label_ids: ['INBOX', 'UNREAD'], is_read: false, is_starred: false, has_attachments: true,
    in_reply_to: null, references_header: null, message_id_header: '<vercel-preview-1@example.com>', internal_date: '2026-10-02T17:35:00.000Z', direction: 'inbound', created_at: '2026-10-02T17:35:00.000Z',
  },
  {
    id: '30000000-0000-4000-8000-000000000002', thread_id: THREAD_ID, gmail_message_id: 'gmail-message-2', gmail_account_id: ACCOUNT_ID,
    from_address: 'admin@zapp.local', from_name: 'Admin 01', to_addresses: ['support@vercel.com'], cc_addresses: [], bcc_addresses: [], reply_to_address: null,
    subject: `Re: ${threads[0].subject}`, body_text: 'Obrigado pelo aviso. Já estou verificando o commit e retorno por aqui.', body_html: '', snippet: 'Obrigado pelo aviso.',
    label_ids: ['SENT'], is_read: true, is_starred: false, has_attachments: false, in_reply_to: '<vercel-preview-1@example.com>', references_header: '<vercel-preview-1@example.com>',
    message_id_header: '<zapp-reply-2@example.com>', internal_date: '2026-10-02T17:42:00.000Z', direction: 'outbound', created_at: '2026-10-02T17:42:00.000Z',
  },
];

const extremeMessages = [{
  id: EXTREME_MESSAGE_ID, thread_id: EXTREME_THREAD_ID, gmail_message_id: 'gmail-message-extreme', gmail_account_id: ACCOUNT_ID,
  from_address: 'extremo@example.com', from_name: 'REMETENTESEMQUEBRA'.repeat(80), to_addresses: ['admin@zapp.local'], cc_addresses: Array.from({ length: 50 }, (_, index) => `participante-${index + 1}@example.com`), bcc_addresses: [],
  reply_to_address: null, subject: threads.at(-1)?.subject, body_text: `${'CORPOSEMQUEBRA'.repeat(900)}\n${'Linha extensa com espaços. '.repeat(500)}`,
  body_html: '', snippet: 'CORPOSEMQUEBRA'.repeat(100), label_ids: ['INBOX'], is_read: true, is_starred: false, has_attachments: true,
  in_reply_to: null, references_header: null, message_id_header: '<extreme@example.com>', internal_date: '2026-10-01T12:00:00.000Z', direction: 'inbound', created_at: '2026-10-01T12:00:00.000Z',
}];

const extremeAttachments = Array.from({ length: 100 }, (_, index) => ({
  id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  email_message_id: EXTREME_MESSAGE_ID, gmail_attachment_id: `extreme-attachment-${index + 1}`,
  filename: `ARQUIVO_EXTREMAMENTE_LONGO_SEM_QUEBRA_${'X'.repeat(180)}_${index + 1}.txt`,
  mime_type: 'text/plain', size_bytes: 1024 + index, created_at: '2026-10-01T12:00:00.000Z',
}));

type CrmFixtureMode = 'disabled' | 'available' | 'ambiguous' | 'permission_denied';

const completeCompany = {
  id: 'crm-company-acme', name: 'Empresa Exemplo', legalName: 'Empresa Exemplo LTDA',
  website: 'https://empresa.example.test/catalogo?origem=email#sobre', logoUrl: null,
  industry: 'Tecnologia', location: 'São Paulo, SP, Brasil',
  about: 'Descrição empresarial sintética com origem no CRM. '.repeat(12),
  relationships: ['cliente', 'fornecedor'], relationshipsKnown: true,
  socials: [
    { platform: 'linkedin', url: 'https://www.linkedin.com/company/empresa-exemplo/' },
    { platform: 'instagram', url: 'https://www.instagram.com/empresa.exemplo/' },
  ],
  socialsKnown: true, aboutKnown: true, updatedAt: '2026-10-01T10:00:00.000Z',
};

const completeOtherCompany = {
  ...completeCompany,
  id: 'crm-company-other', name: 'Outra Empresa', legalName: 'Outra Empresa S.A.',
  website: 'https://outra-empresa.example.test/',
};

export async function mockEmailNavy(page: Page, options: { includeExtreme?: boolean; crmContext?: CrmFixtureMode } = {}) {
  await installFakeSession(page);
  await mockTalkXAuth(page);

  await page.route(/\/rest\/v1\/(?!rpc|profiles|user_roles|email_threads|email_messages|email_labels|email_attachments)[a-z_]+/, route =>
    isRead(route.request().method()) ? json(route, []) : json(route, { message: 'escrita externa bloqueada no E2E' }, 403),
  );
  await page.route(/\/functions\/v1\/(?!gmail-oauth|gmail-sync|gmail-send)[a-z-]+/, route => json(route, { message: 'função externa bloqueada no E2E' }, 403));

  await page.route(/\/functions\/v1\/gmail-oauth/, async route => {
    const request = route.request().postDataJSON() as { action?: string };
    if (request.action !== 'list-accounts') return json(route, { message: 'mutação OAuth bloqueada no E2E' }, 403);
    return json(route, { accounts: [
      { id: ACCOUNT_ID, user_id: '00000000-0000-4000-8000-000000000001', email_address: 'admin@zapp.local', is_active: true, sync_status: 'synced', last_sync_at: '2026-10-02T17:40:00.000Z', last_error: null, created_at: '2026-01-01T00:00:00.000Z' },
      { id: SECOND_ACCOUNT_ID, user_id: '00000000-0000-4000-8000-000000000001', email_address: 'financeiro@zapp.local', is_active: true, sync_status: 'synced', last_sync_at: '2026-10-02T17:40:00.000Z', last_error: null, created_at: '2026-01-02T00:00:00.000Z' },
    ] });
  });
  await page.route(/\/functions\/v1\/gmail-(send|sync)/, async route => {
    const request = route.request().postDataJSON() as { action?: string };
    const allowed = ['mark-read', 'get-attachment', 'modify-thread-labels'];
    if (!allowed.includes(request.action || '')) return json(route, { message: 'envio e mutação externa bloqueados no E2E' }, 403);
    return request.action === 'get-attachment' ? json(route, { data: 'Zml4dHVyZQ==', size: 7 }) : json(route, { success: true });
  });

  await page.route(/\/rest\/v1\/email_threads/, route => isRead(route.request().method()) ? json(route, options.includeExtreme ? threads : threads.filter(thread => thread.id !== EXTREME_THREAD_ID)) : json(route, { message: 'escrita bloqueada' }, 403));
  await page.route(/\/rest\/v1\/email_messages/, route => {
    if (!isRead(route.request().method())) return json(route, { message: 'escrita bloqueada' }, 403);
    const threadFilter = new URL(route.request().url()).searchParams.get('thread_id');
    return json(route, threadFilter === `eq.${EXTREME_THREAD_ID}` ? extremeMessages : messages);
  });
  await page.route(/\/rest\/v1\/email_labels/, route => isRead(route.request().method()) ? json(route, [
    { id: '50000000-0000-4000-8000-000000000001', gmail_account_id: ACCOUNT_ID, gmail_label_id: 'INBOX', name: 'Caixa de entrada', label_type: 'system', color: null, message_count: 6, unread_count: 2 },
    { id: '50000000-0000-4000-8000-000000000002', gmail_account_id: ACCOUNT_ID, gmail_label_id: 'SENT', name: 'Enviados', label_type: 'system', color: null, message_count: 3, unread_count: 0 },
    { id: '50000000-0000-4000-8000-000000000003', gmail_account_id: ACCOUNT_ID, gmail_label_id: 'Label_Clientes', name: 'Clientes importantes', label_type: 'user', color: null, message_count: 2, unread_count: 0 },
  ]) : json(route, { message: 'escrita bloqueada' }, 403));
  await page.route(/\/rest\/v1\/email_attachments/, route => {
    if (!isRead(route.request().method())) return json(route, { message: 'escrita bloqueada' }, 403);
    const messageFilter = new URL(route.request().url()).searchParams.get('email_message_id') || '';
    return json(route, messageFilter.includes(EXTREME_MESSAGE_ID) ? extremeAttachments : [
      { id: '60000000-0000-4000-8000-000000000001', email_message_id: MESSAGE_ID, gmail_attachment_id: 'attachment-1', filename: 'deployment-log.txt', mime_type: 'text/plain', size_bytes: 12288, created_at: '2026-10-02T17:35:00.000Z' },
    ]);
  });
  const crmContext = options.crmContext ?? 'disabled';
  let linkedExternalContactId: string | null = null;
  if (crmContext !== 'disabled') {
    await page.route(/\/rest\/v1\/feature_flags/, route => isRead(route.request().method())
      ? json(route, [{ key: 'crm.integration', enabled: true, description: 'Fixture CRM Email', updated_at: '2026-10-03T12:00:00.000Z' }])
      : json(route, { message: 'escrita bloqueada' }, 403));
    await page.route(/\/functions\/v1\/crm-integration/, route => {
      const request = route.request().postDataJSON() as { action?: string; contactId?: string; externalContactId?: string; selectedExternalContactId?: string };
      if (request.action === 'linkEmailContactCompany') {
        if (crmContext !== 'ambiguous' || !['crm-contact-acme', 'crm-contact-other'].includes(request.externalContactId || '')) {
          return json(route, { error: 'vínculo CRM inválido na fixture' }, 409);
        }
        linkedExternalContactId = request.externalContactId || null;
        return json(route, { data: { linked: true } });
      }
      if (request.action !== 'emailContactContext') return json(route, { error: 'ação CRM inesperada na fixture' }, 403);
      if (crmContext === 'permission_denied') return json(route, { error: 'Email contact context is not visible' }, 404);
      const selectedExternalContactId = request.selectedExternalContactId || (crmContext === 'ambiguous' ? null : 'crm-contact-acme');
      const source = { linked: linkedExternalContactId === selectedExternalContactId, consultedAt: '2026-10-03T12:00:00.000Z', resolution: 'email_exact', participantEmail: 'notifications@vercel.com', selectedExternalContactId, canLink: Boolean(request.contactId) };
      if (crmContext === 'ambiguous' && !request.selectedExternalContactId) return json(route, {
        data: {
          status: 'ambiguous', company: null, source,
          candidates: [
            { externalContactId: 'crm-contact-acme', companyId: 'crm-company-acme', companyName: 'Empresa Exemplo' },
            { externalContactId: 'crm-contact-other', companyId: 'crm-company-other', companyName: 'Outra Empresa' },
          ],
        },
      });
      const company = request.selectedExternalContactId === 'crm-contact-other' ? completeOtherCompany : completeCompany;
      return json(route, { data: { status: 'available', company, source } });
    });
  }
}
