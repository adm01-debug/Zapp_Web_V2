# Achados HZ1 — hooks S (useSLAMetrics … useSecurityPushNotifications), doc 26

Fatia: 14 hooks de `fatia_00`. Fontes: V3 `~/projetos/Zapp_Web_V3/src`, V2 `~/hermes-workspaces/Zapp_Web_V2/.integrador/src` (+ `supabase/schema-manifest.json` = retrato da produção V2), cartões via `buscar_todos.py`.
Só leitura. Não rodei testes, tsc nem build. Não acessei o banco vivo: a existência de tabelas/RPCs foi conferida no `schema-manifest.json` e nas migrations da V2.

## Resumo em tabela

| Hook V3 | Onde na V2 | Classe |
|---|---|---|
| useSLAMetrics | `hooks/sla/useSLAMetrics.ts` (reescrito, lê `conversation_sla` paginado) | V2-MELHOR na regra de taxa; MELHORIA B no custo (HZ1-01) |
| useSLARulesCounts | inline em `components/settings/SLARulesManager.tsx:13-33` | EQUIVALENTE (HZ1-09 B) |
| useSLAScopeNames | inline em `components/settings/sla/ScopeRulesList.tsx:22-60` | EQUIVALENTE; V2 sem filtro de UUID (HZ1-09) |
| useScanResponseHandler | ausente | DECISÃO (HZ1-02) |
| useScheduledMessages | `hooks/chat/useScheduledMessages.ts` | V2-MELHOR na leitura; LACUNA no cancelar (HZ1-03) |
| useScheduledReports | `hooks/chat/useScheduledReports.ts` | V2-MELHOR (editar, enviar agora, próximo envio); riscos (HZ1-04) |
| useScreenProtection | `hooks/ui/useScreenProtection.ts` | EQUIVALENTE (cópia); bugs herdados (HZ1-05) |
| useSearchHistory | `hooks/system/useSearchHistory.ts` | V2-MELHOR |
| useSearchInsightRows / useSearchInsights | ausente | LACUNA/DECISÃO (HZ1-06) |
| useSearchManagement | espalhado (ver abaixo) | V2-MELHOR / MORTO em partes |
| useSecurityAlerts | inline em `components/security/RateLimitRealtimeAlerts.tsx:52-112` | EQUIVALENTE com falha silenciosa (HZ1-07) |
| useSecurityAuditLogs | ausente (`AuditLogDashboard.tsx` lê outra tabela) | LACUNA (HZ1-08) |
| useSecurityPushNotifications | `hooks/system/useSecurityPushNotifications.ts` | V2-MELHOR; riscos (HZ1-10) |

---

## 1. useSLAMetrics
- **V3** (`features/sla/hooks/useSLAMetrics.ts`, 81 linhas; `hooks/useSLAMetrics.ts` é barrel): chama `rpc_sla_dashboard(p_period)`, valida o shape com `isRPCResult`, `staleTime` 30 s, `refetchInterval` 60 s. Devolve 1ª resposta E resolução. Período calculado em UTC no servidor: "hoje" começa às 21h de Brasília. "Todos" = 365 dias (migration `20260906001000`).
- **V2** (`hooks/sla/useSLAMetrics.ts:1-162`): sem RPC. Lê `conversation_sla` com `contacts!inner(assigned_to)` por `fetchAllRows` (páginas de 1000, ordem por `id`), mais todos os `profiles`. Calcula no navegador com `date-fns` (fuso local) e `tallyFirstResponse`. Exclui as pendentes do denominador (R2-SLA-001). "Todos" é de fato sem limite (R2-SLA-002) e há `hasSample`. Só 1ª resposta (SLA de Resolução está fora de escopo).
- `rpc_sla_dashboard` não existe no `schema-manifest.json` da V2 (0 ocorrências). Não é lacuna: a V2 não depende dela.
- **V2-MELHOR:** taxa sem inflar com pendentes, "Todos" real, fuso local, erro de paginação incompleta lançado em vez de amostra silenciosa, `pending` exposto.
- **Risco V2 (M/B), HZ1-01:** o período "Todos" ou "Este mês" baixa todas as linhas de `conversation_sla` e todos os `profiles` a cada 60 s por usuário com o painel aberto. É a mesma classe de carga que derrubou a fábrica. Há N+1 de `profiles.find` dentro do map (O(agentes×linhas) é pequeno, mas o download não).
- **Risco V3 (não portar):** UTC no "hoje"; o cast `as unknown` do JSONB.

