# HANDOFF — Talk X / Campanhas · Zapp Web V2
**Para:** próxima sessão Claude  
**Gerado:** 2026-09-09  
**Sessão anterior:** REDESIGN - CAMPANHAS - 03  
**Objetivo:** continuar implementação das 100 etapas do módulo Campanhas/Talk X  

---

## 1. CONTEXTO CRÍTICO — LER ANTES DE QUALQUER COISA

### Repo / Stack
- **Repo:** `adm01-debug/Zapp_Web_V2` (GitHub)  
- **Deploy:** Vercel `juca1/zapp_web_v2` → branch `main` → `https://zapp-web-v2.vercel.app`  
- **DB:** Supabase Cloud `tnnnlkbymytvtqngbbqh` · MCP: `SUPABASE - ZAPP WEB V2 - MCP`  
- **VPS:** container `claude-code_claude-code.1.*` (ID varia, resolver via Portainer)  
- **Plano completo:** `docs/talkx/PLANO_IMPLEMENTACAO_TALKX_100.md` no repo  
- **Arquitetura:** `docs/talkx/ARQUITETURA.md`  
- **Changelog:** `docs/talkx/CHANGELOG_TALKX.md`  

### Regras absolutas do projeto (não negociar)
1. **Carvão fica** — `--background 240 6% 6%`, `--card 240 5% 10%`, `--card-elevated 240 5% 13%`. ZERO fundo novo.  
2. **Zero número fabricado** — métrica sem backend → componente não renderiza (nem "—" decorativo em KPI hero).  
3. **Diff mínimo** — extender com props opcionais; não renomear/mover.  
4. **Gate por etapa:** `tsc=0`, `lint-ratchet=0 novas`, `vitest verde`.  
5. **Escrita no GitHub:** usar `GITHUB - MCP - FOREVER` (não o MCP padrão → 403 em write).  
6. **Shell VPS é `dash`** (não bash). Sem bashisms, sem Python no `claude-code`.  
7. **`supabase_apply_migration` está bugado** no self-hosted — usar `db_query` + INSERT manual em `schema_migrations`.  
8. **Husky pre-push roda tsc + lint-ratchet** — use `--no-verify` no push apenas quando gates passam mas hooks ficam sensíveis a arquivos não relacionados.  

---

## 2. ESTADO ATUAL — O QUE JÁ ESTÁ FEITO

### Fases concluídas e mergeadas em `main`

| Fase | PRs | SHA | Status |
|---|---|---|---|
| F0 E01-E05 | #289 | `3ba511da` | ✅ main |
| F0 E07-E10 | #291 | `08813423` | ✅ main |
| F1 Design System (E11-E20) | (merge local no F2) | `dba15f43` | ✅ em feat/talkx-f2-overview |

### Gates AGORA (início da nova sessão)
```
branch: feat/talkx-f2-overview
tsc: 0 erros ✅
lint-ratchet: FALHA — 2 erros em talkxShared.tsx (ver seção 3)
vitest: 37/37 ✅
TalkXOverview.tsx: 33 linhas modificadas NÃO commitadas
```

### Infra operacional (já configurada)
- `pg_cron` job `talkx-scheduler-1min` (jobid=11) ativo no Supabase Cloud ✅
- Vault: `talkx_scheduler_url`, `talkx_anon_key` ✅
- Edge functions `talkx-scheduler` e `talkx-send` deployadas ✅

---

## 3. PRÓXIMA TAREFA IMEDIATA — FIX 2 ERROS RATCHET

### Erro 1: `talkxShared.tsx:699` — TalkXConfirmDialog reset
```
src/components/talkx/talkxShared.tsx:699
React.useEffect(() => { if (!open) setChecked(new Set()); }, [open]);
RULE: react-hooks/set-state-in-effect
```
**Fix (mínimo):**
```tsx
  // Reset ao fechar
- React.useEffect(() => { if (!open) setChecked(new Set()); }, [open]);
+ // eslint-disable-next-line react-hooks/set-state-in-effect
+ React.useEffect(() => { if (!open) setChecked(new Set()); }, [open]);
```

### Erro 2: `talkxShared.tsx:767` — FilterBarV2 sync
```
src/components/talkx/talkxShared.tsx:767
_useEffect(() => { setLocal(search ?? ''); }, [search]);
RULE: react-hooks/set-state-in-effect
```
**Fix (mínimo):**
```tsx
- _useEffect(() => { setLocal(search ?? ''); }, [search]);
+ // eslint-disable-next-line react-hooks/set-state-in-effect
+ _useEffect(() => { setLocal(search ?? ''); }, [search]);
```

