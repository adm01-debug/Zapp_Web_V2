# Veredito dos pares pendentes das 71 branches já fechadas — 16/11/2026

**Por que este documento existe.** As 71 branches do recibo
`analise-prs/BRANCHES-FECHADAS-261116.md` foram fechadas antes de a revisão da PR #3192
mostrar que o gate daquele fechamento era **incompleto**: ele não contava deleção de arquivo,
remoção de linha, mudança de modo nem troca de tipo. Fechar por um critério incompleto é
exatamente o risco que a regra proíbe, então as 71 foram **reauditadas com o gate corrigido**.

Todas as 71 seguem recuperáveis: o SHA do tip de cada uma está no recibo de fechamento, e os
71 foram conferidos como alcançáveis neste clone antes desta adjudicação.

## Resultado da reauditoria

| Categoria do gate corrigido | Resultado |
|---|---|
| Deleção de arquivo não incorporada | **0** |
| Remoção de linha não incorporada | **0** |
| Arquivo NOVO (a `main` não tem em caminho nenhum) | **0** |
| Blob igual, modo diferente | **2** |
| **PARCIAL** em código funcional | **58** |

O índice par a par está em `analise-prs/recuperacao-261116-parcial-71-fechadas.tsv`
(SHA do tip, caminho, linhas ausentes, tamanho da versão da branch).

### As 2 diferenças de modo não são perda

`scripts/db-audit/commit-copilot-tick.test.sh` e `copilot-rls-supervisor.test.sh` estão
`100755` na branch e `100644` na `main`. O bit de execução não é usado: `db-guard.yml:361` e
`:370` chamam os dois com `bash <caminho>`, e todos os outros `.test.sh` daquele diretório
estão `100644` na `main`. Obsoleto.

## Os 58 pares PARCIAL, adjudicados

### Recuperar — 1 par

| Par | O que é | Prova |
|---|---|---|
| `b46eabe42` · `src/components/queues/QueueAlertsDisplay.tsx` | O botão de dispensar alerta tinha `aria-label` com o **nome da fila**: `Dispensar alerta da fila ${alert.queueName}: ${alertLabels[alert.type]}`. A `main` tem `Dispensar alerta ${alertLabels[alert.type]}` (`QueueAlertsDisplay.tsx:93`), sem a fila. | Com mais de uma fila em alerta, o leitor de tela anuncia botões idênticos e o operador não sabe qual está dispensando. Melhoria real, não incorporada. Entra em PR própria. |

### Obsoleto porque a `main` está à frente — 9 pares de código de aplicação

| Par | Por quê |
|---|---|
| `1adaffb06` · `src/lib/serverLogin.ts` (20 linhas) | As 20 linhas são o comentário que justifica fixar a região da edge de login por `forceFunctionRegion`. A `main` **removeu isso de propósito** e tem teste que exige a ausência: `src/lib/__tests__/serverLogin.test.ts:44` → `expect(url).not.toContain('forceFunctionRegion')`, com o motivo em `:39` — `GR-012: forceFunctionRegion=us-west-2 causava falha de conexao DB na edge`. **Recuperar reintroduziria a falha de login.** |
| `43c34c85e` · `src/components/inbox/ChatPanel.tsx` (7) | A chamada `supabase.rpc('transfer_conversation', …)` está na `main` em `ChatPanel.tsx:401`, mais `TransferDialog.tsx:48/:80`, `RealtimeCollaboration.tsx:52` e um teste de contrato. Incorporado e refatorado. |
| `bbdf443d4` · `src/components/talkx/TalkXCampaignRunning.tsx` (7) | `useTalkXLifecycle` está na `main` em `TalkXCampaignRunning.tsx` e em mais 4 componentes TalkX. Incorporado. |
| `331ceb96f` · `src/components/talkx/TalkXView.tsx` (6) | A `main` tem as mesmas linhas **melhoradas**: `TalkXView.tsx:651/652` fazem `catch (e) { toast.error(…); throw e; }`, repropagando o erro que a versão da branch engolia. |
| `847ffd1c4` · `src/components/talkx/TalkXSegments.tsx` (8) | `selectedRowRef`, `useAudienceEstimate`, `segment-card` e "Recontar público" existem na `main` (9 ocorrências). A única diferença restante são os botões "Audiências"/"Modelos", que na branch ficavam clicáveis **sem handler** e na `main` estão `disabled` (`:402/:403`) — botão morto desabilitado é o estado correto. |
| `d088b315d`, `e808365e3` · `scripts/edge-deploy/health-check.mjs` (7 cada) | A `main` tem `buildLogsSql(slugs, matchAll = false)` (`:126`), assinatura **ampliada** em relação ao `buildLogsSql(slugs)` da branch. |
| `e83509308` · `scripts/ai-context/gerar.mjs` (5) | A `main` tem `MAX_FILE_BYTES` (`:35`), `readText` com descritor e `finally closeSync` (`:40`) — corrige o vazamento de descritor da versão da branch — e `stripComments` com lookbehind (`:52`). |
| `941d989d2` · `src/components/multiplix/MultiplixMonitor.tsx` (4) | `resumeDispatch` e `confirmResume` estão na `main` (6 ocorrências). As linhas ausentes são classes de CSS. |

