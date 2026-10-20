# Probes adicionais — oito hooks de communication

Treze casos complementam as 28 provas anteriores, cujos arquivos permaneceram inalterados. Os cenários executam funções TypeScript reais de buffers conferidos contra o manifesto do snapshot `da307ba5626dce892f0b37cb6762463f55d14a96`. Dois casos são controles positivos, sem novo achado.

## Execução

```bash
node --disable-warning=ExperimentalWarning run.mjs
python verify-provenance.py
```

Para outro checkout idêntico:

```bash
node --disable-warning=ExperimentalWarning run.mjs --source /caminho/checkout --out /caminho/results.json
```

São aceitos `SOURCE`, `INBOX_SOURCE_ROOT`, `--pins`/`INBOX_SOURCE_PINS` e `--out`/`INBOX_RESULTS_PATH`. Node 24.19 usa `stripTypeScriptTypes` nativo; não há instalação de pacotes, compilador TS externo, credenciais ou rede.

## Cenários

| ID | Observação | Limite |
|---|---|---|
| tts_starts_after_unmount | Resposta TTS atrasada cria e toca áudio depois do unmount | Hook e binding de volume reais; Audio/fetch/hooks simulados. Demonstra ausência de cancelamento, não audibilidade/autoplay real; ChatPanel é desmontado ao trocar de contato. |
| tts_stop_does_not_cancel_request | stop durante fetch é seguido por áudio ativo sem currentMessageId | stop e speak reais; fronteiras simuladas. A UI expõe stop apenas durante reprodução, mas iniciar outro speak também usa esse mesmo stop sem cancelar o pedido anterior. |
| tts_loading_button_starts_duplicate | O botão da mensagem em loading aceita outro clique e as duas respostas tocam | Hook e handleClick reais; expressão disabled verificada no TSX fixado. Fronteiras simuladas, sem montagem DOM/autoplay real. Diferente de clicar outra mensagem, cujo botão está desabilitado durante loading. |
| imperative_audio_stops_keep_bindings | Pausar/fechar memes e parar TTS conserva inscrições dos elementos antigos | Código real de dois hooks e attachMediaVolume/bindMediaVolume; Set de subscribers e Audio simulados. A retenção é dos callbacks/elementos; não mede memória/bateria e não reconta o AudioContext sem GainNode do VOL-01. |
| audio_meme_writes_false_success | Escritas de categoria/exclusão rejeitadas continuam com sucesso; exclusão de objeto já aconteceu | Hook real; banco/Storage simulados com {error} resolvido. O cenário define falha da linha e sucesso de Storage; não afirma políticas RLS ou incidência real. |
| audio_meme_close_orphans_upload | Fechar o picker descarta pendingUpload e conserva objeto; Cancelar explícito remove | Upload/conversão/IA simulados; callbacks reais. Não consulta objetos reais nem estima custo; o caminho visível onOpenChange chama cleanup, não handleCancelUpload. |
| dictation_old_end_resets_new_session | onend atrasado da sessão anterior apaga isListening enquanto a nova continua ativa | Hook real e eventos SpeechRecognition controlados. Requer onend de A após início de B; não é teste de navegador físico. O teste de repositório chama onend sincronicamente dentro de stop. |
| transcription_notification_after_disable | Callback pendente publica os três alertas depois de enabled=false remover o canal | Hook real e query/canal/alertas simulados. Não alega entrega a usuário sem RLS; descreve aviso fora do ciclo ativo ou após desativação enquanto a consulta de nome estava pendente. |
| voice_actions_announce_without_applying | Busca/filtro só mudam view e sort/clear só mostram toast | Corpo real do roteador consumidor de AppShell; onViewChange/toast simulados. Não infere inexistência de outro assistente separado: este é o LazyVoiceOverlay de desktop. |
| voice_stop_leaves_action_pending | Interromper resposta pausa áudio mas deixa promise e onAction pendentes | playTtsAudio e useVoiceAgent reais; hooks/SDK/fetch/Audio simulados. O caminho já estava em playObjectUrl; não generaliza stop antes do fetch, que pode sair pelo sinal. |
| voice_old_tts_applies_old_action | A finaliza sua fala depois de B e ainda aplica ação antiga apesar do abort | Hook real; SDK/transcrição/TTS simulados com promessas independentes. Requer novo transcript durante fala anterior; onCommittedTranscript não possui guard de fase e o abort de A não é verificado depois do await TTS. |
| microphone_guard_contract_positive | Sondagem interrompe tracks, reconsulta após negativa e reutiliza sucesso por três segundos | Controle positivo, sem achado novo. Hook real, tempo/getUserMedia/eventos simulados; não prova discagem SIP nem aparelho físico. |
| media_volume_contract_positive | Store mantém clamp/curva/mute e hook troca binding quando o elemento muda | Controle positivo, sem achado novo. Store e dois hooks reais; useSyncExternalStore/layout effect, DOM e binding simulado neste caso. Não valida fallback WebAudio/Safari; VOL-01 permanece separado. |

## Método e limites

O runner verifica HEAD e os treze arquivos de pins.json antes de avaliar qualquer corpo da aplicação. Os pins vieram de source-integrity.json; o resultado registra o hash desse manifesto e de pins/runner. O cache interno recusa fonte não fixada. As provas de integridade negativas testam arquivo alterado mantendo HEAD e HEAD esperado incorreto; ambos devem falhar antes de gravar resultados.

O harness modela state, refs, memo/callback, efeitos e cleanup. Eventos, promessas e tempo são controlados para reproduzir as ordens descritas. Áudio, SpeechRecognition, Scribe, navegador, Supabase, Storage, conversão e rede são fronteiras simuladas. Os módulos de volume e TTS são reais onde explicitado. A probe do botão extrai seu handleClick mecanicamente e verifica a expressão disabled no TSX integral, sem fingir montagem de DOM.

A Promise deixada pendente pelo stop de playTtsAudio não tem timer ou I/O ativo no ambiente: as asserções verificam que os handlers capazes de terminá-la foram removidos e que onAction não foi chamado. Não há espera por timeout arbitrário usada como prova.

Nenhum resultado comprova áudio físico, política de autoplay, precisão de reconhecimento, microfone real, permissões de produção, políticas RLS completas ou incidência/custo real. useMicrophoneGuard e useMediaVolume/useMediaElementVolume têm controles positivos delimitados, não aprovação do sistema SIP/WebAudio completo.

Os achados anteriores VOL-01 e R2-MOD-040 são distintos e não foram renumerados. Os resultados de notificação descrevem um evento originalmente recebido enquanto o hook estava ativo, sem alegar vazamento por autorização.
