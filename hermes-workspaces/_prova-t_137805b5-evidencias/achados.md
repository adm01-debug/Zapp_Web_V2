# Achados fora do escopo do cartão t_137805b5

1. **Pendente registrada mas arquivo ausente na REF_COPIA**
   `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9/.hermes-tarefa`
   lista `APLICADA_LOCAL=20261005224959_inbound_message_effects_outbox.sql sha=0724249a2aa90732`, mas o arquivo
   não existe mais em `supabase/migrations/` daquela cópia (conteúdo consolidado; base em `.tmp/base_inbound_message_effects_outbox.sql`, sha confere).
   Efeito: o bloco python do zapp-verify (atual E novo) quebra com FileNotFoundError ao montar `texto` — uma
   pendente listada no ledger que some do diretório derruba o julgamento inteiro com traceback, não com motivo
   legível. Vale um tratamento de erro no zapp-verify (cartão novo), não corrigi aqui.
2. O cartão previa FALHOU nas duas versões para o caso c6b (papel fora dos padrão COM grant na pendente), mas a
   regra antiga `cita(papel)` já explica qualquer papel citado no texto da pendente — ver detalhe no relato.
