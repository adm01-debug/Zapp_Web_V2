# Auditoria de segurança — front-end (somente leitura) — 2026-10-07

Especialista: worker (auth/segurança) (area-auth-seguranca)

- **Base auditada:** branch do dia `dia/2026-10-07`, commit `af189d0c52c12b30883da6b2582a3381a7f8bbe5` (cópia de trabalho do cartão Y28).
- **Escopo:** `src/**` (2.194 arquivos `.ts`/`.tsx`), mais `.env.example` e `.env.production` **versionados** (por serem "`.env` exposto").
- **Fora de escopo por decisão do cartão:** `supabase/**` de banco e Edge Functions só foram consultados como referência do que o front chama; a correção de RLS/coluna/RPC é do `worker (sql)`.
- **Regra do cartão:** nenhuma linha de código de produto foi alterada e nenhuma sugestão aqui foi aplicada. Único arquivo criado: este relatório.
- **Nada de produção foi tocado.** Nenhum valor de chave, token, telefone, e-mail ou conteúdo de conversa é reproduzido neste documento.

## URGENTE (P0/P1)

Nenhum **P0** encontrado. Um **P1** abaixo.

### SEC-FRONTEND-01 — P1 (URGENTE) — Chamada de Edge Function montada com `VITE_SUPABASE_URL` (host não validado) e com o `access_token` do usuário

**Evidência**

- `src/hooks/integrations/useTalkXTemplates.ts:178` — `const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;`
- `src/hooks/integrations/useTalkXTemplates.ts:179-183` — `fetch(`${supabaseUrl}/functions/v1/talkx-send`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, …})`
- `src/components/team-chat/teamChatParts.tsx:41` — mesma variável usada para montar URL de objeto de storage: `` `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/…` ``
- **Contraste no próprio repositório** — `src/integrations/supabase/client.ts:7-14` documenta que o ambiente de hospedagem injeta `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` apontando para **outro projeto** (projeto interno da plataforma) e que, por isso, o app **não** lê essas variáveis; o endereço canônico vem de `src/config/supabase.ts:46` (`SUPABASE_URL = LOCAL_SUPABASE?.url ?? PRODUCTION_SUPABASE_URL`, definido em `src/config/supabase.ts:3`). O `client.ts` escolhe valores fixos justamente para o app nunca cair no banco errado — mas os dois arquivos acima furaram essa regra.

**Cenário de exploração (3 passos)**

1. O build de produção herda `VITE_SUPABASE_URL` do ambiente da plataforma (comportamento que o `client.ts` documenta como real) e a variável aponta para o projeto interno, não para o banco oficial.
2. O atendente abre Modelos do TalkX e usa "Testar" (`testTemplate`, o ponto que usa essa variável junto com a sessão).
3. O navegador faz `POST` para `https://<projeto-interno>/functions/v1/talkx-send` levando o JWT de sessão do usuário no header `Authorization` — a credencial sai para outra origem (e o teste ainda falha, porque a função não existe lá).

Observação: no caminho do `teamChatParts.tsx` não há token, mas o resultado é URL de mídia apontando para o host errado (link quebrado e, se o host resolver, requisição para terceiro).

**Correção sugerida (NÃO aplicar)**

- Trocar as duas ocorrências por `SUPABASE_URL` importado de `@/config/supabase` (a mesma fonte do `client.ts`).
- Opcional, como trava: um teste que falhe se `import.meta.env.VITE_SUPABASE_URL` voltar a ser lido em `src`.
- Esforço: **baixo** (≈15 min).

## Demais achados

### SEC-FRONTEND-02 — P2 — `href` sem validação de protocolo em dado de sistema externo (XSS no clique)

**Evidência**

- `src/components/inbox/contact-details/Contact360Helpers.tsx:124` — `<a href={company.website} target="_blank" rel="noopener noreferrer" …>`
- `src/components/inbox/contact-details/Contact360Helpers.tsx:233` — `<a key={i} href={s.url || '#'} target="_blank" …>`
- `src/components/inbox/contact-details/Contact360Helpers.tsx:105` — `<img src={company.logo_url} …>` (mesmo dado sem validação)
- Origem do dado: `src/hooks/crm/useExternalContact360.ts` (CRM externo "Gestão de Clientes"), tipos em `src/types/contact360.ts:25` (`url: string | null`) e `:88` (`website: string | null`).
- **Guardas que já existem no repo e não são usadas aqui:** `src/lib/urlSafety.ts:6` (`isSafeHttpUrl`, só http/https absoluto) e `src/lib/emailCompanyLinks.ts:5` (`normalizeExternalUrl`, com lista de hosts permitidos para redes sociais). Já usadas em `src/components/inbox/contact-details/sidebar/SidebarRow.tsx:6,54,87`, `.../sidebar/PersonalSection.tsx:8,70` e `src/components/email/EmailContactPanel.tsx:76-80`.