**HZ1-01 | MELHORIA | B | hugo (+ workersql)**: fazer a agregação no banco. Criar uma RPC `SECURITY INVOKER` que devolva só os contadores (no prazo, violadas, pendentes por agente) com o fuso `America/Sao_Paulo`, e manter `getPeriodStart` como fonte da janela. Arquivos prováveis: `hooks/sla/useSLAMetrics.ts`, nova migration, `slaFirstResponse.ts`. Pronto quando: um teste com 2500 linhas mostra 1 chamada que devolve menos de 50 linhas, e o resultado é igual ao tally atual (teste de equivalência com os mesmos dados). Só abrir depois de medir o tempo real do painel.

## 2. useScanResponseHandler (+ `lib/scanResponse.ts`)
- **V3:** traduz o resultado do scanner em toast (bloqueado 8 s, tentar de novo 10 s com botão "Tentar novamente", entrada inválida, erro) com `toastId` para deduplicar e mostra `scanId`. Usado só em `features/inbox/components/useFileUploadLogic.ts:68,245,293`.
- O scanner da V3 (`supabase/functions/file-security-scanner/index.ts:43,91-135`) envia o arquivo à API do **VirusTotal**, um serviço externo.
- **V2:** ausente. Grep `scanResponse|MALWARE_DETECTED|SCAN_TIMEOUT|isBlocking` em `src`: 0 resultados. Não existem as Edges `secure-upload` nem `file-security-scanner` (`ls supabase/functions`). A V2 tem a quarentena de mídia **recebida** (`hooks/integrations/useQuarantineMedia.ts`, `components/security/Quarantine*.tsx`, ClamAV na VPS). Arquivos que o agente envia não passam por varredura.
- **HZ1-02 | DECISÃO | M | (dono)**: mandar o arquivo para o VirusTotal viola a regra "nenhuma informação sai do sistema", então não se porta como está. Opções: (a) não varrer o upload de saída (aceitar o risco); (b) varrer com o ClamAV da própria VPS antes de enviar, e então reaproveitar o contrato `ScanResult` e o hook de toast. Se for (b): perfis edgar + hugo + iris, arquivos prováveis `lib/scanResponse.ts`, `hooks/inbox/useFileUpload*`, uma Edge nova, e critério de pronto "arquivo de teste EICAR é bloqueado com toast e não é enviado". O cartão `t_4d6e43dc` (ready, workersql: limite de tamanho e tipos nos buckets) é parente, mas não cobre antivírus. Sem cartão cobrindo.

## 3. useScheduledMessages
- **V3:** lista com `enabled` condicionado ao usuário e ao UUID válido; `schedule` com guarda de data futura e `maybeSingle`; `cancel`; toast único de RLS negado (`isRlsDeniedError`/`rlsDeniedMessage`, lib `lib/errors/rlsError`); `onError` no cancelar também. Estado `sending` no tipo.
- **V2** (`hooks/chat/useScheduledMessages.ts:1-163`): lê só `status='pending'`, com janela de datas opcional e paginação total (R2-MOD-029), e expõe `isError`/`refetch` (a tela distingue falha de agenda vazia).
- **V2-MELHOR:** janela + paginação + erro exposto.
- **Lacunas V2:**
  - `cancelMutation` **não tem `onError`** (l.133-146) e `ScheduleCalendarView.tsx:326` chama `cancelMessage(msg.id)` sem `catch`. Se o cancelamento falhar por RLS ou rede, não aparece nada para o usuário e vira *unhandled rejection*, e o agendamento continua pendente (risco real: a mensagem sai depois de o agente achar que cancelou).
  - Não há mensagem específica de RLS (a lib `lib/errors/rlsError` não existe na V2; `grep isRlsDeniedError` = 0).
  - O tipo não tem `sending`. O enviador novo (`t_f23e9286` done) marca a linha como `sending` ao reivindicá-la. Como a lista filtra `pending`, a mensagem some da Agenda durante o envio e o autor não vê falha. **JÁ-COBERTO:** `t_7d49637f` (hugo, todo: estados `sent/failed/expired`, erro legível, cancelar limpando anexo) e `t_58b5d7b5` (iris, todo: lista com status). O texto do cartão não menciona `sending` nem `onError` do cancelar.
  - `schedule` não usa `maybeSingle`/guarda de usuário nulo: com `user` ausente consulta `profiles` por `''` (inofensivo, `created_by` nulo). A guarda de data futura existe no diálogo (`ScheduleMessageDialog.tsx:48`).
