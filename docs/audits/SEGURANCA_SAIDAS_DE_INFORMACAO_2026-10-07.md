# Segurança (leitura): mapa de TODAS as saídas de informação do sistema

- Cartões: t_afd2046b — Y29 original; t_ed2167f5 — refazer 1; t_3beef3f3 — refazer 2 (este), todos do plano `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- Especialista: worker (auth/segurança) — skill `area-auth-seguranca`
- Data: 2026-10-07 · Natureza: AUDITORIA EM LEITURA. Nada foi corrigido, nada foi aplicado.
- Branch/base: `v2/refazer-y29-saidas-t-3beef3f3-2610071746a616` sobre `dia/2026-10-07`; trabalho anterior reaproveitado de `v2/refazer-y29-saidas-t-ed2167f5-26100717196610` (`de28b6a39`)

## Regra do dono usada como critério

> NENHUMA informação pode sair do sistema.

Toda capacidade de (a) gravar dado em disco do usuário, (b) colocar dado na área de
transferência, (c) abrir canal externo (navegador/app de terceiro), (d) publicar URL sem
autenticação, (e) enviar dado para fora por integração/webhook/e-mail conta como SAÍDA e é
inventariada abaixo. P0/P1 = violação que um usuário autenticado (ou anônimo) consegue explorar.

## Método (somente repositório; sem banco, sem produção)

Buscas no próprio workspace do cartão (`src/`, `supabase/functions/`, `supabase/migrations/`,
`supabase/config.toml`):

- `createObjectURL`, `new Blob(`, `.download =`, `.click()` (sites reais de gravação em disco)
- `window.print`, `@media print`, `navigator.share` (API de compartilhamento), `toDataURL`
- `navigator.clipboard.writeText`, `document.execCommand`
- `mailto:`, `tel:`, `wa.me`, `whatsapp`, `sms:`, `t.me`, `api.whatsapp.com`
- `createSignedUrl`, `createSignedUrls`, `getPublicUrl` (links públicos/assinados)
- `storage.buckets` (public = true/false) e policies `ON storage.objects`
- `net.http_post` / `extensions.http_post` (webhooks de saída no banco)
- `Deno.env.get('*_URL'|'*_HOST'|'*_ENDPOINT'|'*_WEBHOOK')` e `fetch(` nas Edge Functions
- `RESEND_API_KEY` e destinos de e-mail das funções de alerta/relatório

Contagens conferidas com `rg` no repositório (ver seção "Cobertura").

---

# ⚠️ URGENTE (P0/P1)

| ID | Sev | Título |
|----|-----|--------|
| SEC-SAIDAS_DE_INFORMACAO-01 | P0 | O controle de download (`useDownloadPermission`) existe em 2 telas, mas usuários autenticados conseguem acionar caminhos equivalentes sem o gate |
| SEC-SAIDAS_DE_INFORMACAO-02 | P0 | CSV de histórico de envios do catálogo exporta nome do cliente e do agente (dado pessoal) por ação autenticada sem nenhum gate |
| SEC-SAIDAS_DE_INFORMACAO-03 | P0 | Figurinha recebida de cliente é copiada por usuário autenticado para o bucket PÚBLICO `stickers` — URL permanente, legível sem login |

Critério de P0 aplicado aqui: P0 = vazamento ou escrita indevida explorável por usuário
autenticado **ou** anônimo. Portanto -01, -02 e -03 são P0 mesmo sem caminho anônimo: todos
podem ser acionados por usuário autenticado e retiram dado do perímetro.

---

# Achados

## SEC-SAIDAS_DE_INFORMACAO-01 — P0 — Download: gate de permissão aplicado em 2 de 10 pontos inventariados

**Evidência (o gate, único):** `src/hooks/system/useDownloadPermission.ts:5-24` — lê
`profiles.can_download` e devolve `false` por padrão (`if (error || !data) return false`).

**Caminhos que RESPEITAM o gate (2):**
- `src/components/inbox/MediaPreview.tsx:37,45-51,55-65` (documento)
- `src/components/inbox/ImagePreview.tsx:22,33-38,40-47` (imagem)

**Pontos que NÃO consultam o gate (8) — o mesmo defeito, todos os caminhos:**
1. `src/components/catalog/catalogExport.ts:222-234` (`triggerCsvDownload`) é a porta real
   Blob+anchor sem gate, usada por `exportCatalogCsv` (`:256-281`) e por "Exportar seleção"
   (`ExternalProductCatalog.tsx:376-379`, `ExternalProductManagement.tsx:439`).
2. `src/hooks/integrations/useCatalogSendHistory.ts:173-190` monta o CSV de envios e chama a
   porta sem gate do item 1 por `ExternalProductManagement.tsx:386` (não é segunda porta
   Blob+anchor; é segundo fluxo de dado pelo mesmo disparador).
3. `src/components/catalog/sendProductUtils.ts:168-186` (foto do produto) →
   `SendProductDialog.tsx:334-351,671`.
4. `src/hooks/integrations/useGmail.ts:344-360` (anexo de e-mail).
5. `src/components/mfa/MFABackupCodes.tsx:51-72` (códigos de backup MFA do próprio usuário;
   exceção aceitável se declarada, hoje só não passa pelo gate).
6. `src/components/monitoring/MonitoringDiagnosticPanel.tsx:46-63` (TXT) e `:65-105` (PDF).
7. `src/components/team-chat/TeamPerformancePanel.tsx:22-32` (JSON de performance da equipe).
8. `src/components/inbox/chat/MessageBubble.tsx:244-267` (figurinha recebida → ver -03).

**Que dado sai:** catálogo/produtos (1), contato e agente em CSV (2, ver -02), foto de produto
(3), anexo de e-mail (4), códigos MFA do próprio usuário (5; exceção a documentar, não
vazamento de terceiro), infraestrutura/webhooks e fluxo de mensagens (6), métricas de equipe (7)
e figurinha/conteúdo recebido de cliente (8, ver -03).

**Quem pode acionar:** qualquer usuário autenticado que alcance a tela. As telas de catálogo,
monitoramento e pagamentos passam pelo portão de rota
(`src/pages/ViewRouter.tsx:132-142`, nega por padrão até papéis/permissões carregarem), mas o
gate de download é OUTRO controle — `can_download` — e não é consultado nesses pontos.

**Cenário de exploração (3 passos):**
1. Operador com `profiles.can_download = false` (download de mídia bloqueado).
2. Abre Catálogo → aba "Enviados" → "Exportar CSV".
3. Recebe em disco o CSV com nome de cliente/agente — o mesmo usuário não consegue baixar o PDF
   recebido no inbox.

**Viola a regra:** SIM (P0). Pelo critério do cartão, basta ser explorável por usuário
autenticado. A severidade final é P0 pelo pior caminho do achado: um usuário com
`can_download = false` consegue gravar dado de cliente/terceiro ou credencial operacional por
rotas equivalentes que ignoram o gate.

**Correção sugerida (NÃO aplicada):** extrair um único `downloadFileWithPermission()` que
consulta `useDownloadPermission` e é a ÚNICA porta de gravação (Blob+anchor); migrar os 8 pontos
para ele; onde o gate não fizer sentido (ex.: códigos de backup do próprio usuário), declarar
explicitamente a exceção com `allowWithoutPermission` + motivo. Teste por caminho, chamando o
helper real e provando que sem permissão NÃO há `createObjectURL` nem `anchor.click`.

**Esforço:** M (8 pontos + teste).

## SEC-SAIDAS_DE_INFORMACAO-02 — P0 — CSV de envios exporta nome de cliente e de agente sem gate

**Evidência:** `src/hooks/integrations/useCatalogSendHistory.ts:148-156` define as colunas
`Produto, SKU, Contato, Agente, Modelo, Fotos, Status, Data`; `:173-190` monta o CSV (com BOM) e
`:195-199` o nome do arquivo. O disparo é `ExternalProductManagement.tsx:386` via
`triggerCsvDownload(...)`, que não consulta `can_download` (`catalogExport.ts:222-234`).

**Que dado sai:** `contact_name` (cliente) e `agent_name` (colaborador) — dado pessoal de titular
identificável, em arquivo que fica no disco pessoal do operador, fora de qualquer registro.

**Quem pode acionar:** usuário autenticado com a permissão de módulo "Catálogo" (portão de rota
`ViewRouter.tsx:132-142`); `can_download` não é consultado.

**Cenário de exploração (3 passos):**
1. Agente abre a tela de catálogo com o filtro que quiser.
2. Botão "Exportar CSV" (histórico de envios).
3. Arquivo `catalogo_enviados_<data>.csv` com nomes de clientes e agentes — sem LGPD, sem gate.

**Viola a regra:** SIM (P0). É vazamento explorável por usuário autenticado: o operador que
alcança o módulo Catálogo aciona o botão e grava dado pessoal de cliente/agente em disco sem
`can_download` nem trilha.

**Correção sugerida (NÃO aplicada):** passar o CSV de histórico pelo mesmo
`downloadFileWithPermission` do achado -01 e, no mínimo, mascarar/omitir identificadores quando
`can_download = false`. Registrar no relatório de auditoria quem exportou (log de evento) —
hoje não há rastro.

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-03 — P0 — Figurinha recebida de cliente publicada em bucket PÚBLICO

**Evidência:**
- `src/components/inbox/chat/MessageBubble.tsx:32-70` — `getReceivedStickerDestination()` +
  `copyReceivedStickerToLibrary()`: baixa a mídia recebida e grava uma cópia própria;
- `:244-267` — o botão "Salvar na biblioteca" chama isso e depois
  `supabase.from('stickers').insert({ image_url: copy.url, ... })`;
- bucket público: `supabase/migrations/20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql:12-13`
  (`INSERT ... VALUES ('stickers','stickers', true)`);
- o comentário do próprio código (`MessageBubble.tsx:258-260`) confirma que a cópia existe para
  trocar o bucket privado (`whatsapp-media`) pelo `stickers`.

**Que dado sai:** conteúdo recebido de cliente (figurinha de WhatsApp) passa a ter URL pública
permanente (`getPublicUrl`, `MessageBubble.tsx:44`). Bucket público = leitura sem sessão.

**Quem pode acionar:** qualquer usuário autenticado que enxergue a mensagem (agente do contato).

**Cenário de exploração (3 passos):**
1. Cliente envia uma figurinha em conversa atendida pelo agente A.
2. A clica em "Salvar na biblioteca" (ação legítima de produto).
3. O arquivo do cliente existe em bucket público; qualquer pessoa com a URL lê sem autenticação —
   e o conteúdo do cliente saiu do perímetro pela via mais barata.

**Viola a regra:** SIM (P0). É escrita/publicação indevida explorável por usuário autenticado:
o agente que já vê a conversa torna mídia recebida de cliente acessível sem sessão por URL
pública permanente.

**Correção sugerida (NÃO aplicada):** manter `stickers` privado e servir a biblioteca por
`createSignedUrl` (o padrão que `useResolvedStorageUrl` já implementa, `src/hooks/storage/useResolvedStorageUrl.ts:87`);
se `stickers` continuar público, guardar apenas assets PRÓPRIOS do sistema nesse bucket e nunca
mídia derivada de conversa. Alternativa mínima: copiar para `whatsapp-media` com locator próprio.

**Esforço:** M (hook + policy + migração de URLs já gravadas → worker (sql)).

## SEC-SAIDAS_DE_INFORMACAO-04 — P2 — Quatro buckets públicos: URL é a credencial

**Evidência:** `supabase/migrations/20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql:4-17`
mantém `public = true` em `audio-memes`, `avatars`, `custom-emojis` e `stickers`. As migrações que
fecharam `whatsapp-media`, `audio-messages` e `team-chat-files`
(`20260905030000_private_media_buckets.sql:11`) não os cobrem.

**Que dado sai:** fotos de colaboradores (`avatars`; consumo em `AvatarUpload.tsx:44`,
`useAdminData.ts:185,249`, `batch-fetch-avatars/index.ts:118`, `_shared/evolution-helpers.ts:407`),
áudios-meme e emojis internos (`useAudioMemes.ts:147`, `useCustomEmojis.ts:88`,
`components/settings/media-library/useMediaUpload.ts:63`, `AIGenerateDialog.tsx:53`), figurinhas
(`useStickerPicker.ts:82`, `usePersonalStickers.ts:63`, `MessageBubble.tsx:44`) e mídia de
conversa quando publicada por -03. Todo `getPublicUrl` gera locator permanente e sem autenticação
(também em `src/services/chat.service.ts:124`, `useKnowledgeBase.ts:82`).

**Quem pode acionar:** quem tiver a URL (sem sessão); internamente qualquer usuário autenticado
que leia a página.

**Cenário (3 passos):** 1) agente abre um contato e a foto de perfil é servida por URL pública;
2) a URL é copiada (ou vaza no histórico/DNS/proxy); 3) abre em janela anônima, sem login, e a
imagem aparece.

**Viola a regra:** SIM (P2) — foto de pessoa física em bucket público, sem controle de acesso.

**Correção sugerida (NÃO aplicada):** `public = false` + policy de SELECT por proximidade
(equipe/tenant) e consumo por `createSignedUrl` com TTL curto. É mudança de policy →
`worker (sql)`.

**Esforço:** M.

## SEC-SAIDAS_DE_INFORMACAO-05 — P2 — Credencial SIP compartilhada entregue a qualquer usuário ativo

**Evidência:** `supabase/functions/get-sip-password/index.ts:44-61` — exige apenas
`auth.getClaims(token)` + `profiles.is_active`; devolve
`{ server, user, wsPort, password, profileId }` em `:61`. Não há checagem de papel
(`is_admin_or_supervisor`), de módulo ou de vínculo com a linha de telefonia.

**Que dado sai:** `SIP_PASSWORD` (segredo único e COMPARTILHADO da linha telefônica da empresa)
+ host/usuário/porta do PBX.

**Quem pode acionar:** qualquer usuário autenticado e ativo, inclusive um recém-criado "agent".

**Cenário (3 passos):** 1) usuário ativo chama a função com o próprio JWT;
2) recebe o segredo da linha; 3) registra um softphone/rota externa com a credencial corporativa
e passa a originar/atender chamadas fora do sistema.

**Viola a regra:** SIM (P2) — por desenho (T15 mandou tirar o host do front), mas hoje não há
escopo de permissão nem credencial por usuário.

**Correção sugerida (NÃO aplicada):** exigir papel/módulo VoIP (ex.: `is_admin_or_supervisor`
ou permissão nomeada) e registrar o acesso; ideal: credencial SIP por agente com revogação
individual. É decisão de dono (rotaciona quem entra no VoIP) → `hermes-pedir-decisao` quando for
corrigir.

**Esforço:** S (gate) / L (credencial por usuário).

## SEC-SAIDAS_DE_INFORMACAO-06 — P2 — Integrações de saída: para onde o dado do cliente vai hoje

Mapa dos canais por onde o conteúdo de conversa e o cadastro do cliente SAEM do sistema
(por desenho do produto, mas precisa estar escrito para a regra "nenhuma informação sai"):

**Evidência:** tabela abaixo, levantada em `supabase/functions/**`, `_shared/**`,
`supabase/config.toml` e migrações com `net.http_post`/`extensions.http_post`.

| Destino | Função / arquivo:linha | Que dado sai |
|---|---|---|
| WhatsApp / Meta (via Evolution API) | `functions/evolution-api/index.ts:42`, `evolution-media.ts:162`, `_shared/evolution-send.ts`, `multiplix-send/index.ts:113`, `talkx-send/index.ts:62` | mensagem, mídia, telefone do destinatário |
| Google / Gmail | `functions/gmail-send/**`, `gmail-sync/**`, `gmail-cron-sync/**`; front `src/hooks/integrations/useGmail.ts` | corpo de e-mail, anexos do cliente |
| Resend (terceiro de e-mail) | `functions/send-email/index.ts:99-111`, `send-scheduled-report/index.ts:98`, `sentiment-alert/index.ts:169-183`, `searchbox-budget-alert`, `send-rate-limit-alert` | e-mail/nome do convidado, nome do cliente + score de sentimento, relatórios agendados |
| Bitrix | `functions/bitrix-api/index.ts:100`, `sync-call-records/index.ts:162` | telefone, registro de chamada |
| Multiplix (disparo) | `functions/multiplix-*/**` | telefone, template, conteúdo de campanha |
| ElevenLabs (voz/TTS/STT) | `functions/elevenlabs-*/**` | áudio do cliente e texto de conversa |
| Mapbox | `functions/get-mapbox-token`, `src/lib/mapboxSession.ts` | consulta de endereço/geo |
| Provedores de IA | `functions/ai-proxy`, `ai-*`, `_shared/ai-providers.ts`, `_shared/ai-generate.ts:464` | trechos de conversa para classificação/resumo |
| PromoGifts (catálogo/CRM 360°) | `functions/promogifts-catalog/index.ts:325`, `crm-integration/**`, `_shared/crm-integration-contract.ts` | contato, sentimento, dados do cliente para o CRM externo |
| Postgres externo / VPS Evolution | `functions/external-db-proxy/index.ts:47,66`, `external-db-bridge/index.ts:8-20`, `evolution-sync/**` | leitura/espelhamento de `evolution_*`, `clientes`, catálogo |
| **Banco → edge por trigger** | `supabase/migrations/20260827150000_sicoob_bridge_use_pg_net.sql:32-45` (`notify_sicoob_on_reply`) | `contact_id`, `content` da mensagem, `message_id`, `agent_id` |
| Webhooks de entrada espelhados | `config.toml:8-15` (`evolution-webhook`, `whatsapp-webhook`, `gmail-webhook`) | não é saída, mas é a porta de entrada correspondente |

**Quem pode acionar:** usuários autenticados (via telas), cron (`pg_cron` + `net.http_post`) e
webhooks externos.

**Cenário de exploração/saída (3 passos):**
1. Usuário, automação ou trigger gera mensagem, relatório, alerta ou sincronização.
2. Edge Function/trigger envia payload com telefone, mensagem, mídia, score ou cadastro a provedor
   externo (Meta, Google, Resend, IA, CRM, Postgres externo etc.).
3. O dado do cliente passa a existir fora do sistema, sujeito à retenção/logs do provedor.

**Viola a regra:** SIM, materialmente (P2): conteúdo de conversa de cliente é enviado a
Meta, Google, Resend e provedores de IA. É o desenho do produto (decisão de dono), mas hoje **não
existe um inventário único** disso — este documento passa a ser esse inventário.

**Correção sugerida (NÃO aplicada):** manter a tabela acima como registro vivo e revisar caso a
caso (retenção/anonimização no envio à IA é o item de maior impacto). Nada a aplicar sem decisão
do dono.

**Esforço:** documental (feito) / L para anonimização na fronteira de IA.

## SEC-SAIDAS_DE_INFORMACAO-07 — P2 — Proteção de tela é opcional, client-side e não cobre os downloads do app

**Evidência:** `src/hooks/ui/useScreenProtection.ts:4-11` (estado em
`localStorage['screen-protection-enabled']`, default `true`), `:21-28` (`toggle()` — o próprio
usuário desliga), `:41-104` (bloqueia PrintScreen, Cmd+Shift+3/4/5, Ctrl+P/S, copiar,
clique-direito, arrastar), `:144-152` (`@media print { body { display:none } }` e
`user-select: none`).

**Que dado sai:** com o toggle desligado, Ctrl+P/Ctrl+S/Ctrl+C reabrem no navegador inteiro.
Além disso, a proteção NÃO intercepta os botões "Baixar/Exportar/Copiar" do próprio app (que
chamam `Blob`+anchor ou `navigator.clipboard.writeText` de forma programática).

**Quem pode acionar:** o próprio usuário (não há controle do administrador sobre o toggle).

**Cenário (3 passos):** 1) agente abre Ajustes/Segurança e desliga a proteção de tela;
2) Ctrl+P imprime a conversa inteira (ou Ctrl+S salva a página);
3) nada disso é registrado nem barrado no servidor.

**Viola a regra:** SIM (P2) — a última barreira anti-exportação é um checkbox do próprio
usuário, sem trilha.

**Correção sugerida (NÃO aplicada):** tornar o estado do toggle uma configuração de
perfil/tenant (decisão de dono) e, no mínimo, registrar ligar/desligar; alinhar a lista de
atalhos bloqueados com as teclas realmente usadas para exportar hoje.

**Esforço:** M (+ `worker (sql)` para persistir a flag).

## SEC-SAIDAS_DE_INFORMACAO-08 — P2 — Link rastreável público sem sessão (`talkx-link`)

**Evidência:** `supabase/config.toml:61-66` (`verify_jwt = false` por decisão documentada) e
`supabase/functions/talkx-link/index.ts:1-8` — `GET /talkx-link?s=<slug>&r=<recipient_id>`
registra clique e redireciona (302); `TALKX_LINK_BASE_URL` em `talkx-send/index.ts:404`.

**Que dado sai:** o clique e o identificador do destinatário entram; o redirecionamento leva o
destinatário para fora do sistema com UTM — o link é público por necessidade.

**Quem pode acionar:** qualquer pessoa com o link (sem sessão).

**Cenário (3 passos):** 1) link enviado pelo WhatsApp; 2) qualquer terceiro (ou o próprio
destinatário) abre e o clique é registrado; 3) o `r=<recipient_id>` confirma, para quem tiver o
link, que aquele número recebeu a campanha.

**Viola a regra:** PARCIAL (P2) — o `recipient_id` no link permite correlação de identificador
de destinatário por terceiros.

**Correção sugerida (NÃO aplicada):** assinar/opacizar o `r` (token HMAC curto) em vez de expor o
id; manter o redirecionamento e a contagem de cliques.

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-09 — P3 — Área de transferência com dado de cliente em 20 arquivos (22 chamadas)

**Evidência (todos são chamadas reais a `navigator.clipboard.writeText` em produção; levantamento com
`rg -n 'navigator\.clipboard.*writeText\(' src`, excluindo `__tests__` e as duas linhas de limpeza de `useScreenProtection` — 20 arquivos, 22 linhas/chamadas):**

`src/components/inbox/chat/useChatPanelHandlers.ts:193` (mensagem do cliente),
`src/components/team-chat/useTeamChatPanel.ts:278`, `src/components/inbox/contact-details/Contact360Helpers.tsx:265,272`
(telefone e e-mail), `src/components/inbox/contact-details/sidebar/SidebarRow.tsx:30`,
`src/components/inbox/ai-tools/AIResponseCard.tsx:25`, `src/components/inbox/QuickRepliesManager.tsx:35`,
`src/components/inbox/useObjectionDetector.ts:198`, `src/components/inbox/useConnectionsManager.ts:284`,
`src/components/groups/GroupsView.tsx:243` (id do grupo), `src/components/contacts/ContactDialogs.tsx:157`,
`src/components/email/EmailContactPanel.tsx:88`, `src/components/catalog/SendProductDialog.tsx:319,329`
(mensagem montada e link do produto), `src/components/catalog/CatalogProductCard.tsx:237`,
`src/components/catalog/ProductDetailDialog.tsx:440`, `src/components/monitoring/MonitoringWebhookPanel.tsx:40`,
`src/components/payments/PaymentLinksView.tsx:63`,
`src/components/team-chat/department-management/DepartmentInvitesView.tsx:21`,
`src/components/mfa/MFAEnroll.tsx:34` (seed TOTP), `src/components/mfa/MFABackupCodes.tsx:45`
(códigos de backup), `src/components/talkx/kit/states.tsx:145`.
(`src/hooks/ui/useScreenProtection.ts:44,74` usa a mesma API para LIMPAR a área de transferência —
é a proteção, não uma saída.)

**Que dado sai:** mensagem de cliente, telefone, e-mail, ids internos, seed/segredo TOTP
(`MFAEnroll`), URLs de webhook — tudo vai para a área de transferência do SO, compartilhada entre
aplicativos e sincronizável por clipboard na nuvem.

**Quem pode acionar:** qualquer usuário autenticado, por botão explícito do app.

**Cenário de exploração (3 passos):**
1. Usuário autenticado abre conversa, contato, catálogo, pagamento, MFA ou configuração com botão
   "copiar".
2. O handler chama `navigator.clipboard.writeText(...)` diretamente.
3. O dado fica na área de transferência do sistema operacional e pode ser colado/sincronizado por
   outro aplicativo fora do Zapp.

**Viola a regra:** SIM (P3) — a proteção de tela só intercepta o atalho de teclado (`Ctrl+C`) e o
evento `copy`; o botão do app escreve direto na área de transferência e continua funcionando.

**Correção sugerida (NÃO aplicada):** rotear a cópia por um helper que respeite a mesma política
do download (quando a proteção está ligada, bloquear cópia de conteúdo de conversa e oferecer
"copiar sem formatação"/inline) e limpar a área de transferência no logout.

**Esforço:** M.

## SEC-SAIDAS_DE_INFORMACAO-10 — P3 — Links externos `wa.me`, `mailto:`, `tel:`

**Evidência:** `src/components/contacts/ContactListItem.tsx:100,115`,
`src/components/contacts/ContactCard.tsx:134,147`,
`src/components/inbox/contact-details/sidebar/ProfessionalSection.tsx:44,72` (teste em
`ProfessionalSection.test.tsx:48-100`), `src/components/inbox/InteractiveMessage.tsx:38`
(`window.open('tel:...')`), `src/components/email/EmailRichTextEditor.tsx:62` (prompt de
`mailto:`/`http` no editor) e `src/lib/emailComposeFormat.ts:7-40` (sanitiza `mailto:`).

**Que dado sai:** telefone e e-mail do cliente são entregues ao WhatsApp Web/app de e-mail/
discador do sistema operacional (o dado passa a existir no app de terceiro).

**Quem pode acionar:** usuário autenticado.

**Cenário de exploração (3 passos):**
1. Operador autenticado abre cadastro ou mensagem interativa com telefone/e-mail.
2. Clica em WhatsApp, e-mail ou telefone.
3. O navegador entrega o dado ao WhatsApp Web/app de e-mail/discador externo, fora do controle do
   sistema.

**Viola a regra:** SIM (P3, mas é função do produto: "iniciar conversa por outro canal").

**Correção sugerida (NÃO aplicada):** manter, mas registrar o disparo (trilha de
encaminhamento para fora) e deixar claro na UI que a ação abre um app externo.

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-11 — P3 — `window.print` não é usado, mas a barreira é só CSS

**Evidência:** `rg 'window\.print|navigator\.share'` em `src/` → 0 ocorrências. O único
bloqueio de impressão é a regra CSS injetada em `src/hooks/ui/useScreenProtection.ts:147`
(`@media print { body { display:none !important } }`), injetada só com a proteção ligada e
removida no unmount (`:169`).

**Que dado sai:** com a proteção desligada (ver -07), Ctrl+P imprime qualquer tela.

**Quem pode acionar:** qualquer usuário autenticado em qualquer tela que esteja visível no navegador quando a proteção de tela estiver desligada; não depende de `can_download`.

**Cenário de exploração (3 passos):**
1. Usuário autenticado mantém a proteção de tela desligada (ou encerra o hook ao sair da tela).
2. Abre uma conversa, cadastro, pagamento, catálogo ou painel com dado sensível visível.
3. Usa Ctrl+P/diálogo de impressão do navegador e gera PDF/impressão fora do sistema.

**Viola a regra:** SIM (P3) — mesma raiz do -07; listado separadamente porque é o vetor
"imprimir" citado no escopo do cartão.

**Correção sugerida (NÃO aplicada):** mover o CSS de impressão para uma folha global do app
(não condicionada ao toggle client-side).

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-12 — P3 — Exportações do catálogo sem rastro

**Evidência:** `src/components/catalog/catalogExport.ts:256-281` (export do filtro),
`src/components/catalog/ExternalProductCatalog.tsx:376-379` e
`ExternalProductManagement.tsx:439` (export da seleção),
`ExternalProductManagement.tsx:1236-1237` (botão "Exportar CSV"), `:386` (histórico).

**Que dado sai:** catálogo (nome, marca, preço, estoque) e histórico com contato/agente (-02).

**Quem pode acionar:** usuário autenticado com o módulo Catálogo.

**Cenário de exploração (3 passos):**
1. Usuário com módulo Catálogo aplica filtro ou seleciona produtos/envios.
2. Aciona "Exportar CSV".
3. O arquivo é gravado localmente sem evento de auditoria, sem contagem de linhas e sem motivo da
   exportação.

**Viola a regra:** SIM (P3) — nada registra quem exportou/quantas linhas.

**Correção sugerida (NÃO aplicada):** emitir evento de auditoria (usuário, filtro, nº de linhas,
arquivo) em cada export.

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-13 — P3 — Relatório de diagnóstico TXT/PDF leva infraestrutura para fora

**Evidência:** `src/components/monitoring/MonitoringDiagnosticPanel.tsx:46-63` (TXT) e
`:65-110` (PDF, `doc.save` em `:105`). O conteúdo inclui `x.webhook.url`, `x.instance`,
contagem de eventos e fluxo de mensagens por instância.

**Que dado sai:** URLs de webhook das instâncias, nomes de instância, volumes de mensagens
recebidas/enviadas.

**Quem pode acionar:** usuário autenticado com a tela de monitoramento.

**Cenário de exploração (3 passos):**
1. Usuário abre o painel de diagnóstico/monitoramento.
2. Clica para baixar TXT ou PDF.
3. O arquivo leva URLs, instâncias e volumes para o disco/local de compartilhamento do usuário; se
   a URL de webhook vier com token em runtime, esse token também fica no relatório.

**Viola a regra:** SIM (P3). Se a URL de webhook carregar token/querystring de autorização
(não foi possível confirmar a origem da URL só pelo repositório — o valor vem da Evolution em
runtime), o arquivo baixado passa a ser um vetor de credencial.

**Correção sugerida (NÃO aplicada):** redigir a URL no relatório (mostrar só o host) e registrar
a exportação.

**Esforço:** S.

## SEC-SAIDAS_DE_INFORMACAO-14 — P3 — Link de pagamento copiável apontando para rota interna

**Evidência:** `src/components/payments/PaymentLinksView.tsx:37` monta
`${window.location.origin}/pay/<8 chars de UUID>` e `:61-72` copia para a área de transferência
(`copyLink`).

**Que dado sai:** título, valor, forma de pagamento e o link gerado para o cliente.

**Quem pode acionar:** usuário autenticado que alcance a tela de pagamentos.

**Cenário de exploração (3 passos):**
1. Usuário cria um link de pagamento no painel.
2. Clica para copiar o link `/pay/<id>`.
3. O link com contexto comercial vai para a área de transferência e pode ser enviado para fora;
   além disso, o próprio alerta da tela informa que o checkout ainda não processa cobranças reais.

**Viola a regra:** SIM (P3). Não foi encontrada rota `/pay/:id` no roteador
(`src/pages/ViewRouter.tsx`), ou seja, o link divulgado pode nem resolver — risco de dado
comercial circulando por link frágil.

**Correção sugerida (NÃO aplicada):** gerar o link por token assinado com expiração e confirmar
que a rota pública existe antes de permitir copiar; registrar a cópia.

**Esforço:** M.

## SEC-SAIDAS_DE_INFORMACAO-15 — P2 — Leitura ampla de dados para `authenticated` (contexto de saída)

**Evidência (amostra do repositório, policies vigentes para `authenticated USING (true)`):**
`supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql:57-159`
(`conversation_tasks`, `conversation_closures`, `conversation_memory`, `playbooks`,
`number_reputation`), `20260317214556_*:81-86` (`followup_*`, `whisper_messages`,
`queue_positions`, `ai_conversation_tags`), `20260315114854_*:22-91`,
`20260909130000_talkx_template_versions_custom_variables.sql:36`.

**Que dado sai:** qualquer usuário autenticado pode LER essas tabelas inteiras (inclusive
`conversation_memory` e `whisper_messages`), e a partir daí exportar/copiar pelos caminhos
acima. É a fonte que alimenta as saídas.

**Quem pode acionar:** qualquer usuário autenticado, se a policy `USING (true)` estiver vigente
para a tabela citada.

**Cenário de exploração (3 passos):**
1. Usuário autenticado consulta uma tabela com policy `authenticated USING (true)`.
2. Lê conversas/memórias/whispers/playbooks além do que deveria pelo vínculo operacional.
3. Usa os caminhos de saída mapeados (-01/-09/-12) para copiar/exportar o conteúdo.

**Viola a regra:** SIM (P2) — a regra "nenhuma informação sai" depende de quem pode ler.

**Observação de fronteira:** policy RLS que decide QUEM vê é do `worker (sql)`; registro aqui
porque é o insumo das saídas. A correção abaixo é sugestão de relatório, não aplicada.

**Correção sugerida (SQL/código, NÃO aplicada):** substituir `USING (true)` por policies que
amarrem a linha ao vínculo operacional do usuário (exemplo de texto):
`USING (EXISTS (SELECT 1 FROM conversation_participants cp JOIN profiles p ON p.id = cp.profile_id WHERE p.user_id = auth.uid() AND cp.conversation_id = <tabela>.conversation_id))`.
Para tabelas sem `conversation_id`, criar matriz explícita por `tenant_id`/departamento/papel e
negar por padrão quando o vínculo não existir.

**Esforço:** L (revisão de matriz RLS).

---

# Lista completa dos pontos de saída inventariados (cobertura)

## A. Gravação em disco (Blob/anchor download, jsPDF)

| # | arquivo:linha | dado | quem | gate `can_download`? | P |
|---|---|---|---|---|---|
| A1 | `catalogExport.ts:222-234` (via `:256-281`, `ExternalProductCatalog.tsx:376-379`, `ExternalProductManagement.tsx:439`) | catálogo/produtos | usuário autenticado c/ módulo | NÃO | P0 (-01: gate obrigatório ausente) + P3 (-12) |
| A2 | `useCatalogSendHistory.ts:173-190` → `ExternalProductManagement.tsx:386` | contato + agente | idem | NÃO | **P0 (-01: gate obrigatório ausente; -02: dado pessoal)** |
| A3 | `sendProductUtils.ts:168-186` → `SendProductDialog.tsx:334-351` | fotos (imagens de produto) | idem | NÃO | P0 (-01: gate obrigatório ausente) |
| A4 | `useGmail.ts:344-360` | anexo de e-mail do cliente | usuário com Gmail | NÃO | P0 (-01: gate obrigatório ausente) |
| A5 | `MFABackupCodes.tsx:51-72` | códigos de backup MFA | o próprio dono | NÃO (exceção aceitável se declarada) | exceção a documentar (-01), fora de URGENTE |
| A6 | `MonitoringDiagnosticPanel.tsx:46-63` (TXT) e `:65-110` (PDF) | infraestrutura/webhook | usuário c/ monitoramento | NÃO | P0 (-01: gate obrigatório ausente) + P3 (-13) |
| A7 | `TeamPerformancePanel.tsx:22-32` | métricas de equipe | membro do time-chat | NÃO | P0 (-01: gate obrigatório ausente) |
| A8 | `MediaPreview.tsx:55-65` | documento recebido | qualquer autenticado | **SIM** (`:37,45-51`) | ok |
| A9 | `ImagePreview.tsx:40-47` | imagem recebida | qualquer autenticado | **SIM** (`:22,33-38`) | ok |
| A10 | `MessageBubble.tsx:244-267` | figurinha do cliente → bucket público | agente da conversa | NÃO | **P0 (-01: gate obrigatório ausente; -03: bucket público)** |

## B. Área de transferência (clipboard) — 20 arquivos / 22 chamadas em produção, ver -09

`useChatPanelHandlers.ts:193`, `useTeamChatPanel.ts:278`, `Contact360Helpers.tsx:265,272`,
`SidebarRow.tsx:30`, `AIResponseCard.tsx:25`, `QuickRepliesManager.tsx:35`,
`useObjectionDetector.ts:198`, `useConnectionsManager.ts:284`, `GroupsView.tsx:243`,
`ContactDialogs.tsx:157`, `EmailContactPanel.tsx:88`, `SendProductDialog.tsx:319,329`,
`CatalogProductCard.tsx:237`, `ProductDetailDialog.tsx:440`, `MonitoringWebhookPanel.tsx:40`,
`PaymentLinksView.tsx:63`, `DepartmentInvitesView.tsx:21`, `MFAEnroll.tsx:34`,
`MFABackupCodes.tsx:45`, `talkx/kit/states.tsx:145`.

## C. Impressão / captura

| # | arquivo:linha | situação | P |
|---|---|---|---|
| C1 | `useScreenProtection.ts:147` | único bloqueio de impressão (CSS condicionado ao toggle) | P3 (-11) |
| C2 | `useScreenProtection.ts:41-95` | PrintScreen/atalhos bloquearam só com proteção ligada | P2 (-07) |
| C3 | `window.print`, `navigator.share` | **0 ocorrências no código** | ok |

## D. Canais externos (navegador → app de terceiro)

| # | arquivo:linha | dado | P |
|---|---|---|---|
| D1 | `ContactListItem.tsx:100,115` | telefone (`wa.me`), e-mail (`mailto:`) | P3 (-10) |
| D2 | `ContactCard.tsx:134,147` | idem | P3 (-10) |
| D3 | `ProfessionalSection.tsx:44,72` | idem | P3 (-10) |
| D4 | `InteractiveMessage.tsx:38` | `tel:` (botão de mensagem interativa) | P3 (-10) |
| D5 | `EmailRichTextEditor.tsx:62` | `mailto:`/`http` digitado pelo agente | P3 (-10) |

## E. Links públicos / assinados

| # | arquivo:linha | tipo | P |
|---|---|---|---|
| E1 | buckets `audio-memes`, `avatars`, `custom-emojis`, `stickers` (`20260511233306...sql:4-17`) | **público permanente** | P2 (-04) / P0 (-03) |
| E2 | `useResolvedStorageUrl.ts:87`, `useAudioPlayer.ts:118`, `useContactMedia.ts:174`, `_shared/evolution-api-proxy.ts:310`, `multiplix-voices/index.ts:199` | URL assinada com TTL (3600s / 300s) — correto | ok |
| E3 | `talkx-link/index.ts:1-8` + `config.toml:61-66` | redirect público com `recipient_id` | P2 (-08) |
| E4 | `public-api/index.ts:3-8` + `config.toml:35-36` | kill switch 410 | ok |

## F. Integrações de saída (webhooks/edge/banco/e-mail) — ver -06

`evolution-api`, `evolution-sync`, `evolution-webhook` (entrada), `multiplix-*`, `talkx-send`,
`gmail-*`, `send-email`, `send-scheduled-report`, `sentiment-alert`, `searchbox-budget-alert`,
`send-rate-limit-alert`, `bitrix-api`, `sync-call-records`, `elevenlabs-*`, `get-mapbox-token`,
`ai-proxy`/`ai-*`, `crm-integration`, `promogifts-catalog`, `external-db-proxy`,
`external-db-bridge`, `migrate-media-storage`, `fetch-link-preview` (via proxy de egress),
e o trigger `notify_sicoob_on_reply` (`20260827150000_...sql:32-45`).

---

# Verificado e SEM problema (prova de cobertura)

1. **Exportação LGPD bloqueada** — `src/components/compliance/LGPDComplianceView.tsx:100-115`:
   card "Portabilidade de Dados — Bloqueada" e botão `disabled`. O caminho existe e NEGA.
2. **`window.print` não é usado** — 0 ocorrências em `src/`; a impressão só é possível com a
   proteção de tela desligada (achado -11).
3. **`navigator.share` (Share API) não é usado** — 0 ocorrências em `src/`.
4. **`document.execCommand` (cópia legada) não é usado** — 0 ocorrências em `src/` (conferido com
   `rg -c 'document\.execCommand' src`).
4b. **`showSaveFilePicker` (File System Access API) não é usado** — 0 ocorrências em `src/`
   (conferido com `rg -c 'showSaveFilePicker' src`); não existe segundo canal de gravação em
   disco além do Blob+anchor mapeado na seção A.
5. **Buckets de conversa privados** — `whatsapp-media`, `audio-messages`, `team-chat-files`
   fechados em `20260905030000_private_media_buckets.sql:11`; leitura server-side por policy
   estreita em `20261003142707_whatsapp_media_recebida_select_via_messages.sql:28-50` (só o
   caminho exato citado por uma mensagem que o chamador já enxerga; `right()`/`position()`, nunca
   `LIKE`).
6. **Mídia sensível consumida por URL assinada** — `useResolvedStorageUrl.ts:87` com TTL e
   `createSignedUrls` em lote (`useContactMedia.ts:174`); falha de assinatura degrada sem expor.
7. **`public-api` é kill switch** — responde 410 sem tocar banco/credencial
   (`supabase/functions/public-api/index.ts:3-8`).
8. **Conversão do `talkx-link` exige HMAC** — `talkx-link/index.ts:16-62` (v1 com timestamp +
   external_ref; aceite legado com data-limite).
9. **`send-email` endurecido** — `send-email/index.ts:5-19,70-100`: identidade antes do payload,
   papel `admin/supervisor`, schema `.strict()`, remetente/assunto/corpo fixos no servidor.
10. **Bridge de banco externo com allowlist read-only** — `external-db-bridge/index.ts:8-28`
    (tabelas `select` + RPCs nomeadas; nada de insert/update/delete).
11. **Egress de mídia por payload de webhook com allowlist** — `_shared/media-egress.ts:1-25`:
    destino validado em cada redirect, `redirect: "manual"`, teto de bytes, IP literal e
    credencial embutida rejeitados.
12. **Preview de link por proxy assinado (sem SSRF/rebinding)** — `_shared/secure-egress.ts:1-8`
    e `:95-140` (HMAC, segredo ≥ 32, teto de 512 KB).
13. **Portão de rota nega por padrão** — `src/pages/ViewRouter.tsx:132-142`: esconde do menu não
    basta; `?view=` digitado à mão cai em `RestrictedView` até papéis/permissões carregarem.
14. **URLs assinadas dos buckets privados de mídia de conversa** — `whatsapp-media` e
    `audio-messages` são privados e o consumo pelo app passa por URL assinada; isso NÃO inclui o
    bucket público `stickers`, que permanece como achado -03/-04.
15. **`useDownloadPermission` nega por padrão** — `useDownloadPermission.ts:11,17-18`: sem
    sessão ou com erro de leitura, devolve `false` (fail-closed).

---

# Ordem de correção sugerida (para o dono decidir; NADA aplicado)

1. **-02** e **-03** (P0, esforço S/M): fecham dois vazamentos concretos de dado de cliente com
   mudança pequena.
2. **-01** (P0, M): a correção de raiz — uma única porta de gravação em disco.
3. **-04** e **-05** (P2): buckets públicos e credencial SIP (esta precisa de decisão do dono).
4. **-07/-09/-11** (P2/P3): coerência da proteção client-side (toggle, clipboard, impressão).
5. **-06/-13/-14/-08** (P2/P3): trilha de auditoria e token em vez de id em link.
6. **-15**: abrir cartão para `worker (sql)` (matriz de RLS).

# Limites desta auditoria

- Somente leitura; nada foi executado contra banco ou produção (regra do cartão e R1).
- O conteúdo de runtime (URL real de webhook, conteúdo de bucket, registros de `pg_cron`) não foi
  consultado; quando a conclusão depende disso, está marcado como "verificar" no achado.
- Policies citadas são as do repositório em `dia/2026-10-07`; a matriz RLS completa é do
  `worker (sql)` (achado -15).
- Nenhum segredo, token, telefone ou nome real aparece neste documento.
