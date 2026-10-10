# Mapa de cobertura de testes — baseline 2026-10-03

Etapa **E41** do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` ("Mapa de cobertura de testes").
Todos os números foram **contados**, não estimados: o comando está ao lado de cada um.

## 1. Baseline de contagem

| Camada | Arquivos | Testes | Comando |
|---|---|---|---|
| Suíte de contratos (`tests/`) | **58** | **1015** ✔ | `bunx vitest run --config vitest.contracts.config.ts --reporter=dot` |
| Testes de unidade/componente (`src/`) | **494** | **5946** (+38 todo) ✔ | `find src -name '*.test.ts*' \| wc -l` |
| E2E (Playwright) | **27** | — | `find e2e -name '*.spec.ts' \| wc -l` |

**Scripts disponíveis:** `test` (`vitest run`), `test:watch`, `test:coverage` (`vitest run --coverage`),
`test:contracts` (config separada). Não existe script de cobertura de *branches/lines* ratchetado no CI —
o que existe é contagem de arquivos e a suíte de contratos bloqueando o merge.

## 2. Contagem total da suíte

A contagem total da suíte principal é registrada aqui a partir de `bunx vitest run --reporter=dot`:

```
Test Files  494 passed (494)
     Tests  5946 passed | 38 todo (5984)
      EXIT=0
```

Medido em 2026-10-03 com `bunx vitest run --reporter=dot`, na main do dia. **Zero falhas.**

Motivo de separar: a suíte de contratos tem contagem estável e roda no CI como check obrigatório;
a suíte principal tem 494 arquivos e o número muda com o trabalho de outros chats em paralelo — usá-la
como *baseline* de ratchet exigiria pinar o total, o que hoje brigaria com os chats ativos.

## 3. Três módulos críticos SEM teste

Critério de "crítico" aqui: **decide autorização**. Se estiver errado, ou deixa entrar quem não devia,
ou derruba tudo. Os três são helpers compartilhados de edge function (`supabase/functions/_shared/`) —
o lugar de maior alavancagem do repo, porque uma falha vale para todas as edges que reusam o helper.

| Módulo | Por que é crítico | O que testar |
|---|---|---|
| `_shared/cron-secret-auth.ts` | É o que decide se uma chamada de **cron** pode invocar uma edge. Erra para menos → cron para de funcionar em silêncio; erra para mais → endpoint de cron fica aberto. **Usado no E91** (`searchbox-budget-alert`). | Header ausente/errado/correto; segredo vazio; timing-safe compare; ausência de `CRON_SECRET` no ambiente. |
| `_shared/evolution-go-routes.ts` | Rotas do Evolution (WhatsApp) — o caminho por onde entra mensagem de cliente real. **Candidato já apontado pelo próprio plano.** | Mapeamento rota→handler; rota desconhecida; método errado; payload malformado. |
| `_shared/ai-audio-authz.ts` | Autoriza uso de **áudio de IA** — recurso que custa dinheiro por minuto. Erro abre consumo pago para quem não deveria. | Sem sessão; sessão de outro tenant; papel insuficiente; caminho feliz. |

Nenhum dos três tem qualquer arquivo de teste (`grep -rl <nome> --include=*.test.ts tests/ src/` = 0).

### Contexto: o resto de `_shared` está bem coberto

Dos helpers verificados, a família `ai-*` tem teste em quase todos (`ai-generate` 9, `ai-usage` 8,
`ai-capabilities` 4, `ai-routing` 3…). Os "sem teste" restantes são `deno-types` (só tipos — não há o
que testar) e `edge-boot`/`effect-reconcile` (bootstrap e reconciliação — candidatos de segunda ordem,
não entraram no trio porque não decidem autorização).

## 4. Como re-medir

```bash
# contratos (estável, roda no CI)
bunx vitest run --config vitest.contracts.config.ts --reporter=dot

# total da suíte principal
bunx vitest run --reporter=dot

# módulos críticos sem teste
for b in cron-secret-auth evolution-go-routes ai-audio-authz; do
  echo "$b: $(grep -rl "$b" --include=*.test.ts tests/ src/ | wc -l)"
done
```

## 5. O que este mapa NÃO é

Não é cobertura de linhas/branches. O repo **não publica** percentual de cobertura como gate — o que
bloqueia merge é a suíte de contratos e os ratchets (`lint`, `typecheck`, `implicit-any`). Um mapa de
"quantos % do código está coberto" exigiria `test:coverage` com o relatório commitado; esta etapa
entrega a contagem e os buracos **críticos**, que é o que o plano pediu.
