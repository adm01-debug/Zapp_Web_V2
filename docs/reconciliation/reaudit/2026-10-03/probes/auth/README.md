# Offline source probes — Auth

Executa dez casos sobre a fonte real transpilada ou closures extraídas, com Auth/DB/rede/storage/React simulados explicitamente. Nenhuma credencial ou registro real é necessário. Os oito primeiros estão em `source-probes.cjs`; a segunda passagem acrescenta dois casos em `second-pass-probes.cjs`.

Antes de transpilação/execução de fonte de produto, valida:

1. SHA-256 do manifesto de integridade contra `source-pins.json` persistido.
2. HEAD do manifesto contra os pins; quando há `.git`, também HEAD real do checkout.
3. Todos os arquivos de produto lidos/executados contra hashes Git e tamanhos esperados. Fonte é carregada em memória somente após validar.
4. Revalida hashes ao registrar resultado para recusar mudança durante a execução.

O checkout desta auditoria contém `.git`: o HEAD real foi validado, junto ao manifesto que verificou os 4068 blobs. Em uma cópia materializada sem `.git`, o modo e a ausência de HEAD consultável ficam explícitos no resultado. Os 15 pins de `source-pins.json` e os 7 pins de `second-pass-pins.json` cobrem os módulos consumidos pelos programas correspondentes. `pin-negative-result.json` comprova que uma cópia alterada é recusada antes de criar resultado pelo preflight do primeiro programa; o segundo preserva o mesmo mecanismo de verificação.

## Reprodução

```bash
REAUDIT_SOURCE_ROOT=/caminho/reaudit/source \
REAUDIT_SOURCE_PINS=/caminho/reaudit/probes/auth/source-pins.json \
REAUDIT_INTEGRITY=/caminho/reaudit/source-integrity.json \
REAUDIT_TYPESCRIPT=/caminho/node_modules/typescript \
REAUDIT_OUTPUT=/caminho/results.json \
node /caminho/reaudit/probes/auth/source-probes.cjs
```

Para os dois casos novos:

```bash
REAUDIT_SOURCE_ROOT=/caminho/reaudit/source \
REAUDIT_SOURCE_PINS=/caminho/reaudit/probes/auth/second-pass-pins.json \
REAUDIT_INTEGRITY=/caminho/reaudit/source-integrity.json \
REAUDIT_TYPESCRIPT=/caminho/node_modules/typescript \
REAUDIT_OUTPUT=/caminho/second-pass-results.json \
node /caminho/reaudit/probes/auth/second-pass-probes.cjs
```

`P-AUTH-09` executa o componente `EditableField` e o callback de gravação reais com hook slots/árvore JSX sintéticos: o enriquecimento posterior do contato deixa o rascunho inicial vazio e salvar grava esse vazio. `P-AUTH-10` executa `saveRules` e `fetchRules` reais contra um SDK de gravação sintético: falha no INSERT após DELETE perde o conjunto, e a ação Alertar não sobrevive ao round-trip. Os resultados estão em `second-pass-results.json`; não houve navegador, banco ou serviço real.

Os paths de fonte, pins, manifesto e resultado têm defaults relativos ao script. A dependência TypeScript tem fallback para o runtime disponibilizado na auditoria; passe `REAUDIT_TYPESCRIPT` ao reproduzir em outro ambiente. `results.initial.json` preserva o resultado anterior ao reforço de proveniência; `results.json` é a execução com preflight. Não alterar pins para fazer uma fonte divergente passar; novos commits requerem nova auditoria/pins explícitos.

## Limites

Os probes não acessam Supabase nem Singu e não são testes E2E/biométricos. Os campos de limitação de cada caso explicam as fronteiras simuladas. Isso comprova mecanismos da fonte e ordenamentos adversos; não comprova que o incidente já ocorreu em uma implantação.
