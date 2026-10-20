# Probes adicionais — biblioteca de mídia e stickers

Oito casos complementam as 41 provas anteriores, cujos arquivos permaneceram inalterados. Cinco achados novos (R2-INB-049–053) e duas extensões (R2-INB-042 e R2-INB-043) resultam do exame dos corpos de produção e dos consumidores. O ditado de R2-INB-044 permanece independente.

## Execução

```bash
node --disable-warning=ExperimentalWarning run.mjs
python verify-provenance.py
```

Para outro checkout idêntico:

```bash
node --disable-warning=ExperimentalWarning run.mjs --source /caminho/checkout --out /caminho/results.json
```

O runner aceita SOURCE, INBOX_SOURCE_ROOT, --pins/INBOX_SOURCE_PINS e --out/INBOX_RESULTS_PATH. Usa stripTypeScriptTypes nativo do Node 24.19 e buffers verificados; não requer instalação, credenciais ou acesso a serviços.

## Cenários

| ID | Observação | Limite |
|---|---|---|
| sticker_delete_dangles_message_reference | Excluir a entrada remove o arquivo compartilhado, mas a mensagem conserva sua URL | INSERT exato do handler de salvar e hook de exclusão reais; banco/Storage simulados com escritas autorizadas. Não reconstrói o endpoint de mídia/RLS nem afirma que toda tentativa de salvar do balão passe suas policies. A precondição é a existência da entrada compartilhada e permissão de remover o objeto. |
| media_import_insert_failure_keeps_objects | Falha no INSERT conserva objetos do upload em massa e do áudio gerado; retry cria outro | Hook de upload e callback real de salvar IA; conversão/fetch/banco/Storage simulados. O contador 0/1 do primeiro upload é honesto sobre quantidade importada; a falha comprovada é objeto órfão sem tratamento/reuso no retry. |
| sticker_mutations_ignore_errors | Favorito/categoria/exclusão de sticker seguem otimistas e anunciam sucesso após error | Extensão de R2-INB-042; corpo real de useStickerPicker e fronteiras simuladas. Não cria novo ID para o mesmo padrão de resultado ignorado. |
| sticker_close_leaves_upload | Fechamento do StickerPicker apaga pendingUpload sem remover o arquivo | Extensão de R2-INB-043. Upload/callbacks reais e ligação onOpenChange conferida literalmente; sem DOM. Não duplica o mesmo contrato já encontrado no picker de áudio. |
| media_catalog_fixed_windows | Item 1001 não pode ser encontrado; favoritos e totais refletem apenas mil linhas | Dois hooks e derivação real dos StatsCards; PostgREST modelado obedecendo order/limit. Não mede cardinalidade produtiva; ausência de paginação é conferida nos consumidores integrais. |
| private_sticker_grid_skips_resolution | Grid usa locator privado cru que o resolvedor canônico reconhece e assina | Resolvedor/parser reais, assinatura simulada e TSX do grid conferido. Estado privado vem do DDL citado no relatório. Não foi feito HTTP de imagem; não atribui erro de entrega outbound, cujo backend pode assinar a referência. |
| library_storage_delete_failure_accepted | Exclusão simples e em lote concluem a linha mesmo quando Storage devolve error | Extensão de R2-INB-042: helper/handlers reais com erro Storage resolvido. Diferente de alegar que o administrador ignora também error do DELETE da linha: esse erro é tratado. |
| library_reclassify_errors_not_counted | Erro da função de classificação recebe toast success sem contagem de erro e limpa seleção | Hook real com invoke retornando {data:null,error}; não é rejeição lançada, que o catch conta corretamente. Não afirma que houve 1/1 atualizações; o contador exibe zero, mas não distingue falha de categoria já correta. |

## Método e proveniência

Antes de avaliar código de produção, o runner verifica o HEAD e os onze blobs de pins.json, originados do manifesto source-integrity.json. A fonte é lida do buffer conferido; pedidos de arquivos não fixados são recusados. Os resultados registram hashes de runner, pins e manifesto. Dois controles negativos executados em cópias temporárias conferem rejeição antes da avaliação quando um arquivo muda mantendo HEAD ou quando o HEAD esperado é incorreto. Ambos recusaram a fonte e não geraram resultados.

Os hooks TypeScript executam em um harness de state/ref/efeitos; Supabase, Storage, conversão de imagem, IA, upload e navegador são fronteiras simuladas. Em TSX, callbacks são extraídos por delimitadores literais da fonte conferida e a ligação ao controle visível é inspecionada. Isso demonstra transições e tratamento de resultados do código fornecido, sem simular um teste de DOM ou de políticas reais.

O caso da referência compartilhada pressupõe uma entrada já salva com a URL do anexo e uma exclusão de Storage autorizada. O objeto original removido e a linha da mensagem preservada são observações do modelo offline. A policy versionada oferece ramo explícito a admin/supervisor, mas não comprova que toda tentativa de INSERT do balão seja hoje permitida nem atesta a configuração viva.

O caso da miniatura privada compara a URL crua usada nas grades com o resolver canônico que identifica esse bucket como privado. Nenhuma requisição HTTP nem renderização de imagem foi feita. Os casos de limite modelam a janela declarada de mil registros; não medem a cardinalidade real.

A exclusão administrativa trata corretamente error da linha e ignora apenas o resultado do helper de Storage. Os contadores de importação/reclassificação 0/N são numericamente honestos; a falha está em objeto abandonado ou erro de serviço não comunicado, conforme o cenário. R2-MOD-040 sobre geração tardia no AIGenerateDialog pertence à auditoria de módulos e permanece separado.

Nenhum upload, remoção, requisição de rede, uso de credenciais, áudio ou operação em banco real foi executado.
