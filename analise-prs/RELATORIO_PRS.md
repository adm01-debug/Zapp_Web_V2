# Relatório de Análise — PRs Abertas (2026-10-23)

**Main SHA:** `a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674` (2026-10-23T16:22:28Z)  
**Total analisadas:** 119 / 119 ✅  
**Merges realizados:** 0

---

## Resumo Executivo

| Estado | Qtd | Mergeável? |
|---|---|---|
| DRAFT | 28 | ❌ Não (rascunho) |
| DIRTY (conflito) | 36 | ❌ Não (requer rebase) |
| BEHIND (sem conflito) | 55 | ❌ Não (strict=true bloqueia) |
| CLEAN | **0** | — |

**Conclusão:** Nenhuma PR pode ser mergeada neste momento.

**Causa raiz:** A combinação de `strict=true` na branch protection e CI vermelho na main cria um impasse:
- PRs `BEHIND` precisam ser atualizadas antes do merge (strict=true)
- Ao atualizar, herdam as falhas de CI da main (Unit Tests × 3 + Contrato DB offline)
- Não é permitido fazer push para atualizar as branches nesta sessão

---

## Caminho para Desbloqueio

Mergear nesta ordem (requer desligar `strict` temporariamente OU aceitar o estado BEHIND):

1. **#2192** — `fix: guarda de vigência do teste RLS do Dashboard` → destrava `Contrato DB offline`
2. **#2193** — `fix: testes de ChatMessagesArea e FilesTab` → destrava Unit Tests (2 mocks)
3. **#2187** — `fix(tests): corrige falhas de testes no baseline main` → consolida Unit Tests
4. **#2190** — `fix: corrige 9 falhas de CI que mantinham a main vermelha` → valida todo o CI
5. **#2186** — `fix(security): auditoria Supabase 2026-10-22` — crítico de segurança

Após esses 5 merges, main CI ficaria verde, desbloqueando as 55 PRs BEHIND (que poderiam então ser atualizadas e mergeadas com CI passando).

---

## Inventário Completo — 119 PRs

### DRAFT (28 PRs — não elegíveis)

| # | Título | Autor |
|---|---|---|
| 1991 | fix: corrige nomes de workflows no notificador e cancelamento de scroll | adm01-debug |
| 1997 | feat: CV-010–020 — Fase 2 RADAR copilot (migrations + feature flag) | adm01-debug |
| 1998 | feat: CV-021–030 Motor copilot-live | adm01-debug |
| 2000 | feat: RADAR Fase 4 — Inteligência B·R·I·N·D·E (CV-031–040) | adm01-debug |
| 2002 | feat: RADAR CV-041–050 — Sugestões ao vivo | adm01-debug |
| 2003 | feat: CV-051–060 — Fase 6 RADAR painel flutuante | adm01-debug |
| 2013 | feat: CV-071–080 — Fase 8 RADAR objeções, battlecard | adm01-debug |
| 2022 | feat: RADAR copilot Phase 9 — Catalog, Budget, Timeline | adm01-debug |
| 2024 | feat(copilot): Phase 10 — sinais, temperatura, timing | adm01-debug |
| 2025 | feat: RADAR Fase 11 — Multimodal CV-101–110 | adm01-debug |
| 2026 | feat: CV-111–120 Guardrails, segurança e LGPD — Fase 12 do RADAR | adm01-debug |
| 2029 | feat: RADAR Phase 13 — Supervisor, coaching e treinamento | adm01-debug |
| 2030 | feat: RADAR copiloto CV-131–140 — Aprendizado contínuo | adm01-debug |
| 2032 | feat: RADAR Copiloto — Fase 15: Custos, Piloto e Rollout | adm01-debug |
| 2034 | fix(ci): GA02 + GA10 — guarda CLAUDE.md no CI | adm01-debug |
| 2035 | fix: mock global @/lib/logger no Vitest | adm01-debug |
| 2036 | fix(ci): GA04/GA05 — console.error no heredoc db-migrate | adm01-debug |
| 2037 | fix(ci): GA06/GA07/GA08/GA09 — docker shim + PSQL_BIN | adm01-debug |
| 2054 | ci(W80/W81/W82): db-migrate 2 jobs + apply_all_missing + portao destrutivo | adm01-debug |
| 2092 | fix(ci): Fase 3: GA48 — corrige módulos que falhavam antes de rodar | adm01-debug |
| 2093 | fix(ci): Fase 3.5: GA48.5 — corrige 4 testes que falhavam antes de rodar | adm01-debug |
| 2100 | fix: corrigir falhas de CI — testes, a11y, bundle, motion (261019 v2) | adm01-debug |
| 2108 | feat(team-chat): envia para conversa de equipe via ?cid= na URL (E90 rascunho) | adm01-debug |
| 2113 | fix(ci): Fases 9+10: GA96–GA98 + GA99–GA100 (docs deploy + regen) | adm01-debug |
| 2116 | fix(ci): Fase GA13–GA17 revisada — db-migrate 2 jobs com portão destrutivo | adm01-debug |
| 2138 | Codex/fix ci cd pipeline | devin-ai-integration[bot] |
| 2195 | feat(security): Z017–Z020 CORS/Auth hardening completo (261018-1950) | adm01-debug |
| 2198 | feat(talkx): editor de templates + artefatos com testes E2E (dia/2026-10-22) | adm01-debug |