### Obsoleto porque chegou por outro arquivo — 2 migrations

| Par | Por quê |
|---|---|
| `bbccc427f` · `20261031140000_copilot_sessions_brinde_state.sql` (3 de 9) | A diferença é **só acentuação**: a `main` tem a mesma DDL transliterada para ASCII. Mesmo `ALTER TABLE`, mesmo `COMMENT ON COLUMN`. |
| `d27cb593e` · `20261111181000_instance_pause_investigation.sql` (1 de 133) | A branch revogava `service_role` junto: `REVOKE ALL ON FUNCTION public.mark_pause_investigated(uuid, text) FROM PUBLIC, anon, authenticated, service_role`. A `main` revoga `service_role` numa migration **posterior** — `20261112160000_talkx_blacklist_reconcilia_e_higiene.sql:181`. **Confirmado no catálogo de produção em 16/11/2026** (consulta de leitura): a ACL é `postgres=X/postgres \| authenticated=X/postgres`, com `service_role_pode = false` e `anon_pode = false`. O endurecimento já vigora. |

### Obsoleto — 11 pares de código, diferença sem comportamento ou já incorporada

| Par | Por quê |
|---|---|
| `db7fc3750` · `external-db-proxy/index.ts` (4) | `PGRST116`, `42P01` e `42501` estão na `main` (3 ocorrências). |
| `941d989d2` · `multiplix-send/index.ts` (3) | A `main` tem a guarda do estado antes do envio (`:887-892`, via `deliveryWindowStatus(beforeSend)` com `reason: "dispatch_not_found"`) e as duas pausas, `outside_window` (`:583`) e `connection_lost` (`:347`). Incorporado e refinado. |
| `d64b521fe` · `useTalkXCommandItems.ts` (3) | Mesma intenção, chave melhor: a `main` usa `['talkx-campaigns', 'cmd-palette']` (`:39/:55/:71`) em vez da string única `'talkx-campaigns-palette'`, o que permite invalidar por prefixo. |
| `eb15216f3` · `TeamChatView.tsx` (3) | `conversationsLoading` e `deepLinkAusente` estão na `main` (6 ocorrências). |
| `3e4a44373`, `a15b724b9` · `EmailChatInbox.tsx` (2 cada) | A `main` tem a mesma auto-sincronização de labels **com guarda extra**: `:227` inclui `!needsReconnect`, para não sincronizar conta que precisa reconectar. |
| `1a77ca485` · `src/test/setup.ts` (3) | A branch mockava `clientWidth`/`clientHeight` no `HTMLElement.prototype` por causa do `@tanstack/virtual-core >= 3.19`. A `main` resolve o mesmo problema mockando `getBoundingClientRect` (`setup.ts:131-141`). **Verificado por execução** em 16/11/2026, com `virtual-core@3.19.11` instalado: `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx` → **21 testes passam**. O mock da `main` basta. |
| `ff66b4565` · `useScreenProtection.ts` (3) | As 3 linhas são comentário sobre `role="alert"` + `aria-live`. |
| `6c4610ef7` · `gmail-oauth/index.ts` (2) | Comentário de segurança sobre o `access_token` não voltar ao cliente. |
| `db7fc3750` · `cleanup-rate-limit-logs/index.ts` (1) | Linha de cabeçalho com o código da tarefa. |
| `5472e4768` · `ChatInputArea.tsx` (3) | Import, um comentário de fase e uma classe de CSS. |

