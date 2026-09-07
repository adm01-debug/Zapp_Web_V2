# Redesign Contatos — Navy Premium — STATUS
Branch: redesign/contatos-navy-v2 · Base: 6c917044 · Preview: <pendente após push>
Repo path (container): /workspace/repos/Zapp_Web_V2 · Playwright: ok (chromium + --with-deps instalado, sem bloqueio) · QA user: ok (login validado via /auth/v1/token)

## CP0 Ambiente        [x] sha=61d35bb955cbe999b0217477a202335efc52bc0e · before=/workspace/qa/out/00-before.png (produção, https://zapp-web-v2.vercel.app/?view=contacts, 1672x941) · gates baseline: typecheck=OK(0 erros) lint-ratchet=OK(baseline=1223 atual=1216 novas=0) tc-ratchet=OK(baseline=0 atual=0) implicit=OK(0, após fix) vitest=OK(24/24 em src/components/contacts)
## CP1 Paleta/Fonte    [ ] sha= · shot=01-after.png · colors: page=ΔE_ card=ΔE_ sidebar=ΔE_ input=ΔE_ primary=ΔE_ success=ΔE_ · fontInter=
## CP2 Shell           [ ] sha= · shot=02-after.png · sidebar=_ navItem=_ logo=_ · dashboard/inbox ok
## CP3 Header          [ ] sha= · shot=03-after.png · headerBtn=_ crmBtn=_ title=_ topSearch=_
## CP4 KPIs            [ ] sha= · shot=04-after.png · kpi=[_,_,_,_] tile=_ · total==todos: _ · lid_legacy filtro: sim|não (motivo)
## CP5 Tabs            [ ] sha= · shot=05-after.png · tabBar=_ tabActive=_ todosW=_
## CP6 Toolbar         [ ] sha= · shot=06-after.png · search=_ sort=_ filtros=_ presets=_ seg=_ colunas=_ · uma linha: sim
## CP7 Resultados      [ ] sha= · shot=07-after.png · pager=_
## CP8 Cards           [ ] sha= · shot=08-after.png · compare=08-compare.png · card=[_,_,_,_] avatar=_ footerBtn=_ colunas=4 gap=_ · badge=ΔE_
## CP9 Secundárias     [ ] sha= · shots=09-list/table/detail.png
## CP10 Motion         [ ] sha= · reduced-motion: durations=0 · bundle Δ=_ KB gz
## CP11 Fidelidade     [ ] final=11-final.png · geometria: N/N ok · cores: N/N ok · mismatch%: header=_ kpi=_ tabs=_ toolbar=_ cards=_ · light ok · mobile ok
## CP12 Entrega        [ ] PR=<url> · CI=verde · merge=<sha> · prod=12-prod.png · colors prod ok

## Divergências plano × código (o que o plano dizia vs. o que existia)
- Etapa 3: `graphify-out/GRAPH_REPORT.md` estava desatualizado no início da execução (indexado em `504fa12d`, HEAD real `6c917044`). Rodado `graphify update . --force` — grafo agora bate com HEAD (`6c917044`). `graphify path "ContactsView.tsx" "tokens.css"` (direcionado e não-direcionado) não encontra caminho: o grafo de imports/AST não enxerga o consumo de `tokens.css` porque ele é feito via classes Tailwind (`bg-card`, `border-border` etc.) e não via `import` — confirma o diagnóstico da seção 0.1 do plano (troca de componente sem tocar token não muda nada visível), mas o grafo em si não "prova" essa ligação por não rastrear `var(--x)`/classes Tailwind.
- Etapa 6: `docs/design/contatos-reference.png` não existe no repo. **E.4 (composite/heatmap) fica pulado** em todos os checkpoints; E.2 (geometria) e E.3 (cores) são os gates obrigatórios usados.
- Etapa 9: `package.json.engines.node` exige `>=24`, mas o Node do sistema é `v20.20.2`. `bun` (`1.3.14`, satisfaz `>=1.3`) está disponível e foi usado para `install`/scripts em vez de `npm ci`, conforme a alternativa já prevista na própria etapa 9 ("`npm ci` (ou `bun install --frozen-lockfile`)"). `node_modules` já estava presente e íntegro (833M, 560 pacotes); `bun install --frozen-lockfile` só completou o que faltava.
- Etapa 9 (baseline "tudo verde antes de mexer"): `npm run implicit-any-check` falhou de saída com 2 erros pré-existentes em `src/hooks/communication/useSpeechToText.ts` (TS7006, parâmetros `event` dos handlers `onresult`/`onerror` da Web Speech API), arquivo **fora do escopo do módulo Contatos** e sem relação com o redesign. `scripts/ci/implicit-any-baseline.json` registra `baseline: 0`, ou seja, a baseline documentada já estava desatualizada em `main` antes desta execução. Decisão (regra 15, código real vence + necessidade de baseline verde para todos os 12 gates futuros): corrigido com diff cirúrgico de 2 linhas (anotação explícita `event: any` + `eslint-disable-next-line @typescript-eslint/no-explicit-any`, mesmo padrão já usado no arquivo para `SpeechRecognitionInstance`), commit isolado `61d35bb9` **antes** de qualquer commit de fase do redesign. `typecheck`, `lint-ratchet` e `tc-ratchet` continuaram OK antes e depois do fix.

## Iterações do loop visual (máx 3 por fase)
-

## Pendências / resíduos (honestos)
- Fonte Inter ≠ fonte da referência (larguras ±3%)
- Fotos: avatar_url real ou iniciais (referência usa rostos gerados)
- Séries e deltas: valores reais (referência tem números ilustrativos)
-