---

### DIRTY — Conflito de Merge (36 PRs — não mergeáveis sem rebase)

| # | Título | SHA (HEAD) | Observação |
|---|---|---|---|
| 1922 | fix(ci): mutação do mapa só roda em pull_request (W10) | a2e1c193 | Toca `.github/workflows/` — proibido pelo goal |
| 1930 | feat(db-audit): W21 — check-migration-drift --classificar | 8b401af1 | db-audit + workflows |
| 1975 | ci: reativar 8 suites no job node-scripts | a7c3edae | Toca `.github/workflows/` — proibido |
| 2040 | fix(e2e-logado): restaura W71 — workflow_run em vez de push | 570face4 | Toca `.github/workflows/` — proibido |
| 2042 | ci(W94+W32): talkx-status-regen concurrency | 5fe12a33 | Toca `.github/workflows/` — proibido |
| 2044 | ci(W39/W49/W50): playwright versao dinamica | 2585efb4 | Toca `.github/workflows/` — proibido |
| 2051 | ci(W85/W86/W87): OpenSSF Scorecard + dependency-review | fe00bdfe | Toca `.github/workflows/` — proibido |
| 2056 | fix(ci): restaura auto-update-pr-branch e settings-guard | 4ce5a6e9 | Toca `.github/workflows/` — proibido |
| 2058 | fix(test): mock de @/lib/logger sem createLogger — 9 arquivos | 10d843f9 | Conflito; análise de conteúdo abaixo¹ |
| 2059 | fix(test): ConnectionCard handleDisconnectDialogOpenChange | ab048216 | Conflito |
| 2060 | fix(test): mock da cadeia supabase sem o 2º .order() | 88d8e470 | Conflito |
| 2063 | fix(test): useAuth sem AuthProvider no teste — 2 arquivos | 81543b96 | Conflito |
| 2071 | fix: remove hook morto useTalkXSuppression (TL-002) | 617bdced | Conflito |
| 2072 | fix: supabase.rpc perde o this + lead_origin sem comingSoon | 81e74308 | Conflito |
| 2074 | fix: overlay de useScreenProtection sem role=alert/aria-live | ff66b456 | Conflito |
| 2080 | fix: useTeamChatNotifications — canal recriado no volume | ee3d010d | Conflito |
| 2088 | fix: área segura mobile (safe-area-*) e rolagem sem barra | ced1c1b4 | Conflito |
| 2091 | fix: timing-safe comparison em searchbox-budget-alert | 626811d3 | Conflito |
| 2098 | fix: corrigir falhas de CI — testes, a11y, bundle e motion | 16a4c54f | Conflito; supercede por #2187/#2190 |
| 2104 | fix(ci): PGUSER postgres + GA75 endpoint + GA77 | 054d4d89 | Toca `.github/workflows/` — proibido |
| 2105 | docs: plano de integração de branches em 300 etapas | 0c5d236d | Conflito; apenas docs |
| 2109 | fix(test): mock useCustomEmojis.upload suporta duplo .order() | 23abac7c | Conflito |
| 2110 | fix(tests): add createLogger a vi.mock('@/lib/logger') em 20 testes | e34c3f4d | Conflito; supercede por #2187 |
| 2111 | fix(types): narrowar reason_code em useTalkXSuppression | ec57655d | Conflito |
| 2112 | chore(inbox): remove órfão ConversationMemorySection | 656ee4cc | Conflito |
| 2124 | fix(ci): Fase 0 do plano GA02-GA12 | e9667712 | Toca `.github/workflows/` — proibido |
| 2129 | fix(ci): Fases 7+8 do plano GA75-GA95 | 1b2db4d1 | Toca `.github/workflows/` — proibido |
| 2139 | Codex/fix failed workflows 20261020 | bf0ce769 | Toca `.github/workflows/` — proibido |
| 2142 | fix(ci): Resto GA13-GA17 (db-migrate 2 jobs) | ed399668 | Toca `.github/workflows/` — proibido |
| 2143 | fix(ci): Resto GA20-GA25 (Gate 3, DESTINO split) | f63da0dd | Toca `.github/workflows/` — proibido |
| 2144 | fix(ci): Resto GA37 GA96-GA98 (docs deploy) | 52761c07 | Toca `.github/workflows/` — proibido |
| 2145 | fix(ci): Resto GA86 GA99 GA100 (sonar, contracts) | dc8b6349 | Toca `.github/workflows/` — proibido |
| 2147 | fix(db-audit): guard n011 com teto dinamico | 0913cfeb | Conflito; body diz "Não mergear" |
| 2151 | fix(ci): destravar workflows que falhavam antes de executar | 0770f6b5 | Toca `.github/workflows/` — proibido |
| 2155 | fix(ci): destrava workflows que falhavam antes de executar | 64934014 | Toca `.github/workflows/` — proibido |
| 2185 | docs(pendencias): §8 RESOLVIDO + §9 inventário | bdcf2385 | Conflito; apenas docs |

