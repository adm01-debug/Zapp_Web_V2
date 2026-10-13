Especialista: senior (refazer talkx-supressao: componente + testes do produto)

Ponto 1 (recusa: rebase recusado por conflito insolúvel) → cherry-pick com
`-n` do trabalho anterior (9c3ce9f0b) sobre dia/2026-10-13; o componente
mesclou sozinho e o conflito add/add ficou só no teste search.test. Resolvi
preservando a base: mantive as 13 provas do dia byte-identicas (seeds
inclusive) e somei as provas do servidor. Arquivos: TalkXSuppression.tsx
(busca no servidor com join interno, trazida do trabalho anterior),
TalkXSuppression.search.test.tsx (mock unificado que emula o servidor +
4 provas novas), TalkXSuppression.phoneOnly.test.tsx (mock atualizado para
a nova cadeia). Teste-prova: as 3 provas server-side falham sem a correção
(componente antigo: 3 failed / 13 passed) e passam com ela (21/21).

Ponto 2 (regressão ao lado achada por mim: phoneOnly quebrou com a nova
consulta) → o mock dessa suíte não tinha `.or()` e a cadeia terminava em
`.order()` retornando promise, então qualquer busca caía no estado de erro.
Atualizei o mock para a mesma emulação do servidor, sem tocar em nenhuma
expectativa do dia. Teste-prova: phoneOnly 4/4 verde, expectations intactas.

Ponto 3 (UX do dia preservado: busca sem resultado) → com a busca no
servidor, zero linhas voltava o vazio "lista vazia" em vez de "Nenhum
resultado". Troquei `isEmpty` por `blacklist.length === 0 &&
search.trim() === ''` (1 linha) e somei o teste "lista vazia sem busca".
Teste-prova: "zzz"/"Op2" mostram "Nenhum resultado"; base vazia sem busca
mostra o vazio da lista. Nenhum teste do dia precisou de ajuste.

Arquivos (git diff --name-only dia/2026-10-13...HEAD, commit 92070f9015):
src/components/talkx/TalkXSuppression.tsx
src/components/talkx/__tests__/TalkXSuppression.phoneOnly.test.tsx
src/components/talkx/__tests__/TalkXSuppression.search.test.tsx

Verificação real, rodada agora no workspace:
- search + phoneOnly: 21 passed (21)
- todas as suítes TalkXSuppression*: 10 arquivos, 75 passed (75)
- tsc -b --force: verde (exit 0) antes da reconstrução byte-identica do
  teste; após, a máquina saturou (swap 100%, load 71) e o tsc caiu com
  OOM (exit 137) em 3 tentativas — sem erro de tipo reportado, só falta
  de memória; vitest transformou e rodou todos os arquivos (sintaxe ok).
- bytes: zero sequências de máscara literal nos 3 arquivos; seeds do
  search.test byte-identicas às do dia (6/6 linhas).