**Cenário (3 passos)**

1. Um valor de `website`/`url` social de empresa é gravado no CRM externo como `javascript:…` (esquema que `new URL` rejeita, mas que um `href` aceita).
2. O atendente abre o painel 360 do contato.
3. Ao clicar no link, o script roda na **origem do app**, com a sessão do atendente (e poderia ler `localStorage` — ver SEC-FRONTEND-06).

**Correção sugerida (NÃO aplicar)**

- Aplicar `isSafeHttpUrl` (ou `normalizeExternalUrl`) em `company.website` e em `social[].url`, e usar o mesmo guard em `logo_url`; as três seções vizinhas já fazem isso.
- Esforço: **baixo**.

### SEC-FRONTEND-03 — P2 — Rascunho de conversa em `localStorage` sem escopo por usuário e sem limpeza no logout

**Evidência**

- `src/components/inbox/chat/useChatInputLogic.ts:4` — `const DRAFT_KEY_PREFIX = 'chat_draft_';`
- `:46` — `localStorage.setItem(`${DRAFT_KEY_PREFIX}${contactId}`, inputValue)` (chave = **só** o id do contato)
- `:59` — restaura o rascunho ao trocar de contato; `:96` limpa ao enviar.
- **Contraste no próprio repositório (duas vezes):**
  - E-mail: `src/hooks/auth/useAuth.tsx:147` e `:214` chamam `clearEmailDraftSessions()` (definição em `src/lib/emailDraftSession.ts:80`, comentário: "Remove every local Email composition so a later login cannot inherit it").
  - Chat de equipe: `src/hooks/chat/useTeamChatDraft.ts:13-15` usa chave por usuário (`zapp.teamchat.draft:<userId>:<conversationId>`) e `:24-31` apaga o prefixo legado `team_draft_`, com o comentário de que o rascunho sem escopo "vazava entre contas no mesmo navegador" — exatamente o defeito que o rascunho do Inbox ainda tem.

**Cenário (3 passos)**

1. Atendente A digita um rascunho na conversa do cliente X e faz logout (o rascunho **não** é apagado pelas duas limpezas que existem hoje).
2. Atendente B entra na mesma máquina/navegador e abre a conversa X.
3. O campo de mensagem vem preenchido com o texto de A (conteúdo de conversa e possivelmente PII do cliente).

**Correção sugerida (NÃO aplicar)**

- Chave por usuário: `zapp.inbox.draft:<userId>:<contactId>`; e incluir esses rascunhos na limpeza do `signOut` ao lado de `clearEmailDraftSessions()`; apagar também o formato antigo na montagem (mesmo padrão do `useTeamChatDraft`).
- Esforço: **baixo/médio**.

### SEC-FRONTEND-04 — P3 — Janela aberta sem `noopener` (reverse tabnabbing)

**Evidência**

- `src/components/team-chat/teamChatParts.tsx:65` — `onClick={() => window.open(resolvedUrl, '_blank')}` (imagem de mídia do chat interno).
- Todos os outros `window.open` do app passam `'noopener,noreferrer'` (ex.: `src/components/inbox/LocationMessage.tsx:146,151`, `src/components/inbox/MediaPreview.tsx:79`, `src/components/inbox/InteractiveMessage.tsx:36`, `src/components/catalog/CatalogRail.tsx:352`).

**Cenário:** a página aberta (mídia servida por URL de storage/`media_url`) mantém `window.opener` e pode navegar a aba do Zapp para uma página falsa de login.

**Correção sugerida (NÃO aplicar):** `window.open(resolvedUrl, '_blank', 'noopener,noreferrer')`. Esforço: **trivial**.

### SEC-FRONTEND-05 — P3 — Busca livre do operador espelhada na URL (`?q=`)

**Evidência**