- **HZ1-03 | LACUNA | A/M | hugo**: acrescentar `onError` ao cancelar (toast destrutivo com a causa, reverter o botão, não deixar rejeição solta) e incluir `sending` no tipo e no filtro (`in('status', ['pending','sending'])`). Fazer dentro de `t_7d49637f` se ele ainda não começou; senão, cartão pequeno. Arquivos: `hooks/chat/useScheduledMessages.ts`, `components/schedule/ScheduleCalendarView.tsx`. Pronto quando: teste em que o update devolve erro 42501 mostra o toast "não foi possível cancelar", a linha continua na lista e não há rejeição não tratada.

## 4. useScheduledReports
- **V3:** React Query, `create/toggle/delete`, `created_by: profile.id`, `format:'email'`, sem `next_send_at`.
- **V2** (`hooks/chat/useScheduledReports.ts`): estado local, criar/editar/excluir/ativar, destinatários com validação mínima, `calculateNextSendAt` (8h), "Enviar agora" por `send-scheduled-report`, catálogos de tipos/frequências/formatos. Tabela `scheduled_reports` correta (casa com a Edge). **V2-MELHOR** e o mesmo vale para a UI (`components/dashboard/ScheduledReportsManager.tsx`).
- Riscos V2:
  - Validação de e-mail é só `includes('@')` e a duplicata é sensível a maiúsculas (`a@x.com` e `A@x.com` passam). Sem limite de destinatários. B.
  - `created_by: user?.id` (id do auth), enquanto `scheduled_messages.created_by` usa `profiles.id`. A coluna é `uuid` sem FK (migration `20260315123034`), então não quebra, mas a semântica fica mista. B.
  - `toggleActive` engole o erro (`log.error` sem toast): o switch fica errado sem aviso. B.
  - `calculateNextSendAt` usa o relógio do navegador e a hora local de quem salvou (não o fuso do operador); o disparador (pg_cron) está no cartão `t_c2f65e14` (running, workersql). JÁ-COBERTO. Edge de envio com falha: `t_547a6a74` (done).
- Anotar: o envio de relatório por e-mail a destinatários digitados envia dados ao exterior, mas já existe e já foi autorizado (`t_6c9c20f3` done). Nenhuma proposta.
- **HZ1-04 | MELHORIA | B | hugo**: validar e-mail com regex simples, comparar sem caixa, limitar a 20 destinatários, mostrar toast no `toggleActive`, e gravar `created_by` com `profile.id`. Arquivos: `hooks/chat/useScheduledReports.ts` + teste existente `hooks/chat/__tests__/useScheduledReports.test.tsx`. Pronto: testes para e-mail inválido, duplicata com caixa diferente e falha do toggle.

## 5. useScreenProtection (`features/auth/hooks`, `hooks/ui/useScreenProtection.ts` na V2)
- Diff linha a linha (V3 x V2): idênticos exceto o logger (V3 registra `log.debug` quando a limpeza da área de transferência é negada; V2 engole com `.catch(()=>{})`) e a fonte do overlay (V2 usa `var(--font-sans)`). **EQUIVALENTE.** Montado em `App.tsx:101`; botão `components/notifications/ScreenProtectionToggle.tsx`.
- Bugs presentes **nos dois lados**:
  1. `toggle` grava em `localStorage` e dispara `window.dispatchEvent` **dentro do updater** do `setEnabled`. O updater deve ser puro (em modo estrito roda duas vezes e o evento atualiza outro componente durante a renderização, o que gera o aviso "Cannot update a component while rendering"). O `setItem` sem `try/catch` lança em navegador com armazenamento bloqueado (o `getStoredState` tem `try`, o `toggle` não). B.
  2. O overlay de `blur` aparece sempre que a janela perde o foco (caixa de diálogo de arquivo do sistema, clique em iframe, notificação) e não tem `role`/`aria-live`; leitor de tela não recebe aviso. B.
  3. `Ctrl+C` fora de campos é bloqueado e a área de transferência é zerada. O agente não consegue copiar o telefone ou o texto da mensagem exibida. Está coerente com a regra "nada sai do sistema", então só registro (DECISÃO já tomada pelo dono, nenhuma ação).
  4. `handleDragStart` bloqueia arrastar arquivos dentro da própria aplicação? Não: só `dragstart` fora de INPUT/TEXTAREA, então o arrastar de arquivos do exterior para soltar (evento `drop`) não é afetado. Conferido, sem diferença.
