/**
 * Stack de fonte única para e-mail transacional (Edge Functions).
 *
 * F7 do PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24 (achado A13): os 4
 * templates de e-mail (send-scheduled-report, sentiment-alert,
 * detect-new-device, talkx-report) citavam 3 stacks diferentes — 2 com a
 * mesma stack "sistema" (Segoe UI/Roboto) e 2 com Arial puro.
 *
 * Web fonts (Plus Jakarta Sans/Outfit) não são confiáveis em cliente de
 * e-mail — a maioria bloqueia @font-face ou CSS externo. A stack de sistema
 * é o padrão correto: renderiza a fonte nativa de cada plataforma (San
 * Francisco no Mail da Apple, Segoe UI no Outlook, Roboto no Gmail
 * Android), com Arial/Helvetica como fallback final para clientes antigos
 * que não reconhecem `-apple-system`/`BlinkMacSystemFont`.
 */
export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