- `src/hooks/system/useUrlFilters.ts:24` — `search: 'q'`; `:98` — `params.set(PARAM_KEYS.search, newFilters.search)` (com `replace: true`).
- `src/hooks/inbox/useInboxFilters.ts:63-65` — `setSearch` → `setUrlFilters({ search: value })`; e o campo busca **nome, telefone e e-mail** do contato (`useInboxFilters.ts:130-132`).
- Mesmo padrão no módulo de Tarefas: `src/hooks/tasks/workItemFilters.ts:65` (`params.set('q', f.q)`) + `src/hooks/tasks/useTasksFilters.ts:99-101` (`history.replaceState`).
- `src/hooks/dashboard/useDashboardUrlFilters.ts` usa o mesmo `useUrlFilters`.

**Cenário (3 passos)**

1. O atendente pesquisa o telefone de um cliente no Inbox (ou o nome/e-mail).
2. A URL passa a exibir `?q=<telefone>`; o dado fica na barra de endereço, na restauração de sessão do navegador e em qualquer print/tela compartilhada.
3. Um link copiado da barra de endereço leva o dado pessoal para fora da ferramenta (chat, e-mail, ticket).

**Correção sugerida (NÃO aplicar):** manter o texto da busca apenas no estado (fora da URL) ou persistir um identificador opaco; se o link compartilhável for necessário, não serializar o texto livre digitado pelo operador. Esforço: **médio** (há teste de rota espelhada na URL no módulo de Tarefas).

### SEC-FRONTEND-06 — P3 — Sessão persistida em `localStorage`

**Evidência:** `src/integrations/supabase/client.ts:24-31` — `storage: typeof window !== 'undefined' ? window.localStorage : undefined`, `persistSession: true`, `detectSessionInUrl: true`, `flowType: 'pkce'`.

**Risco:** é o comportamento padrão do `supabase-js` (não é regressão), mas torna *access* e *refresh token* legíveis por qualquer script que rode na origem — inclusive pelos achados SEC-FRONTEND-01/02. O refresh token renova a sessão por dias.

**Correção sugerida (NÃO aplicar):** endurecimento estrutural (cookie `httpOnly`/BFF). Mitigação imediata sem mudar arquitetura: manter CSP restritiva e garantir a limpeza de storage no logout (hoje só os rascunhos de e-mail são limpos — SEC-FRONTEND-03). Esforço: **alto** (estrutural).

### SEC-FRONTEND-07 — P3 — `.select('*')` em tabelas sensíveis (colunas além do necessário chegam ao navegador)

**Evidência:** 132 ocorrências de `.select('*')` em 98 arquivos de `src` (122 no encadeamento direto `.from(...).select('*')`). Nas tabelas cujas colunas são sensíveis (nomes de coluna conforme `src/integrations/supabase/types.ts` e `supabase/schema-catalog.json`):

| Tabela | Colunas sensíveis que o `*` traz | Caminhos (linha do `.select('*')`) |
|---|---|---|
| `whatsapp_connections` | `qr_code`, `instance_id`, `instance_token_secret_id` | `src/components/monitoring/hooks/useMonitoringData.ts:74`, `src/components/settings/CSATAutoConfig.tsx:32`, `src/hooks/inbox/useConnectionsManager.ts:145`, `src/hooks/system/useDiagnosticsData.ts:138,235` |
| `ai_providers` | `api_key_secret_name` | `src/components/settings/ai-providers/useAIProviders.ts:66` |
| `audit_logs` | `details` (jsonb com contexto de erro, ver SEC-FRONTEND-08) | `src/components/admin/useAdminData.ts:100`, `src/components/security/AuditLogDashboard.tsx:82`, `src/hooks/analytics/useAIStats.ts:143`, `src/hooks/inbox/useSentimentAlerts.ts:109` |
| `password_reset_requests_safe` | `email`, `ip_address`, `user_agent` | `src/components/security/PasswordResetRequestsPanel.tsx:36` |
| `blocked_ips` / `ip_whitelist` | `ip`, `reason`, `created_by` | `src/components/security/BlockedIPsPanel.tsx:27`, `src/components/security/IPWhitelistPanel.tsx:57` |
| `user_devices` | `ip_address`, `city`, `country`, `device_fingerprint` | `src/hooks/ui/useDeviceDetection.ts:141,157` |
| `contacts` / `messages` | telefone, e-mail, conteúdo de conversa | vários caminhos (ex.: `src/services/chat.service.ts:38,65`, `src/hooks/inbox/useRealtimeInbox.ts:101`, `src/pages/ChatPopup.tsx:108`) |

