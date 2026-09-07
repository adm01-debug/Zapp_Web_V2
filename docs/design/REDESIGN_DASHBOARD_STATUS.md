# Redesign Dashboard — Navy Operational — STATUS
Branch: redesign/dashboard-navy-v1 · Base: 661219c0 (origin/redesign/contatos-navy-v2 no momento da criação do worktree; origin avançou para fa3984f1 durante a execução — registrado como divergência) · Worktree: /workspace/repos/Zapp_Web_V2-dashboard · Preview: vite preview :4174 · QA: /workspace/qa-dashboard · QA user: pendente (etapa 6) · Disco: 35G livres antes / 35G depois (etapa 3; 634 pacotes instalados em 2.40s, sem impacto mensurável no `df -h`)

## CP0 Ambiente        [ ] sha= · before=out/00-before-1583.png,00-before-1920.png · gates baseline: typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ vitest=_
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
