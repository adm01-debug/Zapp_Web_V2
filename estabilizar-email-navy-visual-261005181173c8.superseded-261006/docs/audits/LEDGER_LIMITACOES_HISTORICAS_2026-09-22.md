# Ledger: quinze limitacoes historicas, nao quinze migrations pendentes

> Atualizacao: o [DB Live Guard 35767806526](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35767806526),
> main `102a5001`, conciliou 447 versoes: 432 satisfazem os criterios de
> evidencia do guard, 11 continuam fixadas sem prova de conteudo historico e
> os quatro avisos abaixo permanecem. A coleta viva confirmou os quatro
> nomes normalizados: uma entrada sem statements e tres com cardinalidade 1.
> Cardinalidade nao prova integridade/conteudo do SQL historico. Nenhuma
> excecao/allowlist foi ampliada. [Validacao atual](./VALIDACAO_POS_MERGE_LIBPQ_2026-09-22.md).

Fonte: [DB Live Guard 35742672654](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/35742672654),
22/09/2026 14:46 UTC, main `a11efb7d`.

- 446 versoes conciliadas.
- 431 entradas satisfazem os criterios de evidencia do guard (inclui excecoes
  pinned-replay e comment-only; nao significa 431 arquivos literalmente iguais).
- 11 entradas fixam nome e arquivo atual, sem conteudo historico recuperavel.
- 4 avisos adicionais sem SQL/hash historico verificavel.

O [inventario das 15 limitacoes](../../scripts/db-audit/ledger-history-limitations.json)
fixa os hashes **dos arquivos atuais**, sem inventar hashes de SQL historico.
E informativo, nao e allowlist adicional do guard nem prova de execucao passada.
O teste correspondente impede drift silencioso desses arquivos.

## Quatro avisos formalizados

| Versao | Arquivo | Estado |
| --- | --- | --- |
| 20260901000002 | messages_unique_dedup_index | Aviso historico; nao reaplicar |
| 20260902023200 | consolidate_rls_select_messages_contacts | Aviso historico; nao reaplicar |
| 20260902023300 | add_check_constraints_high_write_tables | Aviso historico; nao reaplicar |
| 20260907200000 | add_get_conversation_tab_counts_rpc | Aviso historico; nao reaplicar |

Os nomes normalizados passaram na CI observada; o inventario nao presume o formato
bruto de `name` no ledger. A coleta runtime acrescentada nesta rodada captura somente
version/name/cardinalidade de statements para os quatro alvos. Converter um aviso em
excecao name-and-file-pinned exige conferir esse metadado vivo e revisar expressamente
a excecao. Nao modificar `migration-evidence.json` por inferencia.

## Criterios de encerramento

O estado estrutural pode ser validado hoje pelos guardas vivos. Uma prova historica
inexistente nao pode ser recriada retrospectivamente. Encerrar como **limitacao
historica documentada**, nao como “hash historico validado”. Se surgir evidencia
autentica de execucao, manter sua origem/data e reclassificar com nova revisao.

Proibido inserir SQL/hashes fabricados no ledger, reexecutar migrations antigas ou
recriar permissoes revogadas apenas para eliminar estes avisos.
