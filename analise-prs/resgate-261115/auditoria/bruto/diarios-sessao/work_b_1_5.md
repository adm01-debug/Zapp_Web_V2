# Prontidão para produção — Zapp Web V2

> Relatório vivo do objetivo "sistema pronto para produção". Cada item é **OK** (com a prova ao lado) ou **BLOQUEADO** (com o erro exato e o que falta). Inventário levantado do código da `main` em `81f67b0db` (2026-11-12) e do banco/infra de produção ao vivo, só leitura. As seções por categoria trazem as provas reproduzíveis.

## 1. Linha de base (antes de mexer) — `main` @ `81f67b0db`

| verificação | resultado |
|---|---|
| `npx vite build` | exit 0 (14 s) |
| `npx tsc -b --force` | exit 0 |
| `node scripts/ci/lint-ratchet.mjs` | exit 0 — baseline 803, atual 802, novas 0 |
| `npx vitest run` | exit 0 — 1864 arquivos passaram, 5 pulados; **15870 testes passaram**, 19 falhas esperadas, 41 todo |
| `npx vitest run --config vitest.contracts.config.ts` | **exit 1 — 4 falhas** em 3 arquivos (suíte fora do CI) → corrigidas nas PRs #3000, #3001, #3002 |
| `node --test scripts/ci/*.unit.mjs` | exit 0 — 7119 pass, 0 fail, 2 skipped |
| Workflows na `main` | vermelhos/sem verde: `e2e-logado` (grupo authenticated-2-of-3), `e2e-logado-isolado` (dispatch), `db-migrate` (cancelado), `crm-sync-worker` (skipped), `db-live-guard` (agendamento parado), `contexto` (runs cancelados por fila) |

## 2. Resumo do inventário

| categoria | itens | OK | BLOQUEADO |
|---|---|---|---|
| Telas e rotas | 85 | 79 | 6 |
| Edge functions | 94 | 80 | 14 |
| Banco (RLS, advisors, migrations) | 9 | 7 | 2 |
| GitHub Actions | 29 | 23 | 6 |
| Integrações externas | 15 | 8 | 7 |
| Produção ao vivo | 12 | 10 | 2 |
| "Sem pela metade" | 26 | 15 | 11 |
| Extras (storage, realtime, auth, vault, Vercel, GitHub) | 29 | 18 | 11 |

Auditoria independente: 24 provas reexecutadas por amostragem, 21 reproduziram e 2 ficaram desatualizadas pela `main` ter andado (rebaixadas e reconferidas).

## 3. Correções (PR + evidência)