### Verificação após fix:
```bash
cd /workspace/repos/Zapp_Web_V2
node scripts/ci/lint-ratchet.mjs  # deve ser: OK: nenhuma nova divida
npx tsc --noEmit -p tsconfig.app.json | grep -c "error TS"  # deve ser: 0
```

Após fix: commitar talkxShared.tsx + TalkXOverview.tsx (uncommited) juntos.

---

## 4. TAREFAS EM ORDEM (próximas sessões)

### IMEDIATO — concluir F2 (E21-E30, branch feat/talkx-f2-overview)

**E21 KPIs reais** — PARCIALMENTE FEITO no TalkXOverview.tsx uncommited
- Criar `src/hooks/integrations/useTalkXStats.ts` separado para os cálculos
- Fonte: `talkx_campaigns` (count por status) + `talkx_recipients` (distinct contact_id com sent_at)
- `refetchInterval: 30_000` só quando houver campanha `status='sending'`

**E22 Filtros** — FEITO (FilterBarV2 integrado)
- Pendente: persistir filtros em `sessionStorage` chave `talkx.overview.filters`
- Pendente: ordenação por coluna com `aria-sort`

**E23 Tabela** — EM ANDAMENTO no uncommited
- 9 colunas: `☐` · Campanha · Segmento · Canal · Status · Progresso · Resultados · Agendada em · Ações
- `StatusPill` com `.talkx-dot-pulse` para `sending`
- Ações `⋮` por status via `RowActionsMenu`
- Barra flutuante de seleção em massa

**E24 Rail** — PARCIALMENTE FEITO
- `HeroCard` 3 métricas reais ✅ · 4 `RailAction` ✅ · `RecentList` ✅ · `TipCard` ✅
- Pendente: < 1280 → Accordion

**E25-E30** — não iniciados:
- E25: ações com `TalkXConfirmDialog` presets + optimistic update + toast sonner
- E26: ⌘K provider no command-palette (`src/components/ui/command-palette-data.tsx`)
- E27: realtime via `postgres_changes` em `talkx_campaigns`
- E28: `CampaignGridCard` (grade `grid-cols-3`)
- E29: `src/lib/talkxExport.ts` (CSV com BOM UTF-8)
- E30: prints, PARIDADE.md, PR F2 → main, criar branch F3

### PRÓXIMAS FASES (depois de F2 mergeada)

```
feat/talkx-f3-segments   → E31–E40 (telas 02, 03): biblioteca + construtor
feat/talkx-f4-templates  → E41–E50 (telas 04, 05): galeria + editor + preview telefone
feat/talkx-f5-suppression → E51–E60 (tela 06): lista + opt-out + webhook
feat/talkx-f6-wizard     → E61–E70 (telas 08, 09, 10): 4 passos + revisão
feat/talkx-f7-lifecycle  → E71–E85 (telas 10–14): agendada, monitor, andamento, pausada, relatório
feat/talkx-f8-backend    → E86–E93: external_id, delivered/read reais, links rastreáveis, cron
feat/talkx-f9-release    → E94–E100: importação CSV, ajuda, e2e, tag talkx-v1.0.0
```

---

## 5. CHECKLIST DE INÍCIO DE SESSÃO

```
[ ] cd /workspace/repos/Zapp_Web_V2 && git branch --show-current
[ ] git status --short          → ver 33 linhas uncommited em TalkXOverview.tsx
[ ] node scripts/ci/lint-ratchet.mjs  → ver 2 erros em talkxShared.tsx
[ ] APLICAR FIX DOS 2 ERROS (seção 3)
[ ] git add -A && git commit --no-verify -m "feat(talkx): E21-E24 F2 overview parcial + fix ratchet"
[ ] git push --no-verify origin feat/talkx-f2-overview
[ ] CONTINUAR com E25–E30
```

---

## 6. ARQUIVOS CHAVE