- **HZ1-05 | MELHORIA | B | hugo**: mover a gravação e o evento para fora do updater (`const next=!enabled; try{setItem}catch{}; setEnabled(next); dispatch`), adicionar `role="alert"`/`aria-live="assertive"` ao overlay e `log.debug` ao `.catch`. Arquivos: `hooks/ui/useScreenProtection.ts`; teste existente `hooks/__tests__/useScreenProtection.test.tsx`. Pronto: teste com `localStorage.setItem` lançando exceção não quebra o toggle; teste confirma que o overlay tem `role`.

## 6. useSearchInsightRows, useSearchInsights e a página de insights de busca
- **V3:** `pages/AdminSearchInsightsPage.tsx` (rota em `ViewRouter.tsx`/`lazyViews.ts`) com KPIs (`get_search_insights`: top consultas, buscas sem resultado, taxa de clique, parcela de busca vetorial) e tabelas (`search_insights` top 50). A gravação vem de `rpc_log_search_event`, chamado em `features/inbox/components/useGlobalSearchData.ts:336`. A política de `search_insights` é admin/supervisor (migration squash l.10957).
- **V2:** grep `search_insights|get_search_insights|rpc_log_search_event|SearchInsights` em `src`, `supabase/migrations` e `schema-manifest.json`: **0 resultados**. Nenhuma tabela, RPC ou página; `useGlobalSearchData.ts` da V2 não registra eventos de busca. Só existe `searchbox_usage_daily` (custo de uma API de caixa de busca externa, assunto distinto).
- Observação V3 (não portar): o `search_term` é salvo bruto (a própria migration cita como GAP 15), `get_search_insights` não aparece em nenhuma migration do repositório V3 (provavelmente só existe no banco vivo), e `useSearchInsightRows` faz `select('*')` sem tratar erro de RLS.
- Cartões: `buscar_todos` com `search_insights`, `insights de busca`, `get_search_insights` = 0 que tratem disso (os "Insights" listados são do Talk X).
- **HZ1-06 | DECISÃO | M | (dono) → workersql, hugo, iris**: perguntar ao dono se quer análise de buscas (o que se busca sem achar = lacuna na base de conhecimento e nos contatos). Se sim: tabela `search_events` com termo **normalizado, sem telefone nem e-mail**, retenção de 90 dias, RPC de agregação só admin/supervisor, registro no `useGlobalSearchData`, tela admin. Pronto: busca sem resultado aparece no painel em até 1 min e um agente comum recebe 403 na RPC. Sem cartão cobrindo. Não bloqueia nada.

