# Redesign Dashboard — Navy Operational — STATUS
Branch: redesign/dashboard-navy-v1 · Base: 661219c0 (origin/redesign/contatos-navy-v2 no momento da criação do worktree; origin avançou para fa3984f1 durante a execução — registrado como divergência) · Worktree: /workspace/repos/Zapp_Web_V2-dashboard · Preview: vite preview :4174 · QA: /workspace/qa-dashboard · QA user: ok (etapa 6 — `qa.visual@promobrindes.com.br`, login via `/auth/v1/token?grant_type=password` no Supabase Cloud `tnnnlkbymytvtqngbbqh` retorna `access_token`) · Disco: 35G livres antes / 35G depois (etapa 3; 634 pacotes instalados em 2.40s, sem impacto mensurável no `df -h`)

## CP0 Ambiente        [x] sha=b462174b · before=/workspace/qa-dashboard/out/00-before-1583.png,00-before-1920.png (produção, tema pré-navy — esperado, main ainda não tem Contatos) · gates baseline: typecheck=0 lint-ratchet=OK(baseline=1223,atual=1216,novas=0) tc-ratchet=OK(baseline=0,atual=0,novas=0) implicit=OK(0,baseline=0) vitest=sem arquivos de teste em src/components/dashboard, src/hooks/analytics, src/hooks/dashboard ainda (esperado — exit 1 "No test files found", não é regressão; testes chegam nas Fases 4-8) · porta 4174 livre · QA em /workspace/qa-dashboard pronto (shot.mjs/measure.mjs adaptados p/ ?view=dashboard, colors.mjs genérico)
## CP1 Fundação        [ ] sha= · shot=01-after-1583.png · gutter=_ sidebar=_ · tops dos blocos=_ · bg=ΔE_(token) card=ΔE_(token)
## CP2 Header          [ ] sha= · shot=02-after-1583.png · topBar=_ headerCard=_ tile=_ title=_ period=_ queue=_ agent=_ refresh=_ ΔE_
## CP3 Tabs            [ ] sha= · shot=03-after-1583.png · pill=_ activeW=_ oneLine@1583=_ @1920=_
## CP4 Banner          [ ] sha= · shot=04-after-1583.png · banner=_ avatar=_ levelTile=_ chips=_ · agent_stats(QA user)=xp:_ level:_ streak:_ achievements:_
## CP5 KPIs            [ ] sha= · shot=05-after-1583.png · kpi=[_,_,_,_,_] widths=_ tile=_ valueFont=_ · tiles ΔE=_ · resolvedToday(closures)=_ vs stats.resolvedToday=_
## CP6 Linha 2         [ ] sha= · shot=06-after-1583.png · row2=_ row2W=_ tile44=_ volumePlot=_ donut=_ nowRows=_ · ΔE violet=_ arco=_ · capacidade: omitida · SLA rótulo usado: _
## CP7 Linha 3         [ ] sha= · shot=07-after-1583.png · row3=_ row3W=_ tableRow=_ badge=_ activityRow=_ teamRow=_ verTodas=_ · events embed: sim|não
## CP8 Linha 4         [ ] sha= · shot=08-after-1583.png · compare=08-compare.png · row4=_ iaTile=_ csatBars=_ tile34=_ · ΔE amber=_ stars=_ csat5=_ csat3=_ · chip Ativo: fonte|omitido
## CP9 Preservação     [ ] sha= · shots=09-<9 tabs>.png,09-regress-{contacts,inbox,pipeline}.png · arquivos sem uso: _
## CP10 Motion         [ ] sha= · reduced-motion: durations=0 · bundle Δ=_ KB gz
## CP11 Fidelidade     [ ] final=11-final-1583.png,11-final-1920.png · geometria: N/N ok (1583) N/N ok (1920) · cores: N/N · mismatch%: topbar=_ header=_ tabs=_ banner=_ kpi=_ row2=_ row3=_ row4=_ · 1440/1366/mobile/light ok
## CP12 Entrega        [ ] PR=<url> (base=_) · CI=_ · contatos mergeado: sim|não · rebase=_ · merge=<sha> · prod=12-prod-1920.png · colors prod ok

## Divergências plano × código
- Etapa 1 do plano previa `git worktree add` a partir de `Zapp_Web_V2`; o worktree e a branch já existiam antes desta sessão (feitos por Joaquim/sessão anterior). Verificado com `git worktree list` e `git log -1`: worktree em `/workspace/repos/Zapp_Web_V2-dashboard`, branch `redesign/dashboard-navy-v1`, HEAD `36e3b740`, merge-base com `origin/redesign/contatos-navy-v2` = `661219c0`. Não refeito, apenas confirmado.
- `docs/design/dashboard-reference.png` e `docs/design/PROMPT_MESTRE_DASHBOARD_WIDE_24_FULLHD.md` **não existem** em `origin/main` (`git cat-file -e` retornou 128 para os dois). E.4: **pulado** (sem PNG no repo). Prompt mestre: seguindo apenas este plano (seção 2 é a fonte executável, conforme o próprio plano prevê).
- Base real no momento da execução: `origin/redesign/contatos-navy-v2` avançou para `fa3984f1` (commit `36e3b740` foi feito sobre `661219c0`). Não fazer rebase agora — plano só pede rebase na etapa 99, após merge de Contatos.
- Etapa 9 (auditoria rápida): todas as 5 divergências do plano (seção 0.2) confirmadas byte a byte no código real em 07/09: `AnimatedBadge value="1.250"` e `LevelProgress currentXP={1250} requiredXP={2000} level={12}` em `DashboardView.tsx:118,124`; `currentCapacity = 35` em `useDemandPrediction.ts:52`; zero ocorrências de `capacity|max_concurrent` em `types.ts`; `waitingCount: 0` (linha 33) e `recentActivity: []` (linha 48) em `useDashboardData.ts`; `WidgetConfigSheet.tsx`/`DraggableWidgetContainer.tsx` sem uso fora de si mesmos. Nenhuma divergência nova encontrada — plano bate com o código.
- Vitest baseline (etapa 7): `src/hooks/dashboard/` já existe no worktree (só `index.ts` + `useDashboardStats.ts`, sem os hooks novos da Fase 5-8) e não tem testes ainda; `npx vitest run` nos 3 paths retorna "No test files found" (exit 1) — não é regressão, é ausência esperada pré-redesign.

## Iterações do loop visual (máx 3 por fase)
-

## Pendências / resíduos (honestos)
- Shell (fundo/sidebar/primary) = tokens da branch de Contatos; referência do dashboard é mais neutra (ΔE 8.2 no fundo, 7.6 na sidebar) — um app, uma paleta
- Sidebar 234px (referência: 193px) — decisão do shell compartilhado
- KPI 4: tile verde + barras violeta (como na referência)
- "Capacidade máxima" omitida (sem fonte); deltas de Conversas Abertas/Não Lidas omitidos; barras de Não Lidas/Atendentes omitidas
- Frase motivacional: copy de UI (7 frases), não dado
- Emojis da referência → ícones lucide; 2 sinos → 1; tooltip do gráfico só no hover; fotos = avatar_url/iniciais
- Ícone da tab "Visão Geral" mantido (TrendingUp)
