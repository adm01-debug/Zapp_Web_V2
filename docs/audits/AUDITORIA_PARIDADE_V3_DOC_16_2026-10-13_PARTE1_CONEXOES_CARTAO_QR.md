# Achados 1: Conexões (lista, cartão, QR e saúde): V3 -> V2 (13/10/2026)

Somente leitura. V3 = `origin/main` de `~/projetos/Zapp_Web_V3`; V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador` (cópia sem cartões `done` não integrados: **checar cartões irmãos** antes de abrir qualquer um dos itens abaixo). Banco real não verificado.

Fato de contexto: a V2 roda sobre **Evolution GO** (token por instância no Vault, `EVOLUTION_API_FLAVOR`), a V3 sobre Evolution API v2 (Node). Muita coisa da V3 (restart + sleep 4 s, ghost detector, `fetchInstances`, `ownerJid`, `evolution_messages`) é específica do provedor antigo e NÃO deve ser copiada literalmente.

Correções do doc 16 / BRIEF:
- **A2 está errado**: `AddConnectionDialog` NÃO é órfão. É renderizado em `ConnectionsView.tsx:233` (botão "Nova conexão" do cabeçalho). Na V3 dá para CRIAR conexão (nome, telefone validado `validatePhoneDetailed`, método evolution/official, erro inline).
- Órfãos de verdade na V3 (código morto, NÃO é lacuna): `ConnectionsStats.tsx` (a view reimplementa os 3 cartões inline), `QrCodeDialog.tsx` (a view tem o diálogo de QR inline, com pairing code), `useConnectionManagement` só é usado pelo `useConnectionQueues`.
- A11 (sleep 4 s): na V2 não existe o fluxo restart->healthcheck->QR (nem botão "Reconectar" no cartão). O `restartInstance` existe em `useEvolutionInstance.ts:29` mas nenhum componente o chama. A V2 tem o `EvolutionDisconnectBanner` (`handleReconnect` -> `connect`, mostra o motivo da edge). O fluxo é do cartão RC3 (t_ce00ee34); não recomendo copiar o sleep fixo (usar o estado devolvido pela própria edge).
- A12 (duas libs de toast): **existe na V2 também** e gera toast duplicado (ver L6).
- A1/A3..A10, A13..A16: fora do meu recorte (dashboard/Official API).

## 1. Tabela de comportamentos

| Item | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|
| Criar conexão (diálogo, nome, telefone, método) | MELHOR_NA_V2 no servidor; LACUNA parcial na validação | `AddConnectionDialog.tsx`; `useConnectionsActions.ts:50-150` (cria na Evolution antes do INSERT, fantasma se falhar) | `evolution-api/index.ts:302-484` `create-connection` atômico (reserva a linha, cria na GO, token no Vault, compensa); trava `multi_connection_enabled` em `ConnectionsView.tsx:44-60` + teste `trava-multiconexao` | trava = DECISAO (plano multi-conexão E42). Validação de telefone: L3 (sem cartão) |
| Validação de telefone BR + normalização | LACUNA | `useConnectionsActions.ts:67-81` `validatePhoneDetailed` (F6-29: telefone vazio/inválido duplicava no AutoSync) | V2 só exige não vazio (`useConnectionsManager.ts:~166`; edge `:318`); placeholder livre "+55 11 99999-0000"; grep `validatePhone` só em contatos | nenhum (L3) |
| Erro inline no diálogo de nova conexão (`role=alert`) | LACUNA (P2) | `AddConnectionDialog.tsx` prop `error`, `data-testid=add-connection-error` | só toast; diálogo sem erro persistente | nenhum (L3) |
| Método "API Oficial" na criação | DECISAO | `AddConnectionDialog` Select | V2 sem Cloud API | CA1 (não oferecer sem executor) |
| Lista, busca por nome/ID, filtro por status | LACUNA | `ConnectionsView.tsx:445-500` | `ConnectionsView.tsx:134-167` sem busca nem filtro | CN1 t_07324720 (todo) |
| Deep link `?qr=<instance_id>` abre o QR | LACUNA | `ConnectionsView.tsx:178-195` | nenhum | CN1 |
| Cartões de estatística (subtexto, plural, "Ações necessárias") | LACUNA (P2) | `ConnectionsStats.tsx` / view inline | `ConnectionsView.tsx:135-146` sem subtexto | PD-26 |
| Estado vazio com chamada para criar | EQUIVALENTE | `EmptyState` "Conecte seu WhatsApp" | `EmptyState` com trava explicada | n/a |
| Cartão: layout responsivo, `truncate`, `min-w-0` | LACUNA | `ConnectionCard.tsx:105-125` | `ConnectionCard.tsx:88-101` (sem `min-w-0`/`truncate`), mostra `instance_id` cru | PD-26 |
| Cartão: ícone/borda por severidade (verde/vermelho), pulso online, "Atualizado há X", ms | LACUNA (P2) | `ConnectionCard.tsx:80-200`, `connectionCardHelpers.ts:getLastActivity` | V2 mostra health_status/ms (t_b41eed0b) mas sem "Atualizado há" | PD-26 parcial |
| Motivo da saúde (`HEALTH_REASON_LABEL`: sessão fantasma, silenciosa, inativa, socket fechado, erro de API, timeout, auth, rate limit) + faixa explicativa | LACUNA | `connectionCardHelpers.ts:41-85`; `ConnectionCard.tsx:325-355` | V2 não tem coluna `health_reason` (grep em migrations: 0) | RC1 t_a77a5aad (done), RC2 t_44c5a12d, RC3 t_ce00ee34 |
| Estado "Desconectando..." (pulso) e toast "Aguarde" no Reconectar | LACUNA | `connectionCardHelpers.ts:21-26`; `useConnectionsManager.ts:337-340` (otimista) | V2 não tem estado `disconnecting` | PD-26 |
| Rótulo "Retry x/y" em inglês | LACUNA (P2) | "Tentativa x/y" | `ConnectionCard.tsx:~97` "Retry" | PD-26 |
| Bateria, Principal/Padrão, horário de atendimento | EQUIVALENTE | idem | idem | n/a |
| Menu do cartão agrupado (Conexão/Configuração/Avançado), "Verificar agora", "Copiar ID", auditoria, sincronizar | EQUIVALENTE (menos "Verificar agora") | `ConnectionCardMenu.tsx` | `ConnectionCard.tsx:154-180`; "Auditoria" só admin | "Verificar agora": RC3/CN1 |
| Excluir conexão | MELHOR_NA_V2 | V3 desabilitada ("Excluir indisponível", `ConnectionCardMenu.tsx:200-225`) e `handleDelete` com `delete_pending` em `settings` sem consumidor | `ConnectionDeleteDialog.tsx` (digitar o nome, só admin), `handleDelete` ordem GO->banco (TRA-005), edge `delete-instance` exige admin | CX0 t_a369905d (done) |
| Confirmar Desconectar (nome + telefone mascarado) | MELHOR_NA_V2 na máscara; LACUNA no estado de espera | `ConnectionDisconnectDialog.tsx` mantém spinner "Desconectando..." até terminar | V2 mascara o telefone (`ConnectionDisconnectDialog.tsx:12-17`) mas fecha na hora | CX0 (done); espera: PD-26 |
| Desconectar: auditoria (`fn_safe_audit_log`) | LACUNA no escrever | `useConnectionsManager.ts:340-363` grava antes de agir, sem bloquear | V2 `handleDisconnect` (`:262-269`) não grava nada; `logAudit` nunca é chamado por conexões (`src/lib/audit.ts:13` só tipa `connection_created/deleted`). **O `ConnectionAuditDialog` (CA2) lê `details.instance_id` que ninguém escreve: tela vazia.** | CX0b t_799ee332 (done) / t_82d057ab (refazer 1, ready) cobre criar/conectar/desconectar/trocar padrão. Conferir se integrou |
| Desconectar: toast de sucesso | EQUIVALENTE (PD-26 está impreciso) | toast "Sessão encerrada" | `withToast` (`useEvolutionInstance.ts:32`) já mostra "Instância desconectada" (sonner) | PD-26 afirma que não tem: corrigir o texto do cartão |
| Desconectar: fluxo guiado (abre o QR 500 ms depois) | DECISAO (opcional) | `useConnectionsManager.ts:395-401` | V2 não abre | nenhum; melhoria opcional |
| Definir padrão atômico | MELHOR_NA_V2 | V3 faz 2 updates não atômicos (`useConnectionsActions.ts:157-170`) | RPC `set_default_whatsapp_connection` | t_ae0a55a6 |
| Diálogo de QR: loading/pending/connected/error | EQUIVALENTE | `ConnectionsView.tsx:256-480` | `ConnectionsView.tsx:98-130` | n/a |
| QR: passos "Etapa 1 de 3 / 2 de 3", instruções, "Mantenha o celular próximo" | LACUNA (P2) | `ConnectionsView.tsx:279-296,360-380` | V2 só 5 passos | QH3 (parcial) |
| QR: contagem regressiva + selo de TTL (`QrCountdown`, `QrTtlBadge`, `detectQrTtlMs`) | LACUNA | `QrCountdown.tsx`, `QrTtlBadge.tsx`; `expiresAt` em `useConnectionsManager.ts:63-80` | nenhum. Só a rede de segurança de 30 s em loading (`useConnectionsManager.ts:84-93`) | QH3 t_19664ad4 (todo). O selo de "origem do TTL" é diagnóstico de dev: não precisa |
| QR: histórico de tentativas (`qr_attempts`, `QrAttemptHistory`) | LACUNA | `useQrAttemptHistory.ts`, `QrAttemptHistory.tsx`, tabela `qr_attempts` (RLS) | grep `qr_attempts` em migrations/src/functions: 0 | QH1 t_7af815d8 (done), QH2 t_9d1dd853, QH3 |
| Pairing code (código de emparelhamento) | LACUNA | `handleRequestPairingCode` (`useConnectionsManager.ts:157-228`), UI `ConnectionsView.tsx:305-345` | edge v2-flavor já devolve `pairingCode` no corpo (`evolution-api/index.ts:510-516`); GO: não sei; UI sem | PC1 t_6f3fc89b (done), t_0c136c28, PC2 t_c00bddba (todo) |
| Botão "Gerar novo QR": cooldown 5 s, guarda in-flight, estabilização 400 ms, tooltip do motivo | LACUNA | `RefreshQrButton.tsx` | `ConnectionsView.tsx:122-124` `disabled={evolutionLoading && status!=='error'}`: em `error` clica-se sem trava e cada clique chama `connect` na GO | nenhum (L4) |
| Diagnóstico técnico (payload mascarado) no diálogo | DECISAO (não portar) | `ConnectionsView.tsx:84-110,440-480` | V2 mostra só `errorMessage`; diagnóstico fica em ConnectionHealthPanel | PJ-10/PJ-11 |
| Corrida de QR (fechar/abrir outra conexão) | MELHOR_NA_V2 | V3 usa `dialogGenRef`/`refreshInFlightRef` | `qrSessionRef` por geração + polling com identidade (R2-API-039) + testes `qrIdentity` | n/a |
| Conexão confirmada: polling `status` 3 s + realtime | EQUIVALENTE | realtime + `announceConnected` | polling 3 s + realtime; toast "Conectado!" | n/a |
| Persistência do diálogo de QR no `sessionStorage` | DECISAO | `useConnectionsManager.ts:297-310` | não | "QR guardado no navegador" fora de escopo (BRIEF) |
| Reconectar do cartão (restart -> healthcheck -> QR) | LACUNA | `useConnectionCardActions.ts:21-60` | só o banner global | RC3 t_ce00ee34 |
| Auto-reconnect (`useEvolutionAutoReconnect`, 580 linhas, no navegador de cada aba) | DECISAO / MELHOR_NA_V2 planejado | hook roda em toda aba aberta (corrida, N operadores reconectando a mesma instância; Meta pode bloquear) | plano é no servidor (edge de saúde, janela de manutenção já bloqueia `connect/restart/disconnect` em `evolution-api/index.ts:195`) | RC1/RC2 |
| Auto-sync de instâncias da Evolution para `whatsapp_connections` (`useEvolutionAutoSync`) | DECISAO (não portar) | cria linhas a partir de `listInstances` em toda abertura da tela, pelo navegador | V2 cria só via `create-connection`; instância sem linha é órfã conhecida | nenhum. Não recomendo: no GO o token por instância não existe sem Vault |
| Ações rápidas de conexão degradada (`DegradedQuickActions`) | LACUNA | `DegradedQuickActions.tsx` | nenhum; V2 tem `ConnectionHealthPanel` em diagnósticos e store global `useConnectionsHealth` | CN1 |
| `connection-health-check`: segurança (cron secret, papel, rate limit por usuário) | MELHOR_NA_V2 | V3: `CRON_SECRET` simples, limite 20/min | V2: segredo do Vault por RPC, `timingSafeEqual`, 6/min por usuário, CAS no update, `no_credentials`, token por instância, alerta por e-mail aos admins, teste Deno com 13 casos | N-162 etc. |
| Health-check: alvo por instância (`{instanceName}`) | LACUNA | `index.ts` V3 `onlyInstance` + `instanceOrFilter` | V2 `connection-health-check/index.ts` ignora o corpo: sempre varre TODAS as conexões em série (timeout 10 s cada) | RC2/RC3/CN1 mencionam "Verificar agora" mas nenhum cita o parâmetro na edge (L1) |
| Health-check: 3 camadas (socket, identidade `ownerJid`, atividade), `health_reason`, `degraded_at` | LACUNA parcial | `evaluateHealth` + testes | V2: 1 camada + E25 (GO logada sem socket = degraded). Sem identidade nem atividade | RC1/RC2 (health_reason e "fantasma") |
| Health-check: detector de instância fantasma | DECISAO | específico do UUID/nome da Evolution v2 (incidente wpp2) | GO resolve por token | nenhum; não portar |
| Health-check: auditoria das mudanças de status (`audit_logs`) | LACUNA (P2) | `persistResult` grava `connection_status_change/health_change` | V2 só grava `connection_health_logs` | CX0b só cobre ações manuais (L5) |
| Health-check: alerta "degradada" + notificação in-app aos que optaram | LACUNA | `connection_alert_preferences`, `app_notifications` | V2 só alerta queda (connected->disconnected), warroom + e-mail | `connection_alert_preferences`: paridade-docs/cards_14_15.py (t_c2349019) |
| `evolution-sync`: rate limit, regex de `instanceName`, limites de `page/offset/messagesPerContact`, contrato 422 | LACUNA | `evolution-sync/index.ts:47-90` (10/min, `^[a-zA-Z0-9_-]{1,64}$`, clamps) | V2 `evolution-sync/index.ts`: sem limite, `instanceName` entra cru no path (`evolution-sync-actions.ts:34,112,175,217`), `messagesPerContact` sem teto, `sync-contacts` cria linha `status:'connected', phone:''` para qualquer nome (`:58-60,261`) | nenhum (L2) |
| `evolution-sync` por instância (token da conexão) | LACUNA latente | n/a | `fetchEvolutionContacts` e `setupWebhook` chamam `evoFetch` sem `instanceToken`: fora da instância padrão devolve 400 "instance token ausente" (fail-closed, bom) | multi-conexão (E20/E21), fora de uso enquanto `multi_connection_enabled=false` (L2b) |
| Sincronizar histórico: honestidade | EQUIVALENTE | toasts | `goHistoryNotSupported` no GO; UI t_b41eed0b | t_b41eed0b (done) |
| Store global de saúde + banner de queda | MELHOR_NA_V2 | V3 só o cartão | `useConnectionsHealth.ts`, `EvolutionDisconnectBanner` com motivo da edge | n/a |
| `ConnectionsIntegrationsHub` (abas Conexões/Integrações/Ponte Supabase dev) | DECISAO | `ConnectionsIntegrationsHub.tsx` | V2: `connections` e `integrations` são rotas separadas (`ViewRouter.tsx:51,64`); ponte = bypass dev | "bypass dev" fora de escopo |
| `IdempotencyMissBanner` na tela | fora do recorte | n/a | n/a | PJ-17 |
| Testes da pasta (AddConnectionDialog, CardMenu, Stats) | LACUNA parcial | 3 testes + `useEvolutionApi.test`, `AutoReconnect.exhaustion`, `evaluateHealth.test` | V2 tem 8 testes de componentes + `qrIdentity/tra005/setDefault` + 13 Deno do health-check; falta teste de `handleDisconnect`, `handleAddConnection`, polling->connected, rede de 30 s e do handler `evolution-sync/index.ts` | nenhum (L7) |

## 2. Lacunas reais SEM cartão (priorizadas)

### P1

**L1. `connection-health-check` aceitar alvo por instância e não varrer em série** (perfil: edgar)
- V3: `connection-health-check/index.ts` aceita `POST {instanceName}` e filtra a consulta (`instanceOrFilter`); `useConnectionCardActions.handleRecheckNow` e `DegradedQuickActions.handleRevalidate` usam isso.
- V2: `connection-health-check/index.ts` não lê o corpo (grep `instanceName` na pasta: 0) e faz `for (const conn of connections)` sequencial, cada uma com timeout de 10 s e 2 escritas. Com N conexões, um clique em "Verificar agora" (previsto no RC3/CN1) custa até N x 10 s, consome 1 dos 6 pedidos/min do usuário e grava logs de todas.
- Implementar: corpo opcional `{ instanceName?: string, connectionId?: string }` validado (regex, sem `.or()` com string livre: usar `.eq`), mesma autorização/limite; sem alvo = comportamento atual do cron; sondar em paralelo limitado (3) quando for varredura; teste Deno para alvo único, alvo inexistente (404 claro) e varredura. Deve entrar junto ou antes do RC2 (t_44c5a12d), que é quem mexe no mesmo arquivo: **checar cartão irmão e encadear como pai de RC3 e CN1**.
- Arquivos: `supabase/functions/connection-health-check/index.ts`, `index.test.ts`.

**L2. `evolution-sync`: validar entrada e limitar** (perfil: edgar)
- V3: limite 10/min por usuário, regex `^[a-zA-Z0-9_-]{1,64}$` para `instanceName`, `page` 1..10000, `offset` 1..1000, `messagesPerContact` 1..1000, erro 422 de contrato.
- V2: `evolution-sync/index.ts` só confere admin/supervisor. `instanceName` (qualquer string) entra no path enviado à Evolution com a chave global (`evolution-sync-actions.ts:34,112,175,217,295`); `messagesPerContact` sem teto (`syncAllMessages` até 500 contatos x N mensagens); sem rate limit; `sync-contacts` e `full-sync` **criam** uma linha `whatsapp_connections` com `status:'connected'`, `phone_number:''` para qualquer `instanceName` desconhecido (`:56-60`, `:258-262`), que depois aparece como conexão "Conectada" fantasma na lista e no banner.
- Implementar: regex + clamps + `checkRateLimit` (como a V3); trocar o INSERT automático por erro 404 "conexão não cadastrada" (ou exigir que exista); `encodeURIComponent` no path; testes Deno do handler (hoje só `evolution-sync-actions.test.ts`).
- Arquivos: `supabase/functions/evolution-sync/index.ts`, `supabase/functions/_shared/evolution-sync-actions.ts` (e teste).
- L2b (P2, depende do plano multi-conexão): passar `instanceToken` (`get_instance_token`) ao `evoFetch` para sincronizar conexões não padrão.

### P2

**L3. Nova conexão: validar telefone e mostrar erro dentro do diálogo** (perfis: hugo para validação, iris para o diálogo; edgar para o servidor)
- V3: `validatePhoneDetailed`, `PhoneInput`, `addConnectionError` (limpa ao fechar), nome obrigatório com alerta `role=alert`. V2: só checa vazio (`useConnectionsManager.ts` `handleAddConnection`, edge `:318-322`), placeholder livre; `phone_number` alimenta casamento por número em webhook/sync.
- Implementar: usar o normalizador de telefone existente da V2 (conferir `useContactFormValidation.ts`, `src/lib/phone*`), rejeitar inválido no front e na edge `create-connection`; erro inline persistente; teste. Hoje o botão está travado por `multi_connection_enabled`, então é de baixo risco imediato, mas precisa estar pronto antes de ligar a chave.
- Arquivos: `src/components/connections/ConnectionsView.tsx` (ou extrair `AddConnectionDialog.tsx`), `src/hooks/inbox/useConnectionsManager.ts`, `supabase/functions/evolution-api/index.ts` (bloco `create-connection`).

**L4. "Gerar novo código": trava anti-clique repetido** (perfil: iris, com hugo no hook)
- V3: `RefreshQrButton` (cooldown 5 s, bloqueia durante loading/connected, 400 ms de estabilização, tooltip com o motivo, log do clique ignorado).
- V2: o botão só desabilita enquanto `evolutionLoading && status !== 'error'`; no estado `error` pode-se clicar em sequência, e cada clique chama `connect` (reafirma webhook e pode recriar sessão órfã na GO, `evolution-api/index.ts:~540-715`), o tipo de laço que a janela de manutenção tenta evitar. `handleRefreshQrCode` não tem guarda de "já em voo" (a geração só descarta a resposta antiga, a chamada ao provedor acontece).
- Implementar: guarda `refreshInFlightRef` + cooldown de 5 s no hook, estado "Aguarde Ns", `aria-live`; testes. Combinar com o QH3 (mesmo diálogo): **o QH3 deve ser pai**.
- Arquivos: `src/hooks/inbox/useConnectionsManager.ts`, `src/components/connections/ConnectionsView.tsx` (ou componente novo `RefreshQrButton.tsx`), `__tests__`.

**L5. Auditar as mudanças de status feitas pela verificação automática** (perfil: edgar)
- V3 `persistResult` grava `audit_logs` (`connection_status_change`, `connection_health_change`, com `details.instance_id`, anterior/novo, motivo). V2 só grava `connection_health_logs`; a tela de auditoria (CA2) e o CX0b mostram apenas ações manuais, então "caiu às 03:12" não aparece.
- Implementar: no ramo `updated?.length` do health-check, inserir em `audit_logs` `connection_disconnected`/`connection_connected` com `details:{instance_id, source:'health_check', previous, new}`, sem telefone; rótulo em `connectionAuditActionLabel`. Depende do CX0b (t_799ee332/t_82d057ab) e do L1 (mesmo arquivo).
- Arquivos: `supabase/functions/connection-health-check/index.ts`, `src/hooks/inbox/useConnectionAuditLogs.ts` (rótulos).

**L6. Toast duplicado e mistura de bibliotecas nas ações de conexão (A12 confirmado na V2)** (perfil: hugo)
- `useEvolutionApiCore.withToast` usa `sonner` (`toast.error(msg)` + relança); `useConnectionsManager.handleDisconnect` captura e dispara `toast` do `use-toast` de novo (`:262-269`): duas notificações de erro, de bibliotecas diferentes. `ConnectionsView`/`ConnectionCard` usam `@/hooks/ui/use-toast`. Também o `catch` não relança, então o `AlertDialogAction` do diálogo de desconectar fecha como se tivesse dado certo.
- Implementar: um único canal de toast na tela de conexões (escolher o padrão da V2), `handleDisconnect` usa `callApi` (sem toast) e decide a mensagem; relançar para o diálogo manter o spinner/erro (junto do PD-26). **Corrigir o texto do PD-26**: ele diz que `handleDisconnect` não tem toast de sucesso, mas `withToast` já mostra "Instância desconectada".
- Arquivos: `src/hooks/inbox/useConnectionsManager.ts`, `src/hooks/evolution/useEvolutionInstance.ts`.

**L7. Testes que faltam** (perfil: workertestes)
- `useConnectionsManager`: `handleDisconnect` (sucesso, erro, sem `instance_id`), `handleAddConnection` (campos vazios, falha da edge, sucesso abre o QR), polling 3 s -> "connected", rede de segurança de 30 s em loading, `handleRefreshQrCode` em estado `error`.
- `ConnectionsView`: estados do diálogo de QR (loading/pending/connected/error), busca/filtro quando o CN1 entrar.
- Deno: handler de `evolution-sync/index.ts` (autorização 401/403, ação desconhecida, `instanceName` ausente).
- Arquivos: `src/hooks/inbox/__tests__/`, `src/components/connections/__tests__/`, `supabase/functions/evolution-sync/`.

### Melhorias opcionais (sem cartão, sem urgência)
- Depois de desconectar, abrir o diálogo de QR sozinho (fluxo guiado da V3, `useConnectionsManager.ts:395-401`): colocar no PD-26 como decisão do dono.
- Passos "Etapa x de 3" e texto "Mantenha o celular próximo" no diálogo de QR (acabamento do QH3).
- Acessibilidade: o diálogo de QR da V2 não tem `aria-live` no estado (V3 usa `aria-live="polite"` no countdown); incluir no QH3.
- Realtime: a V2 guarda `payload.new` inteiro (incluindo `qr_code`) no estado do React (`useConnectionsManager.ts:111-118`); a V3 também. Preferir mesclar só os campos exibidos (menos dado sensível na memória do navegador).

## 3. O que a V2 faz melhor (não devolver)
Criação atômica com compensação e token no Vault; trava de multi-conexão com o mesmo texto no cabeçalho e no estado vazio; exclusão só admin com digitação do nome e ordem GO->banco; troca de padrão por RPC atômica; identidade/geração do diálogo de QR com testes; rede de segurança de 30 s no loading; matriz de autorização das ações de controle (deny by default); janela de manutenção anti-bloqueio da Meta; `connect` que reafirma o webhook; health-check com segredo do Vault, CAS no update, estado `no_credentials`, alerta por e-mail; store global de saúde + banner com o motivo vindo da edge; telefone mascarado na confirmação; `ConnectionAuditDialog` paginado.

## 4. O que NÃO consegui verificar
- Banco real: se a tabela `reconnection_logs`/colunas do RC1 já existem (o comentário de `useConnectionsHealth.ts` diz que não, mas o RC1 t_a77a5aad está `done`; checar integração); se `audit_logs` tem linhas com `details.instance_id` para conexões; RLS efetiva de `whatsapp_connections` (quem recebe `qr_code` pelo realtime: pelas migrations só admin/supervisor, mas a policy final depende de várias migrations).
- Se a Evolution GO em produção suporta `pairingCode` no `connect` (PC1 t_6f3fc89b e t_0c136c28 já tratam).
- Runtime: tempo real do health-check com várias conexões; se o `restart-instance` (`/instance/restart/...` mapeado em `evolution-go-routes.ts:224`) funciona na GO.
- Estado dos cartões `todo`/`ready` citados (RC2, RC3, CN1, QH3, PC2, CX0b-refazer) e se algum já foi alterado na branch viva desde 12/10.
- Não rodei `buscar_corpo.py` por termo para todos os itens (a cópia do kanban é lida por snapshot); conferi diretamente no `kanban.db` os ids citados.

## 5. Resumo numérico
- Comportamentos comparados: 46. EQUIVALENTE 8, MELHOR_NA_V2 11, DECISAO 8, LACUNA já com cartão 14 (PD-26, CN1, QH1-3, PC1-2, RC1-3, CX0b, `connection_alert_preferences`), LACUNA sem cartão 5 (L1-L5) + 2 de qualidade (L6, L7).
- Lacunas novas: P1 = 2 (L1, L2); P2 = 5 (L3, L4, L5, L6, L7).
- Correção a pedir em cartão existente: PD-26 (toast de sucesso já existe); RC2/RC3/CN1 devem depender do L1.
