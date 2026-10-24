# Mapa do código — Zapp Web V2

Commit `2b4dac2d` (origin/main, 04/10/2026), cópia de trabalho em `~/mapa-zapp-v2` no WSL (fora de `~/projetos`).

## 1. Grafo (Graphify 0.9.48, só sintaxe, custo zero, 35 s)
| Item | Valor |
|---|---|
| Nós / relações / comunidades | 25.868 / 47.930 / 2.572 (sem `docs/reconciliation`) |
| Com `docs/reconciliation` (como está na main) | 30.529 / 52.992 / 2.878 — a auditoria mergeada **polui** o grafo |
| SQL | incluído (migrations viram nós; acha todas as redefinições de uma função) |
| Limite | funções SQL só têm aresta "contém" (grau 1): o Graphify **não liga** `rpc()` do TS → função SQL → edge function |

**Veredito Cartographer × Graphify:** o Graphify já está integrado ao repo (CLAUDE.md, `bun run graph:setup`, hooks), é grátis e cobre a estrutura TS/SQL. A lacuna real (ligação entre camadas) foi resolvida abaixo com um mapa próprio de chamadas, sem ferramenta nova. **Cartographer não é necessário agora**; reavaliar só se os agentes se perderem no código no piloto. Correção a fazer depois do mapa: pôr `docs/reconciliation/` no `.graphifyignore` do repo.

## 2. Tamanho por área (arquivos de código/SQL/teste)
| Área | Arquivos | Linhas | Arquivos de teste |
|---|---|---|---|
| docs | 340 | 92043 | 1 |
| supabase/migrations | 810 | 63462 | 0 |
| src/hooks | 509 | 62801 | 177 |
| scripts | 296 | 52950 | 119 |
| supabase/functions | 218 | 51367 | 77 |
| src/components/inbox | 295 | 44653 | 79 |
| src/lib | 152 | 17008 | 65 |
| src/components/catalog | 48 | 15180 | 28 |
| src/integrations | 4 | 12757 | 1 |
| tests | 61 | 12699 | 61 |
| src/components/talkx | 64 | 12232 | 26 |
| src/components/contacts | 71 | 10985 | 24 |
| src/components/dashboard | 91 | 10330 | 18 |
| src/components/settings | 55 | 9733 | 12 |
| src/components/ui | 90 | 8954 | 3 |
| src/components/tasks | 37 | 6642 | 13 |
| src/components/team-chat | 27 | 6487 | 3 |
| .github/workflows | 16 | 5724 | 0 |
| src/components/calls | 50 | 5425 | 20 |
| e2e | 41 | 5384 | 29 |
| src/components/security | 26 | 4114 | 5 |
| src/pages | 30 | 3676 | 2 |
| src/components/email | 20 | 3461 | 12 |
| src/components/admin | 20 | 3286 | 2 |
| src/components/monitoring | 17 | 2356 | 1 |
| src/components/mobile | 22 | 2335 | 3 |
| src/components/gmail | 9 | 1999 | 4 |
| src/components/queues | 14 | 1940 | 0 |
| src/components/layout | 21 | 1811 | 4 |
| src/components/gamification | 12 | 1810 | 1 |
| src/components/performance | 11 | 1799 | 2 |
| src/components/reports | 10 | 1643 | 0 |
| src/components/connections | 9 | 1585 | 0 |
| src/components/notifications | 14 | 1419 | 2 |
| src/providers | 4 | 1371 | 1 |
| src/components/effects | 6 | 1330 | 1 |
| src/components/crm360 | 7 | 1277 | 0 |
| src/components/voice | 10 | 1253 | 0 |
| src/components/onboarding | 8 | 1147 | 2 |
| src/components/ai | 6 | 1100 | 2 |
| src/components/omnichannel | 4 | 960 | 1 |
| src/components/mfa | 6 | 952 | 2 |
| src/components/integrations | 6 | 893 | 0 |
| src/components/auth | 7 | 853 | 1 |
| src/components/multiplix | 3 | 749 | 0 |
| src/components/chatbot | 4 | 748 | 0 |
| src/components/diagnostics | 3 | 687 | 1 |
| src/components/campaigns | 4 | 593 | 1 |
| src/components/agents | 3 | 560 | 0 |
| src/components/keyboard | 4 | 522 | 1 |
| src/components/theme | 3 | 484 | 2 |
| src/components/docs | 2 | 481 | 0 |
| src/components/groups | 2 | 436 | 1 |
| src/components/automations | 5 | 384 | 0 |
| src/components/whatsapp-flows | 2 | 360 | 0 |
| src/components/schedule | 1 | 288 | 0 |
| src/components/leaderboard | 3 | 286 | 1 |
| src/components/a11y | 3 | 284 | 0 |
| src/components/transcriptions | 2 | 281 | 0 |
| src/components/transitions | 7 | 264 | 1 |
| src/components/payments | 1 | 256 | 0 |
| src/components/errors | 1 | 254 | 0 |
| src/components/sla | 2 | 230 | 0 |
| src/components/cognitive | 2 | 218 | 0 |
| src/components/compliance | 1 | 185 | 0 |
| src/components/nps | 1 | 177 | 0 |
| src/components/meta-capi | 1 | 176 | 0 |
| src/components/permissions | 1 | 176 | 0 |
| src/components/alerts | 2 | 175 | 1 |
| src/components/CommandPalette.tsx | 1 | 139 | 0 |
| src/components/wallet | 1 | 136 | 0 |
| src/components/knowledge | 1 | 133 | 0 |
| src/components/BulkActionsBar.tsx | 1 | 130 | 0 |
| src/components/csat | 1 | 123 | 0 |
| src/components/SearchInput.tsx | 1 | 88 | 0 |
| src/components/__tests__ | 1 | 71 | 1 |
| src/components/ThemeInitializer.tsx | 1 | 45 | 0 |
| src/components/ErrorBoundary.tsx | 1 | 14 | 0 |