¹ PRs #2058, #2059, #2060, #2063 — correções de testes com conflito; conteúdo similar ao lote
não-conflitante (#2061–#2068 etc.). As versões sem conflito (BEHIND) são preferíveis.

---

### BEHIND — Desatualizadas com main / strict=true bloqueia (55 PRs)

**Status:** Sem conflito de merge, mas bloqueadas porque `strict=true` exige que a branch esteja up-to-date.

| # | Título | SHA (HEAD) | Tipo | Prioridade |
|---|---|---|---|---|
| 1979 | docs: plano de correções dos workflows em FAILURE — 200 etapas | dec13f87 | docs | baixa |
| 2005 | feat: Fase 7 RADAR — ghost text, feedback, templates e voz | bb239fbe | feat/RADAR | aguarda main verde |
| 2046 | W45: pular test/build/security/e2e/db-guard em PR draft | 29afe325 | ci | ATENÇÃO: toca workflows |
| 2057 | feat(ci): lint-ratchet.mjs --base <ref> para lint escopado por PR | c7424ed8 | ci/script | aguarda main verde |
| 2061 | fix(test): AuthProvider ausente em testes do inbox — 2 arquivos | 4044867c | test | ✅ válido, aguarda CI |
| 2062 | fix(test): mock de framer-motion sem useReducedMotion — 1 arquivo | 8cf96c52 | test | ✅ válido, aguarda CI |
| 2064 | fix(test): mock de supabase.channel incompleto — 1 arquivo | fcc63eed | test | ✅ válido, aguarda CI |
| 2065 | fix(test): mock de supabase.channel ausente em AgentsView | 8d59be9d | test | ✅ válido, aguarda CI |
| 2066 | fix: useAudioMemes sobe chave solta no bucket com policy (PK-16/PK-17) | a89cac42 | fix/storage | ✅ válido, aguarda CI |
| 2067 | fix(test): 2 mocks locais incompletos — 1 arquivo (lote F1a) | d08b8e84 | test | ✅ válido, aguarda CI |
| 2068 | fix(test): mock de useAdminData sem AUDIT_PAGE_SIZE | db987501 | test | ✅ válido, aguarda CI |
| 2069 | fix(test): mock de supabase sem .range()/.gte()/.lte() | 04283183 | test | ✅ válido, aguarda CI |
| 2070 | fix: avatar assinado ao carregar + testes handleCreateUser | 5a37b928 | fix/test | ✅ válido, aguarda CI |
| 2073 | fix: useKnowledgeBase não expunha erro de leitura (t_1944d290) | 7ffe64f5 | fix | ✅ válido, aguarda CI |
| 2075 | fix: aviso de desktop do War Room saía pelo caminho errado | b3107856 | fix | ✅ válido, aguarda CI |
| 2076 | fix(test): mock de framer-motion sem useReducedMotion em GroupsView | f190aa20 | test | ✅ válido, aguarda CI |
| 2077 | fix: remove teste obsoleto de mutations.ts | d1e81f9a | fix/test | ✅ válido, aguarda CI |
| 2078 | ci(F3): baseline strict=false — opção A sem fila serial | 3de49325 | ci | ATENÇÃO: toca branch-protection |
| 2079 | fix(test): assume canal errado quando useTeamReadState abre o seu próprio | 436fdf58 | test | ✅ válido, aguarda CI |
| 2081 | fix: contagem de whatsapp_connections lançava e derrubava coleta | 4b0d88a7 | fix | ✅ válido, aguarda CI |
| 2082 | fix: falha de leitura em useUserSettings ficava invisível (C-1) | 847ffd69 | fix | ✅ válido, aguarda CI |
| 2083 | fix: NPSDashboard não expunha erro de leitura nem aviso de teto | 82585eef | fix | ✅ válido, aguarda CI |
| 2084 | fix: Leaderboard não distinguia RPC caída de ranking vazio | 4398d18b | fix | ✅ válido, aguarda CI |
| 2085 | fix: WhatsAppTemplatesManager sem gate de escrita admin-only (RLS) | a8b26e5f | fix/security | ✅ válido, aguarda CI |
| 2086 | fix: botão de remover atendente do QueueCard morto ao toque (N-180.6) | 32108e9c | fix | ✅ válido, aguarda CI |
| 2087 | fix(test): mock de supabase.rpc ausente ao buscar em GmailInboxView | a7cf28b9 | test | ✅ válido, aguarda CI |
| 2089 | fix: ChatService.uploadAudio gravava sempre como .webm | 95de970b | fix | ✅ válido, aguarda CI |
| 2090 | fix: fila de envio offline não era por usuário | 2e6076e3 | fix | ✅ válido, aguarda CI |
| 2095 | fix(security): Z018+Z020 — external-db-proxy code-leak em 502 | df97e3a1 | security | ✅ PRIORITÁRIO — segurança |
| 2097 | fix: corrige falhas pré-existentes nos Unit Tests | ced0f5ba | fix/CI | ✅ PRIORITÁRIO — destrava CI |
| 2102 | ⬆️ deps: Bump deps-semanal group with 11 updates | 5688a804 | deps | aguarda CI |
| 2107 | docs(g9): absorver planos de docs ausentes da main — E274 | fbfc51c4 | docs | baixa |
| 2119 | docs(inbox): registra encerramento do plano de 20 etapas | 9bdc0023 | docs | baixa |
| 2120 | fix(inbox): fecha a semântica de tablist das 8 abas da conversa | 4006fde2 | fix/a11y | ✅ válido, aguarda CI |
| 2121 | docs(contatos): incorpora o plano de 50 etapas | 9e949fca | docs | baixa |
| 2123 | fix(ci): restaura o parse dos contratos de workflow | d90d3f78 | ci/script | aguarda CI (ATENÇÃO: workflow-related) |
| 2125 | fix(ci): Fase 1 do plano GA18 GA19 + GA26 prepare | 19c48a20 | ci | ATENÇÃO: toca workflows |
| 2126 | fix(ci): Fases 4+5+6 do plano GA49-GA74 | 403cf6b3 | ci | ATENÇÃO: toca workflows |
| 2127 | fix(e91): log de CHANNEL_ERROR nos canais Realtime do Team Chat | 2d048ab4 | fix | ✅ válido, aguarda CI |
| 2128 | fix(ci): Fases 2+3 do plano GA27-GA47 | 420aae58 | ci | ATENÇÃO: toca workflows |
| 2135 | fix(contatos): restaura topo sem cabeçalho e devolve toque ao FAB | 0e0c3786 | fix/UI | ✅ válido, aguarda CI |
| 2137 | fix(db): recria canonicamente as policies de receipt do team chat | b397e0d4 | fix/db | ✅ válido, aguarda CI |
| 2141 | feat(E83): entrar por codigo - aceite desacoplado (somente arquivos novos) | a671e697 | feat | aguarda CI |
| 2146 | feat(team-chat): TeamChatView seleciona conversa via ?cid= (E90) | 9723899e | feat | aguarda CI |
| 2148 | test(e2e): destrava specs deslogados de Contatos | 288afb20 | test/e2e | aguarda CI |
| 2149 | docs(reconciliation): P053 registra regressão do cabeçalho | d78360c4 | docs | baixa |
| 2152 | test(e2e): spec de toque 44px volta ao verde | 3eca1307 | test/e2e | aguarda CI |
| 2186 | fix(security): auditoria Supabase 2026-10-22 — department_invites + LGPD | 9639f91a | security | ✅ PRIORITÁRIO — segurança |
| 2187 | fix(tests): corrige falhas de testes no baseline main | 32c5739b | fix/CI | ✅ PRIORITÁRIO — destrava CI |
| 2190 | fix: corrige 9 falhas de CI que mantinham a main vermelha | 750b11b9 | fix/CI | ✅ PRIORITÁRIO — destrava CI |
| 2191 | fix(e2e): auth.setup não clica mais na aba "Entrar" | 9cf05f00 | fix/e2e | ✅ válido, aguarda CI |
| 2192 | fix: guarda de vigência do teste RLS do Dashboard | 96597a05 | fix/CI | ✅ PRIORITÁRIO — destrava Contrato DB |
| 2193 | fix: testes de ChatMessagesArea e FilesTab | aa71b361 | fix/CI | ✅ PRIORITÁRIO — destrava Unit Tests |
| 2196 | feat: TalkX editor de templates e artefatos gerados (dia/2026-10-19) | 1557e851 | feat/talkx | aguarda CI |
| 2197 | ci: lote GA49–GA64 — fila-merge, actions-kpi, types-sync | e1cf8004 | ci | ATENÇÃO: toca workflows |

---

## Veredictos por Critério

### Válidos (conteúdo ainda faz sentido, não está em main)
Todos os PRs com estado BEHIND do tipo `fix/` e `feat/` listados acima como "✅ válido" — 
verificação de conteúdo: os títulos indicam correções ou features não presentes no SHA `a9ddd2f9`.

### Possível Regressão
- **#2046** (`W45: pular test/build/security/e2e/db-guard em PR draft`) — toca `.github/workflows/` (proibido pelo goal); poderia mascarar falhas em PRs draft
- **#2078** (`ci(F3): baseline strict=false`) — propõe desligar strict=true, que é a política permanente (CLAUDE.md). **Não mergear.**
- **#2147** (dirty) — body diz explicitamente "Não mergear"

### Proibidos pelo Goal (tocam `.github/workflows/`)
PRs: 1922, 1930, 1975, 2040, 2042, 2044, 2046, 2051, 2056, 2104, 2123, 2124, 2125, 2126, 2128, 2129, 2139, 2142, 2143, 2144, 2145, 2151, 2155, 2197 — e vários drafts.

### Já Implementado em Main
Nenhum identificado com certeza sem diff individual, mas PRs com títulos de "docs" (#1979, #2107, #2119, #2121, #2149) podem ser parcialmente obsoletos se os planos já foram executados.

---

## Próximos Passos

1. **[URGENTE] Desbloquear main CI** — mergear #2192 → #2193 → #2187 → #2190 em sequência. Requer desligar `strict=true` temporariamente (ou aceitar merge de BEHIND com CI local passando)
2. **[SEGURANÇA] Mergear #2186 + #2095** — auditoria Supabase e fix de code-leak em 502
3. **[DEPOIS] Mergear PRs de fix válidos** — após main CI verde, os 55 BEHIND podem ser atualizados e mergeados

---

*Análise concluída em 2026-10-23. Evidências: GraphQL `mergeStateStatus` para todos os 91 não-draft; CI baseline da main verificado na sessão anterior.*
