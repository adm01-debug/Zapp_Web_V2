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

Os quatro conjuntos foram testados novamente em cópias com outra profundidade de diretório. [Resultado da portabilidade](../evidence/portable-probe-retest-results.json). O arquivo TypeScript do cliente Functions incluído no conjunto Cross-module corresponde à versão2.117.2, fixada pelo lock auditado, e serve à reprodução de desserialização.

Os dois conjuntos adicionais Skins/Volume também passaram por [reteste de portabilidade](../evidence/secondary-portable-probe-validation.json), preservando os 307 critérios originais. Eles aceitam `RECONCILIATION_OUTPUT` para escolher a pasta dos resultados.

Testes existentes de CI, Talk X e tipografia foram executados durante a auditoria. Seus comandos e resultados estão nos arquivos `evidence/ci-contract-tests.json`, `evidence/ci-static-guards.json`, `evidence/talkx-local-checks.json` e `evidence/layout-type-checks.json`. A lista documenta o que ocorreu; não instrui repetir deploys, resets de banco ou testes externos.
