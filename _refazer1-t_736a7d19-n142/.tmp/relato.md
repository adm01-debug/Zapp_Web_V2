Especialista: senior (area-sql-banco)

[refazer 1] N-142 banco leitura reacoes — reentrega sobre dia/2026-10-14

Ponto 1 — "quebra o ESPELHO DO CI no empilhamento (node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir)".
Investiguei antes de obedecer. Reproducao independente, na ponta dia/2026-10-14 (tip f5885801b1):
- base pura: `node --test scripts/ci/db-inventory-doc.unit.mjs` → 15 pass / 0 fail (VERDE);
- base + os 3 arquivos N-142 → 15 pass / 0 fail (VERDE).
Suite node completa do espelho (149 arquivos, o mesmo comando do ci_espelho.sh):
`node --test --test-reporter=tap scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs`
→ base pura e base+N-142 dao o MESMO conjunto de 12 "not ok" pre-existentes (diff vazio entre os dois runs;
nenhum e o item do inventario). Ou seja, a entrega N-142 nao produz o item vermelho sobre a ponta atual.
Causa-raiz da atribuicao (lida no codigo do empilhador, ~/arquitetura-v2/limpador/lote_grande.py, linhas 5 e 243-256):
o empilhador so empilha entregas SEM migration; cartao cujo diff encosta em supabase/migrations/ e descartado
(pulados["migration"]) com reset --hard. A entrega N-142 contem exatamente um arquivo em supabase/migrations/,
logo ela NUNCA entra na arvore empilhada — o conteudo dela nao pode ter produzido o vermelho da posicao 133.
O vermelho veio de outro ponto da pilha (a propria passada registra instaveis) ou de flake; nao ha correcao
possivel no conteudo N-142 para um vermelho que ele nao produz. Por isso nao mexi em docs/DB-INVENTORY.md
(ela esta correta) nem afrouxei assercao alguma.
O que mudei neste ponto: nada no conteudo da correcao (policy, teste e step idem a entrega anterior); a
mudanca foi rebasar a entrega para a ponta atual (dia/2026-10-14) e re-versionar a migration (ponto 2).

Ponto 2 — "Reproduza a falha com zapp-verify full ., corrija e feche de novo".
Defeito real encontrado ao rebasar (nao e o espelho, e frescura da entrega): a migration da entrega anterior
era 20261013133412 (outubro 13); a ponta dia/2026-10-14 ja tem migrations ate 20261014014129. A regra do cartao
(MIGRATION: versionada na DATA DE HOJE, sem colisao, sem reencenar o passado) exigia versao nova. Verifiquei que
nenhuma migration de 13-14/10 cita message_reactions (ordem de replay segura), e re-versionei:
- supabase/migrations/20261015030000_fix_message_reactions_select_policy_user_id_type.sql (NOVO; corpo da
policy, -- Rollback: e bloco executavel identicos, byte a byte, a versao provada; so cabecalho com a nova versao);
- scripts/db-audit/n142-message-reactions-select-user-id.test.sh (NOVO; unica diferenca contra a versao provada:
linha 24 aponta para a migration re-versionada);
- .github/workflows/db-guard.yml (+15 linhas: step N-142 apos o step N-136, antes do gate de replay; hunk
identico ao da entrega anterior, ancora inalterada na ponta atual).
Prova (codigo real, Postgres 17 descartavel, docker local):
`bash scripts/db-audit/n142-message-reactions-select-user-id.test.sh` → N142: TODOS OS TESTES PASSARAM
(A1 autor ve a propria reacao, A2 estranho nao ve, A3 admin ve tudo, A4 contact_id intacto, A5 rollback executa
e restaura, A5b bloco -- Rollback: executavel executa e restaura, A6 pos-rollback o bug volta [vermelho sem a
correcao], A7 reaplicada o autor ve de novo [verde com ela]).

Arquivos (diff exato contra dia/2026-10-14, `diff -rq` da arvore inteira — nada alem destes 3):
- .github/workflows/db-guard.yml (modificado, +15)
- scripts/db-audit/n142-message-reactions-select-user-id.test.sh (novo)
- supabase/migrations/20261015030000_fix_message_reactions_select_policy_user_id_type.sql (novo)

Comandos e resultados reais (workspace scratch ~/hermes-workspaces/Zapp_Web_V2/_refazer1-t_736a7d19-n142,
arvore = git archive de dia/2026-10-14 + os 3 arquivos acima):
- node --test scripts/ci/db-inventory-doc.unit.mjs → tests 15, pass 15, fail 0
- suite node completa do espelho → delta zero vs base pura (12 "not ok" pre-existentes de ambiente, nenhum novo)
- node scripts/db-audit/check-migration-drift.mjs → 852 arquivos validos, RC=0
- bash -n no .test.sh → SYNTAX_OK; YAML do db-guard.yml parseia (jobs: 2)
- prova PG descartavel (acima) → TODOS OS TESTES PASSARAM (A1-A7+A5b)
- grep por referencia de producao nos 3 arquivos → 0 ocorrencias
Nao executei o `zapp-verify full` integral (exige node_modules, typecheck do repo inteiro e conjunto de banco
local; este scratch nao tem .git nem node_modules e minha mudanca nao toca .ts): rodei diretamente cada fase
aplicavel ao cartao (drift, espelho, suite node, prova real no banco descartavel). Nenhum teste existente foi
removido, pulado ou afrouxado. Sem caminho sancionado para commitar nesta sessao (guarda amarra branch ao
workspace da entrega anterior e proibe branch novo ali; kanban scratch sem git): a entrega segue como patch
anexo ao cartao + arquivos no workspace acima, pronta para o integrador aplicar sobre dia/2026-10-14.
