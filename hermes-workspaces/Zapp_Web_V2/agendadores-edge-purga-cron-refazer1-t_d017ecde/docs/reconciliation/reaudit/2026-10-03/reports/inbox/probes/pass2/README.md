# Probes adicionais da segunda passagem — Inbox

Estas oito probes complementam as vinte da pasta superior, que ficaram inalteradas. O objeto da execução é o snapshot Git `da307ba5626dce892f0b37cb6762463f55d14a96`.

## Execução

```bash
node --disable-warning=ExperimentalWarning run.mjs
```

Por padrão, o runner encontra `reaudit/source` pela posição relativa da pasta. Para reproduzir em outro checkout com o mesmo HEAD e arquivos:

```bash
node --disable-warning=ExperimentalWarning run.mjs --source /caminho/do/checkout --out /caminho/results.json
```

Também aceita `SOURCE`, `INBOX_SOURCE_ROOT`, `--pins`/`INBOX_SOURCE_PINS` e `--out`/`INBOX_RESULTS_PATH`. Foi executado com Node 24.19, usando `stripTypeScriptTypes` nativo; não requer compilador `TS`, instalação de pacotes, credenciais ou rede.

## O que foi executado

| Caso | Código exercitado | Observação |
|---|---|---|
| `document_download_permission` | Query do controle de permissão e callbacks de DocumentPreview/ImagePreview | Com a permissão negada, imagem recusa antes de fetch; documento dispara fetch e anchor.download. |
| `reaction_remote_failure_accepted` | Corpos das mutações de adicionar e remover reação | Rejeição remota é absorvida depois da escrita local; callbacks seguem pela via de sucesso. |
| `signed_url_refresh_cross_source` | Hook de resolução e parser de referência do Storage | B já resolvido perde a URL quando o refresh A termina atrasado; activeState retorna loading sem erro. |
| `timeline_fixed_query_caps` | QueryFn do histórico e buildTimeline | Alterar o limite da UI não altera os caps de 500 mensagens/200 eventos. |
| `timeline_done_shown_pending` | applyTransition e buildTimeline | O estado atual `done` recebe a pill `Pendente`. |
| `gps_overwrites_newer_choice` | useLocationPicker | GPS solicitado antes substitui uma seleção manual feita depois, com o picker ainda aberto. |
| `retrieve_survives_query_change` | Hook/reducer do autocomplete e callback do LocationPicker | Digitar B durante o retrieve A não invalida a seleção A, que ainda é aplicada pelo consumidor. |
| `manual_forward_candidates_unrendered` | useLocationPicker; verificação estática do TSX consumidor | A busca manual mantém dois candidatos no estado que o componente não consome; um candidato é aplicado normalmente. |

Asserções são feitas sobre funções de produção carregadas de buffers verificados. Imports são substituídos somente nas fronteiras necessárias. O harness modela state, refs, deps e limpeza de efeitos; o caso de autocomplete também modela dispatch do reducer. O caso de reação modela `mutateAsync` e seus callbacks. Callbacks TSX são extraídos mecanicamente pelos marcadores presentes no arquivo fixado.

Nenhuma probe monta React DOM, inicia WebGL, usa GPS/microfone, conecta Supabase ou envia mensagem ao WhatsApp. Fetch, Storage, queries e geocoding são simulados. A ausência de consumidor de `searchResults` é uma evidência estática adicional, não uma alegação de renderização real. A prova de download diz respeito ao controle versionado da ação da aplicação; não prova acesso a objeto sem autorização de leitura nem uma barreira absoluta contra cópia.

## Proveniência

`pins.json` contém doze hashes Git de arquivos, derivados de `source-integrity.json`, cujo SHA-256 também fica registrado. Antes de avaliar qualquer código da aplicação, o runner:

1. Confere `git rev-parse HEAD`.
2. Confere todos os doze blobs fixados, inclusive os arquivos que só serão lidos mais tarde.
3. Guarda os buffers verificados e recusa leitura de arquivo não fixado.
4. Registra os hashes dos pins, do runner e dos arquivos carregados em `results.json`.

`python verify-provenance.py` executou dois controles negativos: um arquivo alterado mantendo o mesmo HEAD e um HEAD esperado incorreto. Ambos foram rejeitados antes da execução, sem criar o arquivo de resultados. As cópias temporárias ficam nesta pasta e são removidas; o checkout do produto permanece inalterado.

Resultados e limites são evidência de comportamento dos cenários definidos. Não estimam incidência em produção e não substituem uma validação de integração com os serviços reais.