| PR | o que corrige | estado |
|---|---|---|
| [#2987](https://github.com/adm01-debug/Zapp_Web_V2/pull/2987) | harness E2E isolado: 8ª rotina (`mark_outbound_post_started`) com dono `postgres` — suíte logada voltou a rodar (grupos 1 e 3 verdes no run 43210181927) | mergeada (87c5e97) |
| [#2988](https://github.com/adm01-debug/Zapp_Web_V2/pull/2988) | front compatível com o types-sync da migration 20261111160000 (types-sync verde: run 43204745973) | mergeada (0a1e73f), no ar |
| [#2991](https://github.com/adm01-debug/Zapp_Web_V2/pull/2991) | teste de navegação sem retry: 3×22 min estouravam os 55 min do controller e o erro real sumia | mergeada (cfa8959) |
| [#3000](https://github.com/adm01-debug/Zapp_Web_V2/pull/3000) | contrato cobre os 7 schemas RADAR AI | fila de merge |
| [#3001](https://github.com/adm01-debug/Zapp_Web_V2/pull/3001) | 7 edges RADAR sem o regex de backtracking (parseJsonObject) | fila de merge |
| [#3002](https://github.com/adm01-debug/Zapp_Web_V2/pull/3002) | badge do RADAR com contraste AA | fila de merge |
| [#3003](https://github.com/adm01-debug/Zapp_Web_V2/pull/3003) | chat de equipe: não-membro não vê botões inertes | fila de merge |
| [#3004](https://github.com/adm01-debug/Zapp_Web_V2/pull/3004) | "Encaminhar" arquivo funcionando nas 3 vistas | fila de merge |
| [#3005](https://github.com/adm01-debug/Zapp_Web_V2/pull/3005) | "Copiado" só no sucesso | fila de merge |
| [#3006](https://github.com/adm01-debug/Zapp_Web_V2/pull/3006) | "Copiar e-mail" com retorno | fila de merge |
| [#3007](https://github.com/adm01-debug/Zapp_Web_V2/pull/3007) | testes de NotFound, VerifyEmail e MetaCAPI | fila de merge |
| [#3009](https://github.com/adm01-debug/Zapp_Web_V2/pull/3009) | relatório da campanha Talk X ligado (campanha concluída) | fila de merge |
| [#3010](https://github.com/adm01-debug/Zapp_Web_V2/pull/3010) | contexto: `/auth` e `/2fa` deixam de sair como protegidas | fila de merge |
| [#3012](https://github.com/adm01-debug/Zapp_Web_V2/pull/3012) | testes das 12 edges sem cobertura | fila de merge |
| [#3015](https://github.com/adm01-debug/Zapp_Web_V2/pull/3015) | "Reenviar e-mail" da verificação sem e-mail vazio | fila de merge |
| Migrations aplicadas em produção (aprovadas pelo dono) | 20261107180000, 20261108100000, 20261108204000, 20261111160000, 20261111170000 — ledger e objetos idênticos aos arquivos (validação rodada 1) | aplicadas |

Cada PR acima tem teste que falha antes e passa depois, e revisão independente APROVA (registrada no corpo da PR).

## 4. PRs aguardando decisão do dono

| PR | por quê |
|---|---|
| [#2996](https://github.com/adm01-debug/Zapp_Web_V2/pull/2996) | migration 20261112170000 (resolução manual só para `sending`) + edges — aprovada pelo dono; na fila, apply após merge e deploy |
| [#3013](https://github.com/adm01-debug/Zapp_Web_V2/pull/3013) | migration 20261112171000: filtro "Cancelado" dos destinatários Talk X — aprovada pelo dono; na fila |
| [#3014](https://github.com/adm01-debug/Zapp_Web_V2/pull/3014) | migration 20261112172000: endurecimento de `talkx_suppression_reasons` e índice — aprovada pelo dono; na fila |

## 5. BLOQUEADO — depende do dono

| item | erro exato | o que falta |
|---|---|---|
| WhatsApp "Promo Brindes" (instância PRINCIPAL) | `status=disconnected`, "Reconexão automática esgotada — gere um novo QR Code" | ler o QR na tela Conexões com o celular |
| Gmail | `sync_status=reauth_required`, `invalid_grant`; `GMAIL_OIDC_AUDIENCE/EMAIL` ausentes | reconectar a conta; criar os secrets |
| Telefonia SIP | `SIP_PASSWORD` ausente → 503 `SIP_NOT_CONFIGURED` | secret |
| Bitrix (reconciliação de chamadas) | `BITRIX_WEBHOOK_URL` ausente | secret |
| Talk X rastreio de clique | `TALKX_CONVERT_SECRET`/`TALKX_LINK_BASE_URL` ausentes → 503 | secrets antes do 1º disparo |
| IA (LLM e voz) | OpenRouter/DeepSeek HTTP 402/401; ElevenLabs 401; `ELEVENLABS_AGENT_ID` ausente | créditos/chaves |
| CRM outbox | 474 pendentes, segredos do Vault ausentes | decisão W93 + segredos |
| `sicoob-bridge`, `sicoob-bridge-reply` | em produção sem código no repo | trazer fonte ou apagar |
| Workflows `db-migrate`, `crm-sync-worker`, agendamento do `db-live-guard`, dispatch `e2e-logado-isolado` (network-proof-contexts) | aprovação de ambiente / cron comentado / cron sem disparo desde 19/10 / Chromium sem rota padrão no runner | decisão no próprio workflow (regra: não mexer em CI) |
| Auth | `site_url` em host protegido pela Vercel (convite quebra); SMTP padrão (2 e-mails/h); cadastro aberto, senha mín. 6 | configuração |
| Produto | follow-up sem motor; Meta CAPI em demonstração; placeholders "em breve"; tela "API Pública" inalcançável; seletor de idioma sem tradução; 247 arquivos sem uso | decisão de produto |
| Abas "Audiências"/"Modelos" do Talk X | botões sem ação (`TalkXSegments.tsx:390-391`) | arquivo em PR aberta de outro agente (#2932); correção desenhada |
| Banco (dono) | 157 mensagens legadas presas em `sending`; anon com MAINTAIN em 104 relações; resolução manual sem autor registrado | saneamento/DDL |


---

