# Encerramento da Fase 8 (E83–E100) — 2026-10-02

Relatório de encerramento do `PLANO_FINALIZACAO_100_ETAPAS_2026-09-29.md`. Todo número aqui foi
**medido** (banco, CI, saída de comando ou `git`), não relatado de memória.

## 1. O que a Fase 8 entregou

| Grupo | PR | Merge SHA |
|---|---|---|
| E83+E84+E85 | #1633 | `41ed405f` |
| E86+E87+E88 | #1643 | `764a46d8` |
| E89 | #1648 | `a4d95771` |
| E99 | #1653 | `be986234` |
| E92+E96 | #1656 | `4cdf04cb` |
| E93+E94+E95 | #1659 | `9bd34aa8` |
| E91 (alerta de custo) | #1662 | `f45f29c5` |
| E68+E95 (sessão/token/busca) | #1673 | `82273c40` |
| E97 (limpeza E2E) | #1689 | `da80a9c0` |
| E98 (auditoria adversarial) | #1700 | `b5e3c50a` |

Fase 7 (E67–E82) já estava fechada antes; E91, E97, E98 e E100 são o fim da Fase 8.

## 2. O que a E98 (auditoria adversarial) encontrou

**1 defeito real, 4 frentes que resistiram com medição.** Relatório completo em
`AUDITORIA_ADVERSARIAL_E98.md`.

**Sessão fantasma (frentes 2 e 5):** `count_searchbox_sessions_this_month()` conta `audit_logs`
com `action='searchbox_session'`, gravado em `createSession()` (`mapboxSession.ts:26`) **na abertura
da sessão** — antes de qualquer requisição sair. **Medido: 3 sessões contadas com 0 requisições.**
Esse número alimenta o freio de 450 (degrada o autocomplete) **e** o alerta de 400 do E91 — logo,
os dois agem **antes de o gasto existir**. Teste pinado com `it.fails`: CI verde enquanto o defeito
existe, **vermelho quando consertarem**. O conserto é proposta, **não** entrega.

**Resistiram:** perda de dado em `contacts` (guarda do C1 intacto, writers do inbox restritos por
tipo, e testado nos dois sentidos) · estado enganoso (`toast.success` só depois do `await`) · a11y
(axe no Chromium real: 0 contraste e 0 `button-name` nos contatos) · custo (mesma raiz).

**Vão de a11y fechado:** não havia axe em `e2e/` — contraste não era medido em camada alguma capaz
de medi-lo. Agora `e2e/a11y-contraste.spec.ts` mede no navegador. **Ressalva:** medi contatos; o
**inbox não foi medido**.

## 3. E91 em produção (verificado no banco, não no relatório)

- `public.notify_searchbox_budget()` existe ✓
- `cron.job` **jobid=21**, `searchbox-budget-alert`, `'0 12 * * *'` (09:00 BRT), `active=true` ✓
- grant para `anon`/`PUBLIC`: **0** ✓
- Notificações de alerta: **0** — correto, outubro tinha 4 sessões contra o limite de 400.

## 4. E97 (resíduos de teste E2E)

Números medidos: **312** contatos `[E2E]` (288 já soft-deletados pelo próprio teste + **24 vivos**).
Limpeza aplicada por soft-delete: **23 linhas**, `vivos 26→3`, `excluidos_total 317→340`,
`[E2E] Contato de teste - nao apagar` **intacto**. O defeito real era o `dialog-rodape` criar
resíduo **só no EDIT** (o `finally` existia, mas a limpeza via `page.request` morria com a página e
`.catch(() => [])` engolia o erro): reproduzido (2 resíduos) e consertado (0). Verificado na main:
`catch(() => [])` = **0 ocorrências**.

## 5. O que ficou de fora — com dono e motivo

| Item | Por quê | Dono |
|---|---|---|
| **E65** — 4º print do teclado virtual | precisa de aparelho real | Joaquim |
| **E90** — restrição de token no painel Mapbox | depende do painel (403 depois) | Joaquim |
| **E94** — envio real de localização no WhatsApp | exige enviar para número real | Joaquim |
| **Canal de e-mail do E91** | falta `searchbox_alert_cron_secret` (Vault) + `CRON_SECRET`; hoje devolve **403** | Joaquim |
| **Conserto da sessão fantasma** | achado da E98; pinado com teste, não corrigido | próxima tarefa |
| **Contraste no inbox** | a E98 mediu contatos; o inbox tem 7 achados SERIOUS anotados | próxima tarefa |

## 6. Integridade do processo

- Todo merge foi feito por `hermes-tarefa-mergear`; nenhum commit em `main`; nenhum PR draft.
- Migrations da sessão aplicadas pelo caminho sancionado: `20260930210000`, `20260930260000`,
  `20260930280000`, `20260930300000`, `20260930470000`, `20260930760000` e
  `20261002601230_searchbox_budget_alert_cron.sql` (classe `contrato`, aplicada pós-merge).
- Ratchets em todos os incrementos: `typecheck novas=0`, `lint novas=0`.

## 7. Erros meus, registrados

1. **Reportei "309 resíduos" E2E** contando linhas em vez de **vivas** — o real eram **24**.
2. **Reportei que o guarda do C1 não tinha teste** — tinha (6 casos). Procurei **nome de
   implementação** em vez de comportamento: grep de símbolo não mede cobertura.
3. **Um dev server zumbi meu** ocupou a porta 5211 servindo um workspace já apagado (HTTP 404),
   quebrando o Playwright. Causa: matei o processo pai e o filho sobreviveu. Regra nova: matar pelo
   PID que **realmente ocupa a porta** (`ss -ltnp`).
4. **`.vite` sobreviveu ao `hermes-tarefa-limpar`** e manteve a guarda vendo "tarefa aberta".
   Conferir o disco **depois** de limpar.

## 8. Conclusão

As 100 etapas do plano estão com item cumprido, **exceto** os quatro itens que dependem de decisão ou
aparelho do Joaquim (E65, E90, E94, segredo do e-mail do E91) e os dois achados que a própria
auditoria adversarial produziu (conserto da sessão fantasma e contraste do inbox) — que por
definição nasceram na última etapa e pertencem à próxima rodada de trabalho, não a esta.
