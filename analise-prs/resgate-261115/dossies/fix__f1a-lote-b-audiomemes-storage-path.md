# Dossiê — fix__f1a-lote-b-audiomemes-storage-path (PR #2066)

- Ref: `origin/fix/f1a-lote-b-audiomemes-storage-path` (tip `7fb8f446`, merge-base `bac62ba9`, 2026-10-23)
- Main avaliada: `origin/main` = `dac285f62`
- Pré-classificação mecânica: MISTO_CONFLITO (2 arquivos, 216 linhas em lacuna) — falso positivo causado por reformatação Prettier.

## Propósito
Commits `a89cac42e` (fix PK-16/PK-17: upload do áudio meme passa a gravar em `<auth.uid()>/meme_...` porque a policy do bucket `audio-memes` é por pasta; atendente comum recebia 42501) e `970a352e0` (`chore(fmt)`: prettier nos dois arquivos). Diff total 219+/127-, dos quais apenas ~15 linhas são funcionais; o resto é quebra de linha/estilo.

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na main |
|---|---|---|---|
| `src/hooks/communication/useAudioMemes.ts` | 89 linhas "faltando" | **Já na main** (texto diferente, mesmo comportamento). `getUser()` + guard "Sessão expirada" + `storagePath` com prefixo `${user.id}/` presentes. Única diferença real: na branch o `getUser()` vem antes de `convertAudioToMp3`; na main vem depois da conversão e antes do `.upload()` — mesmo efeito (nenhum upload sem usuário). Todas as demais linhas são Prettier (função multi-linha, arrow com parênteses, `{ a: 1 }` quebrado). | `origin/main:src/hooks/communication/useAudioMemes.ts:204-210` (`// ... (PK-16). Chave solta era recusada pelo Storage (42501).`, `supabase.auth.getUser()`, `toast.error('Sessão expirada: ...')`, `` const storagePath = `${user.id}/meme_${Date.now()}_${crypto.randomUUID()}.${ext}` ``). `git diff -w tip..origin/main` sobre o arquivo mostra só reposicionamento do bloco e formatação. Entrou pelo commit `e1f2ee4dd` (2026-10-27, "fix(test): destrava o CI Gate da main"). |
| `src/hooks/communication/__tests__/useAudioMemes.pasta-usuario.test.tsx` | 13 linhas "faltando" | **Já na main** com implementação diferente: a branch criava `realtimeChannel` encadeável dentro de `vi.hoisted`; a main faz `channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }))` + `removeChannel: vi.fn()`. Mesma função: evitar "supabase.channel is not a function" ao montar o hook. O `expect` da mensagem "Sessão expirada" existe (uma linha, não quebrada). | `origin/main:...pasta-usuario.test.tsx:31-32` (channel/removeChannel) e `:105` (expect da mensagem). Commit `e1f2ee4dd`. |

Nenhuma migration, edge ou workflow na branch (`counts.migrations=0`, `edges=0`, `workflows=0`) — sem consulta ao banco necessária.

## Veredito
**INCORPORADA** (confiança alta). A triagem anterior (`triagem_2804`: JA_NA_MAIN) está confirmada por leitura do código. As 216 linhas de "lacuna" são exclusivamente formatação Prettier que a main nunca adotou neste arquivo (main mantém estilo compacto, ex. `useEffect(() => () => { ... }, [...])` em uma linha) e uma variante alternativa do mock Realtime. Nada a portar.

## Lacunas a recuperar
Nenhuma. (Opcional e sem valor de negócio: rodar Prettier em `useAudioMemes.ts` — a main não usa esse formato nesse arquivo; não recomendado isoladamente.)

## Apagar branch
Seguro: sim.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Branch segura para apagar. Main avaliada: `origin/main` = `dac285f62`.

Tentei refutar procurando qualquer hunk útil não coberto. Resultado: zero.

1. `git diff -w --ignore-blank-lines origin/fix/f1a-lote-b-audiomemes-storage-path origin/main` nos 2 arquivos (os únicos da branch — `git diff --stat bac62ba9 tip` = 2 arquivos, 219+/127-) devolve **apenas** reformatação Prettier (arrow com parênteses, objetos quebrados, `useEffect(() => () => {...}, [...])` em 1 vs 5 linhas) mais **um** reposicionamento de bloco.
2. O reposicionamento é o único delta semântico: na branch `supabase.auth.getUser()` + guard vêm **antes** de `convertAudioToMp3`; na main vêm **depois** da conversão e **antes** do `.upload()` (`origin/main:src/hooks/communication/useAudioMemes.ts:204-210`). O efeito observável é idêntico (nenhum upload nem `storagePath` sem usuário; mesma mensagem de toast). A branch só falha mais cedo, poupando a conversão MP3 em sessão expirada — valor **baixo**, micro-otimização de CPU no cliente, não lacuna de ≥ médio.
3. O coração do fix PK-16/PK-17 está na main: `const storagePath = \`${user.id}/meme_${Date.now()}_${crypto.randomUUID()}.${ext}\`` em `origin/main:src/hooks/communication/useAudioMemes.ts:209`, com o comentário da policy por pasta em `:203-204` e o guard `toast.error('Sessão expirada: entre novamente para enviar o áudio')` em `:206-208`.
4. Não foi removido de propósito: `git log -S'${user.id}/meme_' --oneline origin/main -- src/hooks/communication/useAudioMemes.ts` → `e1f2ee4dd` (único commit, adiciona). O `revert: desfaz o lote #1976` (`312bd5992`) é anterior ao `e1f2ee4dd` e não desfaz este fix — a main **atual** contém o código, lido diretamente.
5. Teste: os 2 `it()` da branch existem na main com os mesmos nomes (`origin/main:...pasta-usuario.test.tsx:77` e `:95` vs branch `:87` e `:105`). O `missing_sample` do JSON (mock `realtimeChannel` encadeável em `vi.hoisted`) é coberto por `channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }))` + `removeChannel: vi.fn()` em `:31-32` — mesma função (evitar "supabase.channel is not a function"), implementação diferente. O `expect` da mensagem "Sessão expirada" está em `:102-104`, só não quebrado em 3 linhas.
6. `counts`: 0 migrations, 0 edges, 0 workflows → nada de banco/infra a resgatar; consulta ao Supabase dispensada.

Conclusão: as 216 linhas de "lacuna" do pré-classificador são 100% ruído de formatação. Não há hunk de valor ≥ médio fora da main.
