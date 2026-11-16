# As ferramentas que produziram a auditoria

Os 329 dossiês e as 226 evidências estavam versionados; os diários que os sustentam entraram em
`../bruto/`. Faltava **a máquina**: os scripts que rodaram a auditoria. Sem eles, refazer a
análise exigia reinventar o método a partir da leitura do resultado.

Um antagonista encontrou esta lacuna depois que eu já havia declarado o contêiner limpo. Eu só
tinha varrido `.md` e `.json`, até dois níveis de profundidade — e estes arquivos são `.js`,
`.py` e `.ts` na raiz do scratchpad.

## O método

| Arquivo | O que faz |
|---|---|
| `auditar-veredito.js` | Script de Workflow da **auditoria adversarial**: para cada branch, um agente tenta *provar que sobrou trabalho de agente de IA fora da `main`* antes de a branch ser fechada. Carrega o prompt inteiro, as regras de evidência e o modo branch-viva. |
| `auditar-pr.js` | O mesmo para **PR com branch já apagada**: busca o diff por `github_compare` no SHA, já que não há ref para comparar. Difere do anterior em 22 linhas. |
| `intermediario.py` | A armadilha mais difícil da auditoria: trabalho que um commit **intermediário** adicionou e um commit **posterior da própria branch** removeu. O diff `merge-base..tip` não mostra isso. Procura linhas presentes em algum commit do meio, ausentes no tip **e** ausentes na `main`. |
| `casar-worktree.py` | Casa o nome de um worktree do PC do dono com a branch remota e o veredito do ledger, procurando cada token do nome local como substring no nome normalizado da branch. |
| `consolidar.py` | Junta o resultado das frentes paralelas num relatório único. |
| `line-check.py` / `hunk-check.py` | Conferência linha a linha e hunk a hunk em paralelo (`ProcessPoolExecutor`), usadas para validar os achados em lote. |

## Os shims de ambiente

`serve-shim.ts`, `deno-shim.d.ts`, `deno-std-assert.d.ts` registram um contorno que custou tempo
para descobrir: **o proxy do contêiner bloqueia `deno.land`**, então os testes das edge functions
não resolvem os imports da biblioteca padrão. Os shims cobrem o mínimo (`Deno.serve` é nativo no
Deno 2.x, então a assinatura usada pelos testes basta). Sem este registro, a próxima sessão
redescobre o problema do zero.

## Uma decisão registrada, não um arquivo perdido

O mesmo antagonista apontou um `states-fix.tsx` no scratchpad que não está no GitHub. Ele é
`src/components/talkx/kit/states.tsx` com exatamente duas linhas a mais:

```diff
-const CODIGO_SEM_PERMISSAO = '42501';
+export const CODIGO_SEM_PERMISSAO = '42501';
-function ehNegacaoDePermissao(error: unknown): boolean {
+export function ehNegacaoDePermissao(error: unknown): boolean {
```

**Não é trabalho perdido: é uma alternativa recusada de propósito** durante a PR #3154. Exportar
símbolo que não é componente de um arquivo que exporta componentes dispara
`react-refresh/only-export-components`. Os dois ajudantes ficaram privados e o teste passou a
exercitá-los pela porta da frente (`TalkXQueryBoundary`), que é o que o usuário realmente vê.
O arquivo em si não entra aqui — o diff de duas linhas acima preserva tudo o que ele continha.