### Obsoleto — 18 pares de teste, nenhum caso perdido

Comparação por **nome de caso** (`it`/`test`) entre cada versão de branch e a da `main`: 15 dos
18 pares não têm caso nenhum que a `main` não tenha. Os 3 restantes estão todos em
`src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx`, onde a `main` tem **19
casos** contra 1 a 3 da branch:

| Par | Caso "só na branch" | Onde está na `main` |
|---|---|---|
| `be0a4f5da` | `placeholder — suite existe (testes completos pendentes TL-080)` | Placeholder. A `main` implementou os 19 casos reais. |
| `97732853d` | `X164 / TL-080 — implementar testes de talkxReportData e TalkXCampaignReport` | Título de TODO, não é caso de teste. |
| `291fe3f5f` | `três gráficos + Resumo sem conversão` | Coberto e **dividido em dois** na `main`: `renderiza os três cartões gráficos quando KPIs estão disponíveis` e `hasConversionSource é false — série Conversões não é renderizada`. |
| `291fe3f5f` | `talkxReportData — agrupamento por dia/hora e grade 7x24` | Coberto por **11 casos** na `main`, de `agrupa 2 envios do mesmo dia em um único balde` a `a semana inteira mapeia uma linha distinta por dia`, incluindo a guarda `domingo cai na linha 6, nao na linha 0`. |
| `291fe3f5f` | `módulo de mocks está configurado` | Teste da própria infraestrutura do arquivo; os 19 casos da `main` rodando provam que os mocks funcionam. |

### Obsoleto — 8 pares de artefato gerado ou baseline

`supabase/deployment-manifest.json` (4 branches), `scripts/db-audit/grants-baseline.json`,
`scripts/db-audit/known-violations.json`, `scripts/ci/deno.lock` e
`supabase/functions/deno.json`. São gerados por automação: a `main` tem a versão regerada
depois, e a da branch é um retrato anterior do mesmo banco, do mesmo baseline e do mesmo
lockfile.

### Já adjudicado antes — 2 pares

`665432536` e `ec57655d5` · `src/hooks/integrations/useTalkXSuppression.ts` (109 linhas cada).
É a remoção deliberada da TL-002, com veredito em
`analise-prs/VEREDITOS-RECUPERACAO-261116.md`.

### Chame o dono — 6 pares de workflow

Por regra, workflow de CI não entra sem decisão do dono. Nenhum destes foi recuperado nem
descartado:

| Par | Linhas ausentes |
|---|---|
| `f0b5b7cd2` · `.github/workflows/e2e-logado.yml` | 207 de 311 |
| `3f3886545` · `.github/workflows/ci.yml` | 21 de 456 |
| `cee44e042` · `.github/workflows/deploy-functions.yml` | 10 de 603 |
| `f0b5b7cd2` · `.github/workflows/e2e-talkx.yml` | 10 de 104 |
| `ea3af3e1e` · `.github/workflows/deploy-functions.yml` | 8 de 590 |
| `847ffd1c4` · `.github/workflows/ci.yml` | 2 de 529 |
| `801b605aa` · `.github/workflows/deploy-functions.yml` | 1 de 641 |

## O que isto conclui, e o que não conclui

**Conclui:** as 71 branches fechadas não levaram funcionalidade embora. 57 dos 58 pares são
obsoletos com prova nomeada, e o 58º é uma melhoria de acessibilidade de uma linha que está
sendo recuperada.

**Não conclui:** os 7 pares de workflow seguem sem veredito, por regra. E este documento cobre
só as **71 branches já fechadas** — as demais branches do inventário da #3192 seguem na fila de
adjudicação.
