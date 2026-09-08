/**
 * O CRM externo e acessado exclusivamente pela Edge Function autenticada
 * `crm-integration`. Nenhuma URL ou chave do projeto externo e enviada ao
 * navegador.
 */
// Fail closed during staged deployments: the browser only switches to the
// server-side gateway after DB + Edge smoke tests have passed.
export const isExternalConfigured = import.meta.env.VITE_CRM_INTEGRATION_ENABLED === 'true';