## 7. useSearchManagement (módulo consolidado) — peça por peça
| Peça V3 | V2 | Veredito |
|---|---|---|
| `useGlobalSearchShortcutManagement` (Ctrl+K) | `components/keyboard/GlobalKeyboardProvider.tsx:105`, `CommandPalette.tsx:67`, `useChatPanelHandlers.ts:468` | EQUIVALENTE (a V2 tem 4 implementações de Ctrl+K; ver risco) |
| `useKnowledgeBaseSearchManagement` | `hooks/integrations/useKnowledgeBaseSearch.ts` | V2-MELHOR (debounce 300 ms, mínimo 2 letras, `max_results:5`, `throw` no erro em vez de lista vazia, `clear` cancela o debounce). **JÁ-COBERTO:** o painel dentro da conversa é `t_712c28f2` (done, iris) e `t_9bb1649b` (ready). Na cópia viva ainda nenhum componente usa o hook (só `index.ts`); depende de integrar o `t_712c28f2` |
| `useSearchHistoryManagement` (tabela `search_history` no servidor) | histórico local por usuário (`useSearchHistory`) | MORTO na V3: sem nenhum consumidor (`grep` fora do próprio módulo = 0); tabela `search_history` só tem comentário (migration f008), não existe no retrato da V2. V2 não precisa |
| `useSearchInsightsManagement` | ausente | HZ1-06 |
| `useChatSearchManagement` (`search_chat_messages`) | ausente | MORTO na V3: RPC inexistente em qualquer migration e sem consumidor. A V2 tem `search_team_messages` (equipe) e busca na conversa por outros caminhos |
- **Risco V2 (B):** `GlobalKeyboardProvider`, `CommandPalette` e `ui/command-palette.tsx:238` registram Ctrl+K em paralelo. Se dois montarem juntos, o `toggle` abre e fecha no mesmo evento. Verificar quais montam ao mesmo tempo (não tracei a montagem). **HZ1-11 | MELHORIA | B | iris**: manter um único dono do Ctrl+K e teste que dispara o evento uma vez e confirma 1 painel aberto.

## 8. useSearchHistory
- **V3:** chave global `global-search-history` no `localStorage` (a conta seguinte no mesmo navegador herda as buscas da anterior). Máx. 10, mínimo 2 letras, sem duplicata sem caixa.
- **V2:** chave `zapp.search.history:<profile.id>`, purga da chave antiga, funciona sem `AuthProvider`, estado por dono, mesma regra de 10/2/duplicata. **V2-MELHOR** (R2-PLAT-006). Nenhuma lacuna. Detalhe herdado: `removeFromHistory` compara com caixa exata (os dois lados), B, sem proposta.

## 9. useSLARulesCounts e useSLAScopeNames
- **V3:** hooks próprios com `staleTime`/`gcTime` dedicados. `useSLAScopeNames` filtra IDs com `isValidUUID` antes do `.in()`, e só consulta o escopo ativo.
- **V2:** a mesma lógica copiada dentro dos componentes (`SLARulesManager.tsx` conta com `staleTime:10000`; `ScopeRulesList.tsx` resolve nomes). Mesmos resultados; a contagem usa `else if` (uma regra com mais de um campo preenchido conta uma vez no primeiro escopo, igual à V3 do doc).
- Diferenças: V2 sem `isValidUUID` (um `contact_id` malformado em dado legado gera erro 22P02 no `.in()` e o nome fica em branco, sem aviso); `queryKey` com o array de ids muda a cada render da lista (cache fragmentado, pior só em desempenho). **HZ1-09 | MELHORIA | B | hugo**: extrair para `hooks/sla/useSLARulesCounts.ts` e `useSLAScopeNames.ts` com filtro de UUID e chave ordenada. Pronto: teste com um id inválido não gera chamada e não quebra a lista.

## 10. useSecurityAlerts (funções `fetchUnresolvedSecurityAlerts`/`resolveSecurityAlert`)
- **V3:** helpers com `throw` em erro; resolver marca `is_resolved` e `resolved_at`; normaliza a linha (`normalizeSecurityAlert`). Usados por `RateLimitRealtimeAlerts.tsx`.
- **V2:** o código está dentro do componente (`RateLimitRealtimeAlerts.tsx:52-112`): polling de 15 s com comparação por ids; som só para severidade alta/crítica, respeitando mudo e horário de silêncio (**V2-MELHOR**, sem equivalente na V3).
- **Risco V2 (M), HZ1-07:** `handleDismiss` (l.105-112) esconde o alerta na hora (`dismissed`) e faz o `update` **sem olhar o erro**. Se a RLS recusar (política "Admins can manage security alerts") ou a rede cair, o alerta some da tela mas continua aberto no banco e volta ao recarregar, ou nunca é percebido por outro admin. Também não grava `resolved_by` (a coluna existe no retrato: `security_alerts.resolved_by`), então não dá para saber quem resolveu. Cartões relacionados: `t_cdd10955` (todo, hugo, deduplicação/teto do alerta de rate limit) e `t_499a66ad` (ready, edgar) tratam da emissão, não do resolver.
- **HZ1-07 | LACUNA | M | hugo**: ao dispensar, esperar o resultado; em erro reexibir o alerta com toast; gravar `resolved_by` com `profile.id`. Arquivos: `components/security/RateLimitRealtimeAlerts.tsx` (ou extrair `lib/securityAlerts.ts`). Pronto: teste com `update` recusado mantém o alerta visível e mostra o toast; teste com sucesso grava `resolved_by`.

