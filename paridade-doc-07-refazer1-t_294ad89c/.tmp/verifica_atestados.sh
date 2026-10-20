#!/bin/bash
# Verifica os 5 pontos da recusa do t_294ad89c ([refazer 1] docs paridade doc07).
# Uso: ./verifica_atestados.sh <dir-docs>   (dir com docs/audits + docs/plans)
# Sai 0 se TODOS os atestados passam; imprime FALHA por checagem que falhar.
# As checagens de código leem a dia/2026-10-14 (somente leitura) — o "código real".
R=~/projetos/Zapp_Web_V2; B=dia/2026-10-14; D="$1"
ok=0; fail=0
chk() { # chk <nome> <comando...>
  local nome="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "PASS $nome"; ok=$((ok+1));
  else echo "FALHA $nome"; fail=$((fail+1)); fi
}
chkneg() { # chkneg <nome> <comando...> : passa quando o comando FALHA/vazio
  local nome="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "FALHA $nome"; fail=$((fail+1));
  else echo "PASS $nome"; ok=$((ok+1)); fi
}
P1="$D/docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE1_MENSAGENS_PRESENCA.md"
P2="$D/docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE2_VOZ_SIP_MIDIA.md"
PL="$D/docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md"

# P1: split PARTE4 — plano cita o filho; PARTE4 existe na dia; não está neste cartão
chk "P1-plano-cita-split-t_6587228b" grep -q "t_6587228b" "$PL"
chk "P1-parte4-na-dia" git -C "$R" ls-tree "$B" -- docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE4_INVENTARIO.md
chkneg "P1-parte4-fora-deste-cartao" test -f "$D/docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE4_INVENTARIO.md"
# P2: edges sem log de texto (fato no código) + atestado no relatório
chkneg "P2-tts-stream-sem-transcript" git -C "$R" grep -i "transcript" "$B" -- supabase/functions/elevenlabs-tts-stream/index.ts
chk "P2-tts-stream-log-so-tamanho" git -C "$R" grep -q 'Streaming TTS: ${text.length}' "$B" -- supabase/functions/elevenlabs-tts-stream/index.ts
chk "P2-voice-agent-ainda-loga-contraste" git -C "$R" grep -q 'transcript.substring(0, 100)' "$B" -- supabase/functions/voice-agent/index.ts
chk "P2-atestado-no-relato" grep -q "elevenlabs-tts-stream/index.ts.*só loga tamanho" "$P2"
# P3: edge persiste no bucket; front só assina URL; sem base64 no navegador
chk "P3-edge-persiste-bucket" git -C "$R" grep -q "persistBase64Media" "$B" -- supabase/functions/recover-message-media/index.ts
chk "P3-front-assina-url" git -C "$R" grep -q "supabase.storage" "$B" -- src/hooks/storage/useResolvedStorageUrl.ts
chkneg "P3-front-sem-base64" git -C "$R" grep -i "base64" "$B" -- src/hooks/storage/useResolvedStorageUrl.ts
chk "P3-atestado-no-relato" grep -q "persiste via .persistBase64Media" "$P2"
# P4: 3 ações na dia + search_emails ausente + scrollToMessage + atestado
chk "P4-search_tasks-na-dia" git -C "$R" grep -q "case 'search_tasks'" "$B" -- supabase/functions/voice-copilot-action/index.ts
chk "P4-search_files-na-dia" git -C "$R" grep -q "case 'search_files_in_conversation'" "$B" -- supabase/functions/voice-copilot-action/index.ts
chk "P4-catalog-anon-key" git -C "$R" grep -q "SUPABASE_ANON_KEY" "$B" -- supabase/functions/voice-copilot-action/index.ts
chkneg "P4-search_emails-fora-da-dia" git -C "$R" grep -q "case 'search_emails'" "$B" -- supabase/functions/voice-copilot-action/index.ts
chk "P4-scrollToMessage-existe" git -C "$R" grep -q "scrollToMessage" "$B" -- src/components/inbox/chat/ChatMessagesArea.tsx
chk "P4-atestado-no-relato" grep -q "3 ações integradas + 1 recusada" "$P2"
# P5: GO retorna goHistoryNotSupported em find-status-messages + atestado
chk "P5-go-history-not-supported" git -C "$R" grep -q "goHistoryNotSupported('find-status-messages'" "$B" -- supabase/functions/evolution-api/index.ts
chk "P5-atestado-no-relato" grep -q "Stories vazio em instâncias GO: confirmado no código" "$P1"
echo "---"; echo "PASS=$ok FALHA=$fail"
[ "$fail" -eq 0 ]
