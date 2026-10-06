# Reprodução e verificação do pacote

Os probes usam o baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, Node 24 com remoção de tipos TypeScript e Python 3. Eles leem código do checkout e usam entradas sintéticas. As operações de banco e provedor são simuladas ou bloqueadas; nenhum segredo de ambiente é necessário.

**Exit 0 significa que o probe reproduziu os resultados esperados pelo auditor.** Alguns resultados esperados são defeitos do produto. O probe não certifica o SQL vivo, o deployment ou a entrega real de mensagens.

## Integridade documental

Na raiz do checkout que contém a documentação:

```bash
python docs/reconciliation/reproduce/validate_package.py
```

Para conferir também hashes e linhas das fontes, forneça um checkout que contenha os objetos Git históricos referenciados. Ele pode estar detached no baseline; a validação usa `git show` e não muda a árvore de trabalho:

```bash
python docs/reconciliation/reproduce/validate_package.py --repo /caminho/do/checkout-auditado
```

O validador usa Python 3.9 ou superior e verifica o pacote que contém o próprio script; não aceita `--package`. A consulta opcional às fontes requer Git em `/usr/bin/git` ou `/bin/git`, sem busca pelo `PATH`. Caminhos declarados nos planos e no manifesto devem ser relativos e permanecer dentro da raiz correspondente. Referências de objetos Git aceitam somente IDs hexadecimais fixados, de 7 a 40 caracteres; links simbólicos não podem levar a leitura para fora do pacote.

Sem `--output`, o resultado é exibido apenas na saída padrão. Para também salvar o relatório, use a opção sem argumento de caminho:

```bash
python docs/reconciliation/reproduce/validate_package.py --repo /caminho/do/checkout-auditado --output
```

O único destino de gravação é `evidence/artifact-validation.json` dentro deste pacote. O validador recusa um link simbólico nesse destino ou na pasta `evidence`.

O [resultado desta entrega](../evidence/artifact-validation.json) e a [revisão independente](../evidence/independent-consolidation-review.json) registram as verificações feitas. O manifesto SHA256 cobre os arquivos entregues, exceto o próprio manifesto.

## Probes em uma cópia temporária

Alguns probes escrevem o resultado ao lado do próprio script. Copie este diretório para uma pasta temporária antes de executá-los. `RECONCILIATION_REPO` deve apontar para o checkout original, preservado no baseline acima.

```bash
export RECONCILIATION_REPO=/caminho/do/checkout-auditado
RECONCILIATION_PROBES=$(mktemp -d)
cp -R /caminho/da/documentacao/reproduce/. "$RECONCILIATION_PROBES/"

python "$RECONCILIATION_PROBES/other/reproduce_findings.py"
node --experimental-strip-types "$RECONCILIATION_PROBES/other/reproduce_findings.mjs"
node --experimental-strip-types "$RECONCILIATION_PROBES/transversal/local-semantic-probes.mjs"
node --experimental-strip-types "$RECONCILIATION_PROBES/cross-module/reproduce_cross_module.mjs" "$RECONCILIATION_REPO"
node --experimental-strip-types "$RECONCILIATION_PROBES/multiplix/reproduce_multiplix.mjs" "$RECONCILIATION_REPO"
node --experimental-strip-types "$RECONCILIATION_PROBES/skins/skins_probe.mjs"
node --experimental-strip-types "$RECONCILIATION_PROBES/volume/volume_offline_probe.mjs"
```

| Conjunto | O que reproduz | Limite |
| --- | --- | --- |
| Other | Seleção/encaminhamento, invalidação, Gmail207 e exportação com empate | Função ou expressão extraída; sem React, banco ou rede. |
| Transversal | Estado GO e escolha de token com várias conexões | Import direto e fetcher em memória com credenciais fictícias. |
| Cross-module | Arquivos, filtros/áudio Telefonia, Gmail e contraexemplo Dashboard | Consumidores/SDK examinados localmente; modelo SQL não é execução PostgreSQL. |
| Multiplix | Worker, payload por bloco, variável ausente e429 | Worker real com helpers de teste; mocks não provam RLS nem conclusão SQL. |
| Skins | Persistência de presets, falha de quota e formato JSON null | Módulo real com DOM/storage/estado de hook simulados; sem renderização no navegador. |
| Volume | Store, binding e liberação de AudioContext | WebAudio e players simulados; sem audição real em aparelho. |

## Proveniência das fontes (R2-INF-015)

`other/source-pins.json`, `transversal/source-pins.json` e `volume/source-pins.json` fixam o commit auditado (`baseline_sha`) e o SHA-256 de cada arquivo que o probe lê ou importa — inclusive o import transitivo (`evolution-go-routes.ts`). Antes de qualquer leitura, import ou execução o probe confere o HEAD do `RECONCILIATION_REPO` e os bytes de cada fonte e, se algo divergir, sai com `Provenance refusal` sem publicar relatório. O relato separa o hash esperado, o observado e o código que o harness adaptou, e `network_requests` é a contagem medida de tentativas de rede bloqueadas, não um `0` declarado. Para reproduzir outro commit, atualize os três `source-pins.json` de forma explícita e revisada: trocar o caminho do checkout não basta. A biblioteca compartilhada é `lib/source-provenance.mjs`.

Os quatro conjuntos foram testados novamente em cópias com outra profundidade de diretório. [Resultado da portabilidade](../evidence/portable-probe-retest-results.json). O arquivo TypeScript do cliente Functions incluído no conjunto Cross-module corresponde à versão2.117.2, fixada pelo lock auditado, e serve à reprodução de desserialização.

A referência do SDK é preservada em `supabase-functions-client-2.117.2.ts.txt`, com os bytes originais. O probe lê esse dado e remove os tipos somente na cópia de execução. Essa separação mantém o código de terceiro como evidência e evita introduzi-lo no conjunto de fontes de aplicação verificado pelo ratchet de lint. Nenhuma regra ou baseline foi relaxado.

Cross-module e Multiplix exigem a raiz do checkout no baseline indicado, Git em `/usr/bin/git` e os hashes fixos de todas as fontes antes de executá-las. Skins também confere previamente os quatro fontes por SHA256. As entradas aceitas são os bytes revisados; os scripts não funcionam como avaliadores de código arbitrário. Os testes de compatibilidade e de recusa estão em [hardening dos artefatos](../evidence/publication-harness-hardening.json), com contexto na [validação da publicação](../reports/git/PUBLICATION_VALIDATION.md).

Os dois conjuntos adicionais Skins/Volume também passaram por [reteste de portabilidade](../evidence/secondary-portable-probe-validation.json), preservando os 307 critérios originais. Eles aceitam `RECONCILIATION_OUTPUT` para escolher a pasta dos resultados.

Testes existentes de CI, Talk X e tipografia foram executados durante a auditoria. Seus comandos e resultados estão nos arquivos `evidence/ci-contract-tests.json`, `evidence/ci-static-guards.json`, `evidence/talkx-local-checks.json` e `evidence/layout-type-checks.json`. A lista documenta o que ocorreu; não instrui repetir deploys, resets de banco ou testes externos.