## 11. useSecurityAuditLogs
- **V3:** painel admin (`pages/admin/AdminSecurityLogsPage.tsx`, também usado por `useACLAlerts`): últimos 50 eventos das últimas 24 h com nome/e-mail do usuário, e 4 contadores (negados 24 h, mudanças de permissão 24 h, logins de admin 7 d, falhas de RLS 24 h), cada um por `count:'exact', head:true`, atualizados por canal Realtime em INSERT (invalida só a consulta afetada).
- **V2:** a tabela `security_audit_logs` **não existe** no retrato da produção (`schema-manifest.json`: 0 ocorrências; só `audit_logs`, `rate_limit_logs`, `security_alerts`). Em produção, o hook da V3 receberia erro e devolveria listas e contadores zerados, sem aviso (`log.error` e `return []/0`): na V3 o painel mostra "tudo calmo" quando na verdade falhou. **Bug da V3, não portar.**
- O equivalente na V2 é `components/security/AuditLogDashboard.tsx` (tabela `audit_logs`, filtros por ação e entidade, eventos de papel). Limites:
  - `fetchLogs` pega 200 linhas e calcula "total/hoje/suspeitas/usuários" sobre essas 200 (l.82-110); "total" nunca passa de 200 e o rótulo sugere o total real. B.
  - Sem Realtime: só atualiza ao recarregar. B.
  - Sem contadores por tipo (permissão alterada, login de admin) nem tela de tentativas negadas. `audit_logs` não tem `status`; o que existe de acesso negado fica em `rate_limit_logs`/`security_alerts`.
  - Sem o nome do usuário (mostra `user_id`); a busca de texto procura em `user_id`.
- **HZ1-08 | MELHORIA | M | hugo (+ workersql)**: no `AuditLogDashboard`, trocar os totais por contagens de servidor (`count:'exact', head:true`) com janela de 24 h/7 d, assinar INSERT de `audit_logs` (verificar se a tabela está na publicação realtime) e mostrar o nome via `profiles`. Atenção: a política só deixa admin ler (`"Only admins can view audit logs"`), então o canal só entrega a admin. Pronto: com 500 linhas fictícias o cartão "Hoje" mostra a contagem real, e um INSERT novo aparece em menos de 5 s sem recarregar.

## 12. useSecurityPushNotifications
- **V3** (`hooks/useNotificationManagement.ts:408-435`): só assina `app_notifications` do tipo `security_alert|suspicious_activity` e guarda em estado `securityAlerts`. Não filtra por usuário no canal, não mostra toast nem push. Efetivamente não faz nada visível (a interface do hook devolve a lista).
- **V2** (`hooks/system/useSecurityPushNotifications.ts:1-135`): polling de 20 s em `security_alerts` do próprio usuário não resolvidos, push nativo quando há permissão (urgente exige interação e vibra) e toast como alternativa por severidade; ouve mensagens do service worker. **V2-MELHOR** (e o canal Realtime de `security_alerts` foi retirado de propósito, migration 20260905/E62).
- Riscos V2 (todos B/M):
  - `lastCheckedRef` usa o relógio do navegador contra `created_at` do servidor; relógio atrasado repete alertas, relógio adiantado perde alertas criados entre uma consulta e outra (usar o maior `created_at` recebido). M.
  - O hook só roda onde é montado: `SecurityView.tsx:31` e o painel. Fora dessa tela ninguém recebe alerta pessoal de segurança (ex.: novo dispositivo) enquanto usa o chat. M.
  - `SECURITY_ACTION` e `NOTIFICATION_CLICK` só mostram toast "Redirecionando…" sem navegar (comentário "Could dispatch a navigation event here"). B.
  - A consulta filtra `user_id = user.id` e a política de `security_alerts` é "admins"; um agente comum nunca recebe nada (confirmar se o alerta de novo dispositivo, `t_e369658a`, grava `user_id` do próprio usuário e se há política de leitura para ele). Não verifiquei a política de SELECT do dono. M.
