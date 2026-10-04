# Evidências da reauditoria — 2026-10-03

Estado: **PASSAGEM FINITA CONCLUÍDA — limites preservados**. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Timestamp `2026-10-04T06:50:19+00:00`.

Leia primeiro o [relatório principal](../../REAUDIT_MICROFUNCTIONS_2026-10-03.md). `CHECKPOINT.json` fixa contagens e identifica os insumos capturados antes da compactação (`prepack_source_inputs`); esse campo não é um manifesto dos arquivos físicos finais. O [manifesto de publicação](../../evidence/ARTIFACT_MANIFEST.json) enumera os arquivos publicados e seus hashes finais. `PACKAGING_MAP.json` relaciona os bytes JSON originais aos bytes gzip de transporte. O produto não está incluído neste diretório e nenhum script de migration, deploy ou envio é executado por este guia.

## Estrutura

- `source-integrity.json`: 4.068 blobs do checkout examinado.
- `global/`: inventários estruturais, importações, delta do baseline e confronto de evidências antigas.
- `reports/`: achados, cobertura, notas de rejeição e resultados por área.
- `probes/`: runners e pins suplementares de certas áreas.
- `tools/`: geradores/probes transversais; vários probes de área ficam junto a seus relatórios.
- `consolidated/`: índices únicos de arquivos/corpos/achados e saldo de leitura.
- [global/finite-review-completion.json](global/finite-review-completion.json): gate e denominadores finais dos recortes suplementares de testes, Bash e outras linguagens.
- [reports/root/offline-probe-registry.json](reports/root/offline-probe-registry.json): índice único das provas existentes, controles e replays excluídos da soma primária.
- [reports/database/ddl_completion.json](reports/database/ddl_completion.json.gz): reconciliação da fila original de DDL, com autoria da leitura e saldo zero.

As tabelas de corpos são estruturais. `BODY_CONTAINED_IN_REVIEWED_RANGES` indica contenção nas faixas declaradas; não significa que todos os ramos passaram em teste ou que foram exercidos em produção.

## Verificação offline da cópia

Use uma cópia de trabalho para materializar JSON grandes. O comando de verificação não faz rede nem modifica o produto:

```bash
python tools/hydrate_artifacts.py --root . --verify-only
```

Para recriar os arquivos JSON originais sem sobrescrever arquivo alterado:

```bash
python tools/hydrate_artifacts.py --root .
```

Com o checkout do produto já disponível e fixado exatamente no HEAD acima, e o pacote documental anterior disponível como `PRIOR_DOCS`, a reconciliação de hashes e referências é:

```bash
python tools/consolidate_reaudit.py --source /caminho/checkout-do-produto --audit-root . --prior /caminho/PRIOR_DOCS --out ./consolidated
```

O estado final exige a reconciliação sem `--allow-in-progress` e o gate `global/finite-review-completion.json` em modo `final`, com status `COMPLETE`, nenhum erro e nenhuma pendência. O empacotador deriva `PASS` desse resultado e rejeita inputs cujo hash tenha mudado depois do gate. O gate registra conclusão da leitura finita; não é aceite do produto. A reconciliação rejeita HEAD ou blobs diferentes, faixas inválidas, IDs duplicados e referências sem evidência.

Na cópia de trabalho materializada, após a reconciliação acima, o gate finito pode ser refeito sem permitir pendências:

```bash
python tools/validate_finite_review.py --audit-root . --source /caminho/checkout-do-produto
```


## Probes transversais

Node e Python são pré-requisitos do ambiente de reprodução. Os scripts que transpilem TS recebem o caminho de uma instalação já disponível do compilador (5.9.3 no ensaio registrado); este pacote não instala ferramentas. Consulte o cabeçalho de cada runner antes de executar. Exemplos, a partir deste diretório materializado:

```bash
node tools/platform_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-platform.json
node tools/gmail_oauth_probes.cjs /caminho/checkout-do-produto source-integrity.json /caminho/typescript/lib/typescript.js /caminho/saida-gmail-oauth.json
```

Os resultados especificam as fronteiras simuladas. Callbacks isolados não substituem testes React DOM; modelos de predicados SQL não substituem PostgreSQL; respostas de fetch sintético não provam comportamento de Google/Evolution/ElevenLabs. Não execute scripts do produto para migration, exclusão, deploy ou tráfego real ao reproduzir esta auditoria documental.
