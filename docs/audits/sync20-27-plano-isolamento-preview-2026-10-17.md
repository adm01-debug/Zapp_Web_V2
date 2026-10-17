# SYNC20-27 — Ambientes: plano de isolamento do Preview (plano-sync F19, remediação do SYNC20-18)

- Cartão: `t_5bb05614` · Data: 2026-10-17 · Autor: worker (ci)
- **Escopo: SOMENTE documentação.** Nenhum deploy, push, PR, merge, `vercel` de escrita, DNS, domínio,
  firewall ou variável criada/alterada/removida. Este documento **planeja**; não executa.
- **Nenhum valor de variável aparece aqui.** A unidade é sempre o NOME (`VITE_*`, `SUPABASE_*`, …); o
  endereço do projeto de produção é omitido, como já fizera o SYNC20-18.
- **Fonte dos números de hoje:** `docs/audits/sync20-18-ambientes-vercel-2026-10-17.md`
  (commit `1c6c2d755`), medido na mesma data contra a Vercel em somente-leitura. Neste cartão os números
  da Vercel não foram remedidos (isso exigiria credencial de leitura que o SYNC20-18 usou; nenhuma
  escrita foi feita lá nem aqui). O que **eu** remedi neste cartão é o lado código/repo (§4, §6).
- Base: `HEAD` = `dia/2026-10-17` (`d723a90107`), `origin/main` = `a9b4d6c6fb`, `1c6c2d755` = commit do
  achado (presente no repo, não nesta branch).

## 1. Insumos medidos (reproduzível agora)

```
git show 1c6c2d755:docs/audits/sync20-18-ambientes-vercel-2026-10-17.md      # achados P2/P3 (fonte)
git grep -n "PRODUCTION_SUPABASE_URL\|resolveLocalSupabase" -- src/config/supabase.ts
git show HEAD:.env.production | grep -oE '^[A-Za-z_][A-Za-z0-9_]*' | sort   # só NOMES (9)
git grep -n "VITE_SUPABASE_URL\|VITE_SUPABASE_PUBLISHABLE_KEY" -- e2e src
npx vitest run src/lib/__tests__/sec-fe-01-supabase-url-import-meta.test.ts  # prova da §6 (verde)
```

## 2. Estado atual medido (do SYNC20-18, 2026-10-17)

| Ambiente | Vars (por NOME) | Observação |
|---|---|---|
| Vercel **Production** | 18 | inclui `VITE_SUPABASE_URL` (marcada `Sensitive`) |
| Vercel **Preview** | 34 | inclui a mesma `VITE_SUPABASE_URL` (`Sensitive`) **+ 16 vars de outra aplicação** |
| Vercel **Development** | 0 | a app usa o banco local do WSL; não usa `vercel dev` |
| `.env.example` (versionado) | 24 | inclui `VITE_SUPABASE_URL` com o endereço de produção |
| `.env.production` (versionado) | 9 | inclui `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` |

**P2 (achado):** `VITE_SUPABASE_URL` (`Sensitive`) é injetada em Production **e** Preview. O app não a lê
(guarda `check-supabase-url-import-meta.mjs`), mas o Preview a ostenta — e quem a lê é o **E2E**
(`e2e/fixtures/supabase-env.ts`), cuja fonte primária é o `.env.production` versionado.
**P3 (achado):** 16 nomes (`POSTGRES_*`, `NEXT_PUBLIC_*`, `SUPABASE_*`) são **exclusivos de Preview**,
escopados à branch `claude/fix-promogifts-offset-503-260925-1420` (criados ~22 dias antes) — resíduo de
outra aplicação, sem relação com o Zapp Web V2.

## 3. Estado alvo por ambiente (NOMES)

Princípio: **cada ambiente declara o que aquele ambiente realmente precisa; nada mais.** Preview deixa de
ser "produção com sotaque".

**Production** — mantém apenas o que o build de produção/Edge de produção consome:
- `VITE_CRM_INTEGRATION_ENABLED` (valor decidido no merge da F16 — ver P1 do SYNC20-18),
- `VITE_EVOLUTION_API_URL`, `VITE_LOG_LEVEL`, `VITE_APP_ENV`, `VITE_APP_NAME`,
  `VITE_ENABLE_ANALYTICS`, `VITE_ENABLE_DEBUG`,
- `VITE_SUPABASE_URL` **e** `VITE_SUPABASE_PUBLISHABLE_KEY` permanecem aqui (é o endereço que o E2E de
  produção lê por `.env.production`), com a guarda do §6 impedindo que o bundle passe a depender delas.

