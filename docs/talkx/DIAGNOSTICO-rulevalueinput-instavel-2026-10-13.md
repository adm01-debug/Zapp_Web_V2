# Diagnóstico: instabilidade do `RuleValueInput.test.tsx` ("em breve") — 13/10/2026

Cartão: t_cfbe9aca (worker (testes)). O cartão manda **não alterar o teste**; este documento é o
entregável (relatório curto) e nenhum arquivo de produto/teste foi tocado.

## Veredito

A falha do teste
`src/components/talkx/__tests__/RuleValueInput.test.tsx` >
`"em breve": Lead score e Risco de churn ficam desabilitados no catálogo`
**não é instabilidade por TEMPO nem por "render pesado"**. É **poluição de estado entre testes**:
a URL do construtor vaza de um teste para o seguinte, dentro do mesmo arquivo, e o teste que falha
monta numa tela onde o botão procurado não existe. A falha é **determinística pela ordem** (7 de 7
execuções vermelhas nessa ordem), não aleatória, e **independe de carga**.

## Mecanismo (cadeia causal)

1. `src/components/talkx/TalkXSegments.tsx:43-45` — a rota é lida da URL **no mount**:
   `useState(() => parseTalkXSegmentsRoute(window.location.search).route)`.
2. O teste `número "em breve" …` (`RuleValueInput.test.tsx:194`) clica em "Novo segmento" e **nunca
   fecha o construtor** (não publica nem cancela). O clique chama `openNew`
   (`TalkXSegments.tsx:111-114`) → `pushTalkXSegmentsRoute` (`:109`).
3. `src/components/talkx/segments/talkxSegmentsRoute.ts:92-94` — `window.history.pushState(...)` grava
   `?view=talkx&tab=segments&mode=new` em `window.location`. O jsdom mantém essa URL para os testes
   seguintes do **mesmo arquivo** (o `setup` não reseta `window.location`).
4. O teste seguinte (`RuleValueInput.test.tsx:205`) monta com `mode=new` no endereço →
   `activeEditing = editing ?? routedSeed` (`:63`) resolve para o construtor → o componente entra no
   ramo `TalkXSegments.tsx:158` (construtor), **não** na biblioteca (`:192`), onde vive o botão
   "Novo segmento" (`:218`).
5. `await screen.findByRole('button', { name: 'Novo segmento' })` (`:207`) espera o teto inteiro
   (`asyncUtilTimeout: 5000`, `src/test/setup.ts:152`) e falha:
   `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`.

Prova visual: o DOM impresso na falha contém o placeholder do construtor (`Nome do segmento…`) e a
trilha `Talk X › Campanhas › Segmentos` com `Voltar` — ou seja, o ramo renderizado foi o construtor.

Observação de ordem: o teste `período: atalhos 7/30/60/90/180` (linha 144) **publica**, e publicar
chama `closeBuilder` → `replaceTalkXSegmentsRoute(null)`, que limpa a URL. Por isso o teste 194 (que
roda depois dele) passa e o 205 (que roda depois do 194) falha.

## Medições

| Cenário | Execuções | Resultado |
| --- | --- | --- |
| Com o teste anterior na frente (`-t "em breve"`, arquivo inteiro, e com carga extra) | 7 | **7 falhas (100%)** |
| Sem o teste anterior (só o teste de "em breve"/churn) | 4 | **4 verdes (0%)** |

- `load average` do host durante tudo: 46 → 57 (24 CPUs, máquina compartilhada; não existe janela
  "sem carga"). Com 3 queimadores `yes > /dev/null` extras, o teste **sozinho** continuou verde
  (`Tests 1 passed`, 1,05 s de teste) e **com o predecessor** continuou vermelho (`1 failed`, 5,86 s):
  mesma carga, resultados opostos ⇒ o fator é a ORDEM, não o tempo disponível.
- Tempo até a falha: 5.098-5.124 ms, exatamente o teto de espera de 5.000 ms — o elemento não aparece
  nenhuma vez; não é "demora para aparecer".
- Verde sozinho: 823-1.050 ms de teste (montagem + `findByRole` em menos de 1 s). O total do arquivo
  (4,69-8,14 s) é dominado por import/ambiente, não pelo render do componente.

## Asserção de negócio: válida, preservar

Rodando sozinha, a asserção passa 4/4: Lead score e Risco de churn seguem visíveis, com o texto
`em breve`, `disabled`, `draggable="false"`, e clicar neles não adiciona condição. O que quebra é
apenas o **primeiro passo** (`findByRole('Novo segmento')`), antes de qualquer asserção — nenhuma
regra de negócio está em questão.

## Como consertar (para o cartão filho)

Conserto de **isolamento**, não de tempo nem de mock:

- subir `findByRole(..., { timeout: 15000 })` **não resolve**: o botão não existe naquele ramo; só
  adia o vermelho (o `testTimeout` de 15 s estoura);
- mockar a árvore TalkX **não resolve**: o ramo escolhido depende da URL do jsdom;
- mínimo que resolve: limpar a rota entre testes — por exemplo
  `beforeEach(() => window.history.replaceState(null, '', '/'))` no arquivo, ou fechar o construtor no
  fim do teste 194. Prova: rodar o arquivo inteiro e o 205 deixar de falhar.

## Reprodução (comandos e saída)

```
npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx -t "em breve"
# → Tests 1 failed | 1 passed | 3 skipped (5)   (5/5 vezes)
#   × "em breve": Lead score e Risco de churn ficam desabilitados no catálogo 5124ms
#   TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"

npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx
# → Tests 1 failed | 4 passed (5); a única falha é a 205 (5098 ms)

npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx -t "churn ficam desabilitados"
# → Tests 1 passed | 4 skipped (5)   (3/3 vezes; ~0,84 s de teste)
```
