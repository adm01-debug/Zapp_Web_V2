# Probes offline — quinta passagem Inbox/Chat

Esta passagem acrescenta **15 casos**, preservando os 49 casos anteriores. Há provas de 11 achados novos (R2-INB-054–064), duas variantes com pares de produtores/condições, uma extensão da família R2-INB-009 e um contrato condicional de Sussurro que **não foi contado como falha de jornada ativa**. O número de casos não é uma contagem de bugs nem de testes de navegador.

## Reprodução portátil

É necessário Node com `node:module.stripTypeScriptTypes` (execução registrada em Node 24.19). Não há dependência de Vitest, React instalado ou compilador TypeScript externo. Na raiz dos artefatos:

```bash
node --disable-warning=ExperimentalWarning probes/pass5/run.mjs --source /caminho/do/checkout --pins probes/pass5/pins.json --out /caminho/do/resultado.json
SOURCE=/caminho/do/checkout python probes/pass5/verify-provenance.py
```

O runner aceita `SOURCE`/`INBOX_SOURCE_ROOT` ou `--source`, `INBOX_SOURCE_PINS` ou `--pins`, e `INBOX_RESULTS_PATH` ou `--out`. Sem parâmetros, usa o checkout relativo ao pacote (`../../../../source`) e os pins/resultados ao lado do script. O processador TypeScript vem do Node; não depende de um caminho `/workspace` anterior nem de `TS` externo.

**Antes de avaliar código da aplicação**, verifica HEAD e os 35 blobs Git de `pins.json`, derivados do manifesto de integridade do snapshot. Os buffers verificados ficam em memória; `source()` recusa paths sem pin. O resultado registra HEAD observado e SHA-256 do runner/pins. Os dois controles negativos de `verify-provenance.py` recusam uma cópia local com blob alterado mantendo o HEAD e um HEAD esperado incorreto, sem produzir resultado positivo. Não alteram o checkout auditado.

## Método e fronteiras

O runner remove tipos/imports de fontes reais. Para TSX, extrai prefixos e callbacks por marcadores exatos e falha se o marcador não existe. Um harness pequeno preserva estado, refs, dependências de efeitos, re-render e cleanup. Promessas controladas estabelecem a ordem entre clique, fechamento, resposta tardia e erro. As fronteiras de SDK, consulta, Storage, áudio, clipboard e DOM são objetos locais; nenhum upload, DELETE, microfone, envio, alerta ou acesso HTTP real acontece.

Os asserts examinam o efeito dos corpos de produção, incluindo controles positivos. Isso confirma contratos condicionais e a ordem de operações especificada. Não representa montagem React DOM, efeitos de Radix/framer-motion, codecs, permissões físicas, políticas vivas de Storage/RLS ou entrega do provedor. Testes existentes foram lidos para confrontar mocks/fixtures; sua suíte não foi executada.

## Casos

| Caso | Contrato demonstrado | Controle/limite |
|---|---|---|
| `quick_reply_dialog_stale_target` | Troca de template conserva formulário; ID B recebe payload A. | Montagem nova com B inicializa corretamente. Não escreve no banco. |
| `group_filter_removes_required_hyphen` | A normalização torna impossível o predicado de grupo. | Grupo já consta na fixture carregada; Todos conserva ambos os contatos. |
| `status_chip_uses_auth_id_for_profile_fk` | Identidades diferentes dão contagem zero e badge do próprio agente. | Fixture com IDs iguais passa, como os testes existentes. |
| `voice_picker_unmount_keeps_stream` | Desmontagem não chama limpeza da captura. | Cleanup explícito para tracks sintéticas. |
| `voice_picker_permission_resolves_after_close` | Permissão tardia inicia captura com popover fechado. | `onOpenChange` real; nenhuma permissão física. |
| `generated_tts_send_before_outbound` | TTS limpa prévia e anuncia sucesso durante envio pendente. | Pai real recebe rejeição controlada depois. Texto original pode permanecer. |
| `transformed_voice_send_before_outbound` | Voz transformada repete descarte antes do envio. | Não declara objeto órfão em toda falha de resultado incerto. |
| `batch_signed_thumbnail_cannot_refresh` | Item com signedUrl chama resolver vazio e não renova. | Mesmo resolver renova quando recebe locator original. Erro HTTP é injetado. |
| `file_detail_error_persists_into_next_item` | Erro de A conserva placeholder em B válido. | Remontar B limpa estado; URLs públicas isolam a causa. |
| `whisper_conditional_consumer_omits_target` | Se montado com as props condicionais, falta alvo e não insere. | Com alvo explícito insere na fixture. Não foi encontrada ação de abertura no fluxo lido; não há finding ativo. |
| `lead_score_failed_load_writes_defaults` | Falha de SELECT habilita defaults que sobrescrevem campos existentes. | Leitura bem-sucedida preserva dados; mesmo contato, sem alegar A→B. |
| `sticker_manager_recent_toggle_no_effect` | Toggle Recentes muda estado, mas não itens/ordem. | Administrador de stickers; não extrapola ao picker principal. |
| `quick_reply_card_reports_copy_without_clipboard` | Clique no card anuncia cópia sem writeText. | Ícone dedicado solicita writeText. Clipboard é array sintético. |
| `collaboration_handoff_error_variant` | UPDATE devolve error, pai resolve e diálogo confirma transferência. | Extensão de evidência de INB-009, sem recontagem nem alteração do checkpoint anterior. |
| `sentiment_actions_without_conversation_navigation` | Ver conversa só loga; Ver detalhes não age sem alvo DOM. | Alvo clicável é controle positivo. Dashboard tem tab ai dinâmica; nenhuma ausência universal alegada. |

`results.json` contém observações e limites por caso. `provenance-checks.json` guarda os controles de integridade. O conteúdo do runner e dos pins deve permanecer com os hashes do resultado correspondente; alterações somente documentais não exigem reexecutar os casos.