**Preview** — alvo:
- **Remover `VITE_SUPABASE_URL`** do escopo Preview (fim do P2). Fica só em Production.
- **Remover os 16 nomes do P3** — exatamente o bloco `POSTGRES_*` (7: `POSTGRES_DATABASE`, `POSTGRES_HOST`,
  `POSTGRES_PASSWORD`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`),
  os 3 `NEXT_PUBLIC_SUPABASE_*` (`_URL`, `_ANON_KEY`, `_PUBLISHABLE_KEY`) e os 6 `SUPABASE_*` (`SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET`) = 7 + 3 + 6 = **16**. São os 16 dos 20 do bloco (A) que estão **só em Preview**,
  escopados à branch de outra app; os outros 4 do bloco (A) (`VITE_CLIENTES_SUPABASE_URL`,
  `VITE_CLIENTES_SUPABASE_ANON_KEY`, `VITE_EVOLUTION_API_URL`, `VITE_LOG_LEVEL`) ficam onde já estão.
- **Preview passa a carregar apenas** os nomes de leitura segura do app quando o build não é de produção —
  na prática, nenhum: um build da Vercel é sempre `vite build` (mode `production`, §4), então o Preview
  **não deve** receber `VITE_ZAPP_LOCAL_SUPABASE_URL`/`_ANON_KEY` (que apontariam para `localhost` e são
  inertes num build — §4), nem qualquer variável de segredo.

**Development** — alvo: **0 variáveis na Vercel** (inalterado). O dev usa `zapp-db-local env` no WSL
(`VITE_ZAPP_LOCAL_SUPABASE_URL`/`_ANON_KEY` no `.env` local, não na Vercel).

> **Consequência honesta (R1):** mesmo depois da limpeza, **um Preview da Vercel continua falando com o
> banco de PRODUÇÃO**, porque o build carrega o `.env.production` versionado (§4) e o desvio local é
> inerte sob `vite build`. Portanto o Preview da Vercel **não é** ambiente de agente: agentes usam o banco
> local do WSL. A limpeza remove o resíduo e a superfície de engano — não transforma o Preview em sandbox.

## 4. Por que o Preview fala com produção hoje (medido no código)

1. `src/config/supabase.ts:3` fixa `PRODUCTION_SUPABASE_URL` (endereço do projeto de produção) como
   **constante**; `SUPABASE_URL = LOCAL_SUPABASE?.url ?? PRODUCTION_SUPABASE_URL`.
2. `resolveLocalSupabase` (`src/config/supabase.ts:29-41`) devolve `null` quando `env.PROD` é verdadeiro
   — e todo build da Vercel roda `vite build` (mode `production`), logo `PROD = true` ⇒ desvio inerte.
3. O Vite, em `vite build`, carrega `.env.production` **versionado** (9 nomes, §2) — é dele que saem os
   valores do build do Preview também.
4. `e2e/fixtures/supabase-env.ts:46-47` lê `.env.production` como fonte **primária**; os overrides usam
   nomes dedicados `E2E_SUPABASE_*_OVERRIDE`. Rodar E2E contra outro banco exige override consciente.

Conclusão: a remoção de `VITE_SUPABASE_URL` do Preview (P2) **não** muda para onde um Preview aponta; muda
o que o Preview *ostenta* e casa o ambiente declarado com o ambiente real. O isolamento de verdade é a
regra R1 (agente usa banco local) + a guarda do §6, não a limpeza de variável.

## 5. Ordem segura de mudança (a executar por quem tem autorização — Joaquim/portão; nada rodado aqui)

Cada passo é reversível (§7) e nenhum depende de deploy.

1. **Congelar o inventário.** Rodar `vercel env ls production|preview|development` (somente nomes) e
   salvar a saída em `.tmp/` como fotografia do estado atual. Sem essa foto não há rollback verificável.
2. **Remover os 16 nomes do P3** (escopo/branch `claude/fix-promogifts-offset-503-260925-1420`). São
   resíduo de outra app; remover não afeta Zapp Web V2. Menor risco — vem primeiro.
3. **Reativar/construir o preview branco e conferir** que o build continua verde (o preview não consome
   esses nomes). Se o build de um PR quebrar, foi dependência escondida: reverter o passo 2 (rollback §7).
4. **Remover `VITE_SUPABASE_URL` do escopo Preview** (P2), mantendo-a em Production. Conferir que um novo
   preview builda e que o app segue resolvendo o banco por `src/config/supabase.ts` (guarda do §6 verde).
5. **Restringir Preview a branches internos** (fora do escopo deste doc, mas bloqueador do risco): hoje
   `previewCommentsEnabled: true` para todos os branches. Manter `gitForkProtection: true`; decidir o
   filtro de branches antes de reabrir preview para agentes.
6. **Reconciliar documentação**: atualizar `.env.example` para declarar `VITE_EVOLUTION_API_URL` e
   `VITE_LOG_LEVEL` (achado P3 do SYNC20-18) — cartão próprio, não este.

Nenhum passo altera `main`, faz push ou deploy. O passo que exige credencial de escrita na Vercel é decisão
do dono (regra: "só o Joaquim autoriza produção/migration").

## 6. Prova de isolamento preview x produção (procedimento + guarda)

**Prova já existente e verde neste cartão** (roda em qualquer PR, sem Vercel):
```
npx vitest run src/lib/__tests__/sec-fe-01-supabase-url-import-meta.test.ts
```
cobre `scripts/ci/check-supabase-url-import-meta.mjs`: prova que `src/` **não** lê
`import.meta.env.VITE_SUPABASE_URL`/`_PUBLISHABLE_KEY`. Ou seja, o bundle nunca aponta para o projeto cujo
endereço a Vercel injeta.

**Procedimento manual de isolamento (a executar com Vercel em mão, sem escrita):**
1. `vercel env ls preview --cwd .tmp/vlink` deve **não** listar `VITE_SUPABASE_URL` (P2) e **não** listar os
   16 nomes do P3.
2. `vercel env ls production --cwd .tmp/vlink` deve **manter** `VITE_SUPABASE_URL`.
3. `git grep -n "import.meta.env.VITE_SUPABASE_URL" -- src` deve continuar **vazio** (senão a guarda §6
   está afrouxada — cartão de CI).
4. Conferir que `.env.production` versionado continua a **única** fonte do E2E (`e2e/fixtures/supabase-env.ts`).

**Guarda proposta (cartão próprio, NÃO implementada aqui):** `scripts/ci/check-preview-isolation.mjs` +
`.unit.mjs`, fail-closed: falha se `VITE_SUPABASE_URL` aparecer em escopo Preview, se um dos 16 nomes do P3
reaparecer, ou se `src/` voltar a ler `import.meta.env.VITE_SUPABASE_URL`. Enquanto a Vercel não for lida
pelo CI (não temos token no runner hoje), a guarda opera sobre o lado repo (`.env*`, `src/`) e o lado
Vercel fica no procedimento manual acima.

## 7. Rollback

Tudo reversível, sem deploy:
- **Passo 2/3 (16 nomes P3):** recriar os nomes no escopo/branch de origem, com os valores guardados na
  fotografia do passo 1. Como pertencem a outra aplicação, reverter é recriar — não há dado do Zapp em
  jogo.
- **Passo 4 (`VITE_SUPABASE_URL` no Preview):** recriar `VITE_SUPABASE_URL` com escopo `Preview`
  (`Sensitive`). O valor é o mesmo endereço de produção já usado em Production — nenhum valor novo.
- **Passo 5 (restrição de branch):** voltar `previewCommentsEnabled`/filtro ao valor fotografado.
- **Nenhum passo** cria alias, DNS, domínio ou deploy: nenhum rollback precisa tocar isso.
- Critério de aborto: build de preview vermelho após o passo 3 ou 4 → reverter o passo e reabrir cartão.

## 8. Riscos e limites

- **R1:** Preview Vercel **não** é sandbox e **não** aponta para o banco local (verde por desenho depois da
  limpeza, §3). Agente continua usando o banco local do WSL.
- **P1 (SYNC20-18, fora deste cartão):** o valor de `VITE_CRM_INTEGRATION_ENABLED` diverge entre `HEAD`
  (`false`) e `origin/main` (`true`); decidir antes do merge da F16 — este plano não mexe nisso.
- **P3 de valor versionado:** `.env.production` versionado carrega o endereço+chave anon de produção
  (pública por desenho, mas é a fonte primária do E2E). Registrado, não alterado.

## 9. O que NÃO fiz e por quê

- Deploy, push, PR, merge, `vercel env add/rm`, DNS, domínio, firewall, stack: proibidos pelo cartão.
- Nenhum valor de variável foi lido, impresso ou copiado; o endereço do projeto de produção é omitido.
- Não criei a guarda `check-preview-isolation.mjs` nem toquei `.env.example`/`.env.production`/CI: o cartão
  é **somente doc**. Ambos ficam como cartões próprios (§5.5, §5.6, §6).
- Diff deste cartão: **1 arquivo novo** (este documento). Zero código, teste, guarda, baseline ou
  configuração tocada.