**Observação importante de escopo:** `select('*')` **não** fura RLS — a policy decide a linha, não a coluna. O ganho de restringir é (a) não trazer para o *browser* (memória, cache do React Query, devtools de terceiros) coluna que a tela não usa, e (b) não depender de a coluna continuar sem leitura ampla. Nas tabelas já protegidas por coluna/RLS o risco é menor: `departments.whatsapp_api_key` tem `REVOKE`/`GRANT` por coluna (`supabase/migrations/20260902210000_revoke_departments_secrets_from_authenticated.sql:23-25`) e `channel_connections.credentials` só é lido pela view `channel_connections_safe`, com `REVOKE EXECUTE` de `get_channel_credentials` para `authenticated` (`supabase/migrations/20260827130600_security_revokes_clear_login_gmail_creds.sql:15`).

**Correção sugerida (NÃO aplicar):** trocar por lista explícita de colunas nas linhas da tabela acima (começando pelas de segurança: `whatsapp_connections`, `password_reset_requests_safe`, `ai_providers`, `user_devices`). É a mesma técnica que o cartão de coluna já aplicou no banco. Esforço: **médio** (mecânico, mas são 98 arquivos; começar pelas 6 tabelas sensíveis).

### SEC-FRONTEND-08 — P3 — Objeto de erro cru em log de produção

**Evidência**

- `src/lib/logger.ts:50-55` — `shouldLog`: `warn` e `error` **continuam** sendo emitidos no build de produção (só `debug`/`info` são filtrados).
- `src/lib/mapboxToken.ts:134` — `log.error(`Mapbox falhou (${where}/${kind})`, detail)`, com `detail` sendo o objeto de erro cru do `mapbox-gl`/`invoke`. Chamadores: `src/components/contacts/ContactRegionMap.tsx:79,110,122`, `src/components/inbox/LocationMessage.tsx:53,102,117`, `src/components/inbox/location-picker/useLocationPicker.ts:113,183,209`, `src/components/inbox/location-picker/useAddressAutocomplete.ts:363,500`.

**Risco (condicional):** erros de carregamento do `mapbox-gl` podem carregar a URL da requisição, que contém o parâmetro `access_token=` do token do mapa (token público, de curta duração e restrito por URL, buscado sob demanda em `src/lib/mapboxToken.ts` — `requestToken` em `:76`, `getMapboxToken` em `:110`) — mas ainda assim credencial, e o console de produção fica legível por qualquer extensão do navegador.

**Correção sugerida (NÃO aplicar):** logar só a taxonomia (`where`, `kind`, `status`) e não o objeto de erro cru; se o erro for necessário, reduzir a `message` e filtrar `access_token`. Esforço: **baixo**.

## Verificado e SEM problema (cobertura)

1. **`dangerouslySetInnerHTML` — 5 usos, todos seguros:**
   - `src/components/gmail/EmailThreadView.tsx:121` e `src/components/email/EmailChatBubble.tsx:165` usam `sanitizeEmailHtml` (`src/lib/emailHtml.ts:148`), que é DOMPurify **instância isolada** (`emailHtml.ts:125-145`), *allowlist* de tags/atributos (`:22-31`), `removeAllHooks` inócuo, falha **fechada** se não houver hooks, links com `rel="noopener noreferrer nofollow"` (`:66-69`), imagens remotas/`cid:` bloqueadas e `url()` de CSS descartado (`:70-89`, `:109`).
   - `src/components/inbox/chat/MarkdownPreview.tsx:9-14` **escapa todo o HTML antes** de aplicar negrito/itálico/código — nenhuma tag pode ser injetada.
   - `src/components/inbox/LinkPreview.tsx:87-89` monta o HTML com `escapeHtml` + regex de URL `https?://` + `encodeURI`.
   - `src/components/ui/chart.tsx:70` só injeta CSS com `id` do próprio container.