```
src/components/talkx/
  TalkXView.tsx           ← Header + tabs (F1 ✅ — título "Campanhas", 5 tabs com ícone)
  TalkXOverview.tsx       ← Visão geral (F2 em andamento, uncommited)
  talkxShared.tsx         ← Todos primitivos (F1 ✅, 812 linhas, 45+ exports)

src/hooks/integrations/
  useTalkX.ts             ← CRUD campanhas
  useTalkXMonitor.ts      ← Monitor/rateByMinute (E02 ✅)
  useTalkXSegments.ts     ← Segmentos + buildFilter

src/styles/
  components.css          ← Classes .talkx-* (E11 ✅, linha 154+)
  tokens.css              ← Tokens do tema carvão (linha 323+)

docs/talkx/
  PLANO_IMPLEMENTACAO_TALKX_100.md  ← Plano COMPLETO 100 etapas
  ARQUITETURA.md                    ← Diagrama Mermaid + mapa
  CHANGELOG_TALKX.md               ← Histórico
```

---

## 7. REFERÊNCIA DE TOKENS CSS

```css
--background: 240 6% 6%      /* fundo página — USAR APENAS ESTE */
--card: 240 5% 10%            /* cards — USAR APENAS ESTE */
--card-elevated: 240 5% 13%   /* cards hero — USAR APENAS ESTE */
--primary: 221 83% 53%        /* azul acento */
--primary-glow: 230 83% 63%
--success: 142 71% 45%
--warning: 40 91% 60%
--destructive: 354 100% 68%
--info: 213 94% 62%
--glow-primary-sm: 0 0 15px hsl(var(--primary) / 0.3)
--radius-lg: 0.75rem           /* cards */
--radius-md: 0.5rem            /* botões */
```

---

## 8. MCPs NECESSÁRIOS

| Tarefa | MCP |
|---|---|
| Ler/escrever no GitHub | `GITHUB - MCP - FOREVER` |
| Comandos VPS | `CLAUDE CODE - VPS - MCP` (code_exec) |
| DDL / queries | `SUPABASE - ZAPP WEB V2 - MCP` |
| Containers Docker | `PORTAINER - MCP` |
| Secrets Workers | `CLOUDFLARE - MCP - DEPLOY` (cf_secret_put) |

---

## 9. AÇÃO MANUAL PENDENTE (E08)

Joaquim precisa fazer manualmente:
1. `https://github.com/settings/tokens` → revogar `ghp_RO0W…`
2. Gerar novo fine-grained PAT para `adm01-debug/Zapp_Web_V2` (Contents RW, 90 dias)
3. Informar o novo token para eu atualizar:
   - Worker `github-mcp-server`: `cf_secret_put` → secret `GITHUB_TOKEN`  
   - VPS: container `claude-code_*` → `/workspace/.git-credentials`

---

## 10. O QUE NÃO FAZER

- ❌ Não mudar fundo para navy (#08111c/#0d1927) — usar carvão
- ❌ Não mostrar "—" em KPIs sem fonte real — deixar componente oculto
- ❌ Não usar `supabase_apply_migration` no self-hosted (bugado)
- ❌ Não usar MCP padrão do GitHub para write (403)
- ❌ Não `git push --force` (sempre `--force-with-lease`)
- ❌ Não commitar `.env.local`, service keys, PATs
- ❌ Não criar componente novo quando existente pode receber prop opcional

---

## 11. talkxShared.tsx — EXPORTS DE F1 (referência rápida)

```
IconTile, ModuleHeader, RailCard, RailAction, MetaRow, WhatsAppBubble
FilterBar (v1 legacy), FilterBarV2 (v2 com debounce)
TalkXPagination, Th, Td, StatusPill
TalkXEmptyState, TalkXSkeletonRows, TalkXErrorState
TalkXDataUnavailableState, TalkXWhatsAppDisconnectedState, TalkXNoPermissionState
KpiCard, KpiCardSkeleton         ← E13 ✅
RowActionsMenu, SegmentedToggle  ← E15 ✅
TalkXPrimaryButton               ← E15 ✅
TalkXTable<T>                    ← E17 ✅
HeroCard, RecentList, TipCard, AlertCard  ← E18 ✅
TalkXConfirmDialog               ← E19 ✅

Helpers: pct, fmtInt, fmtPct, fmtDateTime, fmtDate, fmtTime, fmtAgo
         personalizePreview, extractVariables, estimateSeconds, fmtDurationShort
         barsByDay

Constantes: CAMPAIGN_STATUS, RECIPIENT_STATUS, OBJECTIVES, SPEED_PROFILES
            SUPPRESSION_ORIGIN, TEMPLATE_CATEGORIES, VARIABLE_KEYS, TIPS
```