- **HZ1-10 | MELHORIA | M | hugo (+ workersql para a política)**: (1) cursor pelo maior `created_at` recebido (ou `id`), em vez do relógio; (2) montar o hook uma vez em um provedor global; (3) navegar à Central de Segurança no clique; (4) política `security_alerts_select_own` (`user_id = profile do usuário`) se faltar. Arquivos: `hooks/system/useSecurityPushNotifications.ts`, `App.tsx` ou provider, migration. Pronto: teste com relógio do navegador 10 min atrasado não repete alertas; alerta criado para o usuário aparece como toast em qualquer tela; clique no push abre a Central.

---

## Conferido, sem diferença relevante
- `useScreenProtection` (cópia fiel), `useSearchHistory` (V2 acima), `useSearchInsights` barrel (sem equivalente por não haver dado), `useSecurityPushNotifications` barrel, `useSLAMetrics` barrel.
- RLS de `scheduled_messages` na V2: `"Users can create/view/update/delete scheduled messages"` e o cartão `t_d3c1981f` (done, contato visível) cobrem a escrita; o enviador é `t_f23e9286` (done) e `t_0ee478a2` (done).
- `scheduled_reports`: política de admin para ver/inserir/gerir, coerente com o hook.

## Resumo de ids
| Id | Classe | Sev | Perfil | Observação |
|---|---|---|---|---|
| HZ1-03 | LACUNA | A/M | hugo | cancelar agendamento sem aviso de erro; `sending` fora do filtro. Encaixar em `t_7d49637f` |
| HZ1-07 | LACUNA | M | hugo | dispensar alerta de segurança sem tratar erro nem gravar `resolved_by` |
| HZ1-08 | MELHORIA | M | hugo/workersql | painel de auditoria com totais de 200 linhas e sem tempo real |
| HZ1-10 | MELHORIA | M | hugo/workersql | alerta pessoal de segurança só dentro da tela; cursor por relógio do navegador |
| HZ1-02 | DECISÃO | M | dono | varredura de upload de saída; VirusTotal viola a regra |
| HZ1-06 | DECISÃO | M | dono | análise de buscas (insights) |
| HZ1-01 | MELHORIA | B | hugo/workersql | agregar SLA no banco (medir antes) |
| HZ1-04 | MELHORIA | B | hugo | relatórios agendados: e-mail, duplicata, toggle, `created_by` |
| HZ1-05 | MELHORIA | B | hugo | toggle de proteção de tela impuro; overlay sem `role` |
| HZ1-09 | MELHORIA | B | hugo | extrair hooks de SLA e filtrar UUID |
| HZ1-11 | MELHORIA | B | iris | quatro registros de Ctrl+K |

JÁ-COBERTO: `t_7d49637f`/`t_58b5d7b5` (estados de agendamento), `t_712c28f2` (done)/`t_9bb1649b` (ready) (base de conhecimento na conversa), `t_c2f65e14` (running, cron dos relatórios), `t_f6885a27`/`t_0df64774` (tabela dos relatórios), `t_547a6a74` (done, falha de envio), `t_6c9c20f3` (done, autorização do envio), `t_cdd10955`/`t_499a66ad` (emissão de alerta de rate limit).
V2-MELHOR: SLA (taxa e janela), leitura de agendadas, relatórios agendados (edição, enviar agora), histórico de busca por usuário, busca na base de conhecimento, push de segurança, alerta de rate limit (som e silêncio).

## O que NÃO consegui ler/confirmar
- Banco vivo (nem `zapp-db-local` nem o MCP): existência de tabelas/RPCs conferida só pelo `schema-manifest.json` e pelas migrations; não vi se `security_audit_logs`/`search_insights` existem na produção real da V3 (não afeta a V2).
- Política de SELECT de `security_alerts` para o dono do alerta e publicação realtime de `audit_logs`.
- Quais painéis de Ctrl+K montam juntos na V2 (HZ1-11 é suspeita por leitura, sem execução).
- O texto completo de `t_7d49637f`/`t_58b5d7b5` após os primeiros 1500 caracteres (pode já tratar `sending`/`onError`).
- A busca em cartões falhou uma vez por o banco do quadro estar corrompido na cópia, depois voltou; os termos foram repetidos.