2. **Links externos:** as 20 ocorrências de `target="_blank"` em `src` trazem `rel="noopener noreferrer"` (nenhuma passou sem `rel`).
3. **Redirecionamento aberto:** nenhum. Todos os `window.location.href` são literais (`ProtectedRoute.tsx:54,185,211`, `SecurityView.tsx:171,192`, `ErrorBoundary.tsx:121`, `SecuritySettingsPanel.tsx:75`); o `redirectTo` do OAuth é fixo em `window.location.origin` (`src/hooks/auth/useAuthForm.ts:229`); `src/pages/SSOCallback.tsx:13-16` só exibe `error`/`error_description` como texto; `src/hooks/integrations/useGmailOAuth.ts:37-42,68-72` valida o `state` e mapeia a view de retorno por *allowlist* (`VALID_VIEWS`, `VALID_INTEGRATION_VIEWS`), nunca navegando para valor vindo da query.
4. **`postMessage`:** nenhum `window.postMessage(…, '*')`. Só `BroadcastChannel` intra-origem (`src/lib/mediaVolumeStore.ts:128`, `src/lib/calls/tabLeaderStore.ts:166`) e mensagem de *service worker* (`src/hooks/system/useSecurityPushNotifications.ts:121`), que só exibe *toast* — origem é a mesma por construção.
5. **Segredos em `.env` versionado:** `.env.example` contém **apenas** placeholders (as variáveis `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN`, `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY` e `VITE_SUPABASE_PUBLISHABLE_KEY` trazem texto do tipo "sua-…-key"/"seu-…", sem valor real). `.env.production` (permitido por `.gitignore:16`) só tem `VITE_*` públicos, e o `client.ts:8-14` nem os lê. **Nenhum valor real de chave, token ou credencial é reproduzido aqui.**
6. **`service_role` no cliente:** nenhuma ocorrência em `src` (só em comentários/testes de guarda: `src/__tests__/rls-boundary.test.ts:264` e `src/components/calls/__tests__/calls-access.test.ts:109`).
7. **`innerHTML`:** 4 usos, todos com markup estático do próprio componente, sem interpolar dado de fora — `src/hooks/ui/useSwipeNavigation.ts:55`, `src/hooks/ui/useScreenProtection.ts:127`, `src/components/inbox/LocationMessage.tsx:86` (só um booleano `isLive` entra na string), `src/components/inbox/location-picker/useLocationPicker.ts:129`.
8. **`console.log` com PII:** as chamadas diretas de `console.*` em `src` estão só em `src/lib/logger.ts`; o logger filtra `debug`/`info` em produção (`logger.ts:50-55`) e o `sessionId` é opaco (`logger.ts:17-26`). O único risco real levantado está em SEC-FRONTEND-08.
9. **Token em URL:** o fluxo OAuth é PKCE (`client.ts:30`) e o `code` é removido da URL logo após o uso (`useGmailOAuth.ts:49-51`); nenhum `access_token`/`refresh_token` é colocado em query string.
10. **O que o front consulta no banco permanece nas trilhas seguras:** `departments` (colunas de credencial revogadas para `authenticated` + `get_department_whatsapp_credentials` com `is_admin_or_supervisor` no `WHERE`), `channel_connections` (view `_safe`; `get_channel_credentials` revogada), `gmail_accounts` (view `_safe`), `get_connection_qr_code`/`get_connection_instance` (IDOR fechado em `supabase/migrations/20260901210000` e `20260902000500`, com predicado `created_by … OR is_admin_or_supervisor`), `audit_logs` (INSERT bloqueado para `authenticated`; leitura admin-only).

## Observações fora do escopo de segurança (registro, sem correção)

- `src/hooks/team-chat/useActiveDepartments.ts:16-17` pede `.select('id, name, description, is_active')` em `departments`, mas `description` **não existe** em `supabase/schema-catalog.json`, e o `GRANT SELECT` por coluna daquela tabela cobre só `id, name, is_active, whatsapp_mode, created_at, updated_at` (`supabase/migrations/20260902210000_…sql:23-25`). A consulta tende a falhar (coluna inexistente/negada) — é defeito funcional, não de segurança, e cruza com a área do `worker (sql)`. Registrado, não alterado.

## Método

- Ferramentas: `rg` sobre `src` (busca restrita à cópia de trabalho do cartão), leitura dos arquivos citados, `supabase/schema-catalog.json` (gerado do banco) e `supabase/migrations/**` **apenas como referência** do que o front chama. Nenhum acesso a banco, rede ou produção.
- Nada foi alterado: `git diff --stat` deste cartão contém **um** arquivo, este relatório.
