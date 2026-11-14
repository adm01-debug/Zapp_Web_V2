# Relatório /merge-prs — Zapp Web V2 (sessão de 11–12/11/2026)

## Resultado
- **Início:** 30 PRs abertas em `main` = `bd62fc9d9` (11/11 23:52 UTC).
- **Esta sessão mergeou 1 PR própria:** [#2974](https://github.com/adm01-debug/Zapp_Web_V2/pull/2974) → `a082adc17` (corrige o vermelho herdado da `main`). CI no SHA do merge: todos os checks `success`.
- **Execução interrompida:** outro agente processa o mesmo backlog em paralelo (mergeou 6 PRs, fechou 2 e abriu supersedes #2976/#2977). Continuar geraria supersedes duplicados e corrida de merges com `strict=true` (cada merge invalida o CI da outra fila). Esta sessão parou e entrega a análise.

### Contagem — estado das 30 PRs iniciais (lido ao vivo em 12/11 ~08:15 UTC)
| Estado | Qtd | PRs |
|---|---|---|
| Mergeada por outro agente | 6 | #2847, #2865, #2835, #2881, #2946, #2919 |
| Fechada sem merge por outro agente (supersedida) | 2 | #2811 (→ #2976), #2879 (→ #2977) |
| Aberta | 22 | demais |
| **Total** | **30** | |

### Veredito da Fase A (dossiê + verificador adversarial independente)
| Veredito | PRs |
|---|---|
| MERGEAR (falta só update de branch + CI verde) | #2553, #2813, #2818, #2856, #2869, #2944, #2946✓, #2968 |
| CORRIGIR+MERGEAR | #2555 (E2E `talkx-launch.spec.ts` com rótulos antigos), #2881✓ (commits de diário em PENDENCIAS/RELATORIO_CI), #2929 (asserção vazia no teste PB-15 + indentação), #2970 (só update de branch) |
| AGUARDANDO HUMANO | #2556 (congelamento Talk X do dono), #2811✗ (edge Gmail), #2838 (workflows), #2846 (guard de CI que pede decisão do dono), #2859 (migration), #2879✗ (edge ponte CRM), #2880 (edges WhatsApp/Gmail/Talk X), #2894 (Dependabot + workflows; bundle estourado), #2919✓ (workflow novo), #2932 (ci.yml + eslint-baseline), #2943 (ci.yml), #2969 (migration), #2971 (types-sync desfaria tipos da #2817) |
| JÁ IMPLEMENTADA / mergeada | #2835✓ (contida na #2838) |
| DESCARTAR | #2883 (corrige falha inexistente: chromium-mapa verde na main sem a mudança) |
| REGRESSÃO | #2972 (adiciona `eslint-disable`/`any`; também migration + edge WhatsApp) |

✓ = mergeada por outro agente · ✗ = fechada por outro agente.

**Mergeadas por outro agente que pela regra 4 eram AGUARDANDO HUMANO:** #2865 (edge `external-db-proxy`, ponte CRM), #2835 (`.github/workflows`), #2919 (workflow novo). Não houve OK do dono registrado nesta sessão.

## Vermelho herdado da `main` (Fase 0)
- `E2E logado` (`e2e-logado.yml`, pós-merge) falhava nos 3 grupos `authenticated` desde `9727aaedd`: `routine-ownership-failed` (`scripts/e2e-isolated/run.mjs:639`).
- Causa: `supabase/migrations/20261111160000_outbound_post_started.sql:225` redefine `claim_outbound_message`; o gate `scripts/e2e-isolated/routine-ownership.mjs` fixava o hash antigo. Hash novo lido do `routine-ownership.json` do artefato 13899618188.
- Correção: #2974 (só o hash; teste que confere JS × SQL passou; 3828 testes `e2e-isolated*.unit.mjs` ok).
- **Depois do merge:** a fase `restore-versioned-routine-owners` passa; os 3 grupos agora param em `seed-suite-and-verify-providers` (`code: verify-providers`, run 43180553304). Segunda causa, antes mascarada — **não corrigida aqui** (o outro agente já mexe nesse fluxo, #2975).

## Tabela PR × veredito × estado
| PR | Título | Veredito verificado | Estado final |
|---|---|---|---|
| [#2553](https://github.com/adm01-debug/Zapp_Web_V2/pull/2553) | feat: migrar Dialog→TalkXDialogShell em Supressão e TemplateEditor (X0 | MERGEAR | ABERTA |
| [#2555](https://github.com/adm01-debug/Zapp_Web_V2/pull/2555) | feat: unificar ciclo de vida de campanha em useTalkXLifecycle nas 5 te | CORRIGIR+MERGEAR | ABERTA |
| [#2556](https://github.com/adm01-debug/Zapp_Web_V2/pull/2556) | feat: E2E reload test para preservação de rota URL (X052) | AGUARDANDO HUMANO | ABERTA |
| [#2811](https://github.com/adm01-debug/Zapp_Web_V2/pull/2811) | fix(gmail-oauth): remove exposição de access_token no refresh | AGUARDANDO HUMANO | FECHADA sem merge por outro agente |
| [#2813](https://github.com/adm01-debug/Zapp_Web_V2/pull/2813) | fix(inbox): toast neutro em RLS e undo dois passos no bulk archive | MERGEAR | ABERTA |
| [#2818](https://github.com/adm01-debug/Zapp_Web_V2/pull/2818) | fix(team-chat): deep-link ?cid= abre conversa correta ao clicar na not | MERGEAR | ABERTA |
| [#2835](https://github.com/adm01-debug/Zapp_Web_V2/pull/2835) | chore(scripts): READMEs, renomear .test→.unit, testes ausentes | JÁ IMPLEMENTADA | MERGEADA por outro agente (daba6eb8c) |
| [#2838](https://github.com/adm01-debug/Zapp_Web_V2/pull/2838) | chore(inventario): atualiza edges.json e rotas.json via auditoria de s | AGUARDANDO HUMANO | ABERTA |
| [#2846](https://github.com/adm01-debug/Zapp_Web_V2/pull/2846) | chore(ci): guard GA02 passa a checar referência órfã e skills idêntico | AGUARDANDO HUMANO | ABERTA |
| [#2847](https://github.com/adm01-debug/Zapp_Web_V2/pull/2847) | feat(talkx): conectar RPCs analytics ao front — ranking, top segmentos | — (mergeada antes da Fase A) | MERGEADA por outro agente (7e128bc40) |
| [#2856](https://github.com/adm01-debug/Zapp_Web_V2/pull/2856) | feat(talkx): prancha TalkXKit — filtros dinâmicos e KPIs reais (X056/X | MERGEAR | ABERTA |
| [#2859](https://github.com/adm01-debug/Zapp_Web_V2/pull/2859) | fix(security): revoga 99 grants SELECT de anon em todas as tabelas púb | AGUARDANDO HUMANO | ABERTA |
| [#2865](https://github.com/adm01-debug/Zapp_Web_V2/pull/2865) | fix(edges): substitui esm.sh por npm: nas 2 edge functions restantes | — (mergeada antes da Fase A) | MERGEADA por outro agente (71123cc07) |
| [#2869](https://github.com/adm01-debug/Zapp_Web_V2/pull/2869) | fix(talkx): isola queryKeys do cmd-palette para evitar cache poisoning | MERGEAR | ABERTA |
| [#2879](https://github.com/adm01-debug/Zapp_Web_V2/pull/2879) | fix(edge): valida coluna e operador em external-db-bridge para fechar  | AGUARDANDO HUMANO | FECHADA sem merge por outro agente |
| [#2880](https://github.com/adm01-debug/Zapp_Web_V2/pull/2880) | fix(security): sanitiza error.message vazado em gmail-webhook, multipl | AGUARDANDO HUMANO | ABERTA |
| [#2881](https://github.com/adm01-debug/Zapp_Web_V2/pull/2881) | fix(e2e): aguarda requestAnimationFrame antes de medir contraste no we | CORRIGIR+MERGEAR | MERGEADA por outro agente (13a00e06a) |
| [#2883](https://github.com/adm01-debug/Zapp_Web_V2/pull/2883) | fix: habilitar geolocation no projeto chromium-mapa do Playwright | DESCARTAR | ABERTA |
| [#2894](https://github.com/adm01-debug/Zapp_Web_V2/pull/2894) | ⬆️ deps: Bump the deps-semanal group across 1 directory with 16 update | AGUARDANDO HUMANO | ABERTA |
| [#2919](https://github.com/adm01-debug/Zapp_Web_V2/pull/2919) | ci(talkx): ativa validação do corpo das PRs Talk X | AGUARDANDO HUMANO | MERGEADA por outro agente (0d65d5737) |
| [#2929](https://github.com/adm01-debug/Zapp_Web_V2/pull/2929) | fix: evita 409 ao gravar notificação de meta duplicada (pré-check de d | CORRIGIR+MERGEAR | ABERTA |
| [#2932](https://github.com/adm01-debug/Zapp_Web_V2/pull/2932) | fix(eslint): no-secret-compare ignora modificadores de teclado (key/ct | AGUARDANDO HUMANO | ABERTA |
| [#2943](https://github.com/adm01-debug/Zapp_Web_V2/pull/2943) | fix(inventario): edge chamada só por cron+Vault não é mais sem_chamado | AGUARDANDO HUMANO | ABERTA |
| [#2944](https://github.com/adm01-debug/Zapp_Web_V2/pull/2944) | fix(regras_negocio): bloco de código sem fechar em manual/ engolia o d | MERGEAR | ABERTA |
| [#2946](https://github.com/adm01-debug/Zapp_Web_V2/pull/2946) | fix(edge-deploy): contagem de valor literal redigido mentia no log do  | MERGEAR | MERGEADA por outro agente (2942f2128) |
| [#2968](https://github.com/adm01-debug/Zapp_Web_V2/pull/2968) | fix(auth): esqueci minha senha volta a entregar o pedido ao gestor | MERGEAR | ABERTA |
| [#2969](https://github.com/adm01-debug/Zapp_Web_V2/pull/2969) | fix(talkx): bloquear destinatário passa a funcionar e fica restrito ao | AGUARDANDO HUMANO | ABERTA |
| [#2970](https://github.com/adm01-debug/Zapp_Web_V2/pull/2970) | feat(ci): ci local roda na máquina os mesmos passos dos workflows do g | CORRIGIR+MERGEAR | ABERTA |
| [#2971](https://github.com/adm01-debug/Zapp_Web_V2/pull/2971) | chore(db): sincronizar artefatos derivados do banco | AGUARDANDO HUMANO | ABERTA |
| [#2972](https://github.com/adm01-debug/Zapp_Web_V2/pull/2972) | fix(message-delivery): pd-79 compatível antes da migration e resolve s | REGRESSÃO | ABERTA |
## NÃO VERIFICADO
- Quem cancelou os runs de DB Guard em fila em 12/11 01:00–02:00 UTC (≈10 cancelamentos sem run mais novo no mesmo grupo de concorrência).
- Se a edge `message-delivery` em produção está falhando por ler colunas/RPC da migration `20261111160000` ainda não aplicada (`index.ts:660,711`); a #2972 trata, mas tem regressão de lint.
- Typecheck/lint locais não substituem o CI; o CI completo das PRs MERGEAR roda só após o update de branch.

## Desvios desta sessão
- `update_pr_branch` na #2883 (alheia) antes da regra de supersede chegar — só merge de `main`, sem mudança de conteúdo; a Fase A depois classificou a #2883 como DESCARTAR.
- Nenhuma PR alheia editada, fechada, comentada ou force-pushed. Nenhum teste, workflow, baseline ou allowlist alterado: o único código mergeado é o hash em `scripts/e2e-isolated/routine-ownership.mjs` (#2974).

## Bugs fora de escopo encontrados
- `e2e/navegacao-modulos.spec.ts:1329/1407` (grupo authenticated-2): 409 em `notifications` (a #2929 trata) e requests a `fonts.googleapis.com`/`va.vercel-scripts.com` bloqueados na rede fechada do E2E.
- `scripts/db-audit/talkx-e27-replay-divergence.test.sh`: Postgres descartável instável no DB Guard (falhou 2×, passou no rerun).

## Arquivos
- `analise-prs/prs.json` — estado inicial, vereditos e estado final por PR
- `analise-prs/dossies/pr-<n>.md` — 29 dossiês (Fase A, versão compacta)
- `analise-prs/baseline/main.json` · `analise-prs/progresso.json`
- `.claude/commands/merge-prs.md` — o comando executado