## 3. Ligação entre camadas (mapa próprio)
| Item | Valor |
|---|---|
| RPCs chamadas pelo código (src + edge) | 140 |
| …que não existem no banco do Zapp | 9 — **todas em clientes de banco externo** (`externalClient` do CRM em crm-integration / multiplix-audience / multiplix-dispatch; `PROMOGIFTS_SUPABASE_URL` em promogifts-catalog). Não é defeito do Zapp. |
| Edge functions chamadas pelo código | 54 — todas existem no ar |
| Funções do banco expostas ao app e nunca chamadas por `src/` nem edge | 78 (muitas são auxiliares de RLS, gatilhos de cron ou chamadas pelo próprio SQL; candidatas a limpeza **depois** de checar consumidores) |
| Edge functions no ar sem chamada no código | 21 — webhooks e crons (esperado) ou órfãs: auto-close-conversations, cleanup-rate-limit-logs, elevenlabs-agent-token, elevenlabs-webhook, external-db-bridge, gmail-send, gmail-sync, public-api, recover-corrupted-audios, send-rate-limit-alert, sicoob-bridge-reply, sicoob-bridge, talkx-scheduler, voice-copilot-action, whatsapp-webhook, gmail-cron-sync, csp-report, talkx-report, searchbox-budget-alert, multiplix-voices, sync-call-records |

### Dependências de bancos externos (fora do Zapp, só leitura no mapa)
- CRM externo (Singu/Bitrix, via `externalClient`): get_contact_360_by_phone, sync_interaction_from_zapp, get_companies_by_phones_batch, multiplix_list_ramos, multiplix_list_ufs, multiplix_search_audience, multiplix_count_audience, multiplix_resolve_recipients
- PromoGifts (catálogo): zapp_catalog_stats. **Regra: nunca escrever no banco PromoGifts.**

## Graphify aplicado (04/10/2026)
- Graphify 0.9.68 (extras sql+anthropic). Grafo em `~/projetos/Zapp_Web_V2/graphify-out/`.
- **Número vigente (medido em `graph.json` às 10:42 de 04/10, main `bf266d2f8`): 28.760 nós, 62.274 arestas.** Gerado por `graphify extract . --backend deepseek --mode deep` (docs+código, US$ 1,94) + passada `--backend deepseek-vision` (só 2 arquivos, US$ 0,015).
- Histórico dos números (fotos de momentos diferentes, não divergência): 32.137 nós / 66.325 arestas = só AST, **antes** do PR #1887 (incluía 4.671 nós de `docs/reconciliation/`); 27.385 = AST após o PR #1887; 28.754 → 28.760 = após a extração semântica DeepSeek.
- Atualização automática na cópia de referência: commit, checkout e `git pull` (post-merge local). Nada versionado foi alterado.
- Poluição confirmada: 4.671 nós vêm de `docs/reconciliation/`; na busca por `record_incoming_call_event` os 3 primeiros resultados eram relatórios de auditoria. Correção: PR #1887 (auto-merge após checks obrigatórios).
- Limite conhecido: o grafo não liga `rpc()` → função SQL → edge function; esse cruzamento segue na seção do mapa cruzado acima.

## Grafo com IA — estado em 04/10/2026 11:25 (sessão do WSL)
Commit `7a158527` (origin/main). Graphify 0.9.68.

| Medida | Valor |
|---|---|
| Nós / ligações / grupos | 28.780 / 62.383 / 2.637 (1.313 com conteúdo relevante) |
| Origem das ligações | 93% extraídas do código, 7% inferidas pela IA (confiança média 0,93) |
| Nós por tipo | código ~19.900, documento ~7.900, conceito ~850, imagem 114 |
| Cobertura de arquivos | `src` 99,1%; migrations 100%; edge functions 98,2%; scripts 94,7%; docs 91% (fora `docs/reconciliation`, excluída de propósito) |
| Imagens | 113 lidas com visão (`deepseek-vision`); `D-selecionar-contato.jpg` excluída pelo `.graphifyignore` (PR #1888) |
| Grupos nomeados por IA | todos os 2.637 (`graphify label`, DeepSeek) |
| Sem leitura | `audit_report.pdf` (voltou vazio duas vezes) |

Custo de IA do grafo em 04/10 (estimativas do Graphify): documentos e código US$ 1,94; imagens US$ 0,09; nomes dos grupos ~US$ 0,26 (149,5 mil tokens de entrada e 149 mil de saída); repescagem US$ 0,015.

Atualização: camada de código a cada 5 min (`zapp-ref-sync`), verificador a cada 5 min (`ESTADO_DO_GRAFO.txt` nesta pasta), camada de IA a cada 5 min em modo simulação. Detalhes em `PLANO_GRAFO_5MIN.md` e no caderno, seção 12-ter. O relatório completo fica em `~/projetos/Zapp_Web_V2/graphify-out/GRAPH_REPORT.md`.
