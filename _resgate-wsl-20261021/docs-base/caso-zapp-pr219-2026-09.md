# Caso completo: auditoria 5-agentes do PR #219 (Zapp_Web_V2, 2026-09-04)

Contexto: PR #219 (merge squash `9aba2de3`) corrigiu renderização de e-mails HTML no chat + corte de textos no sidebar. Usuário pediu validação exaustiva pós-merge. Fan-out: 1 líder (PhD-DB) + 4 especialistas, todos com execução real.

## Números finais
- Pentest segurança: 131 payloads em 7 baterias → 110/110 XSS clássicos neutralizados; 3 bypasses MÉDIOS reais.
- Funcional: 42 testes novos independentes → 42 ✓; 4 achados BAIXOS.
- Banco: 28 checks SELECT-only → APROVADO; `contact_id` NULL em 100% das 445 threads (bug era real e mais grave); trigger `sync_thread_last_sender()` mantém `last_from_*` fresco (0/445 divergências, validação lateral-join).
- CSS: Playwright Chromium/Firefox contra bundle real → line-clamp nativo (TW 3.4.19), revert-layer com fallback seguro, sem overflow.
- Testes/CI: ratchets `typecheck baseline=118 atual=116 novas=0` / `lint baseline=1086 atual=1073 novas=0`.

## Os 3 bypasses de segurança (com exploit)
1. **F1 — comentário CSS**: `style="position/**/:fixed;z-index/**/:9999;background/**/:#fff url(//tracker)"` passava 100% intacto (validado com postcss). Fix: `style.replace(/\/\*[\s\S]*?\*\//g, '')` ANTES do split por `;`.
2. **F2 — url() fora da blocklist**: `cursor:url(...)`, `mask-image:url(...)`, `list-style-image`, `content`, `filter`, `border-image-source` sobreviviam. Fix: descartar QUALQUER declaração cujo valor case `/url\s*\(/i`.
3. **F3 — hooks globais**: `DOMPurify.addHook` na instância default = qualquer `removeAllHooks()` de terceiros no bundle desarma o pipeline (provado: noopener e width voltavam). Fix: instância isolada via factory `DOMPurify(window)` com guarda `typeof sanitize === 'function'`.

## Achados funcionais corrigidos
- B1: impossível colapsar texto puro após expandir → botão vira toggle (`expanded && !sanitizedHtml ? 'Menos' : 'Ver e-mail completo'`).
- B2: `new Date('invalid')` → "Invalid Date" cru → `if (Number.isNaN(date.getTime())) return ''`.
- B3 (pré-existente, não corrigido): filtro "Com anexo" é no-op (`result = result`).

## Armadilhas de teste encontradas
- `useState(isLast)`: componente nasce expandido; teste do fluxo colapsado precisa de `isLast={false}`.
- Escrever `/**/` dentro de comentário de documentação TS quebrou o parser (comentário de bloco fechou cedo) — PARSE_ERROR no oxc.
- `git stash` sem `-u` não guarda arquivos não-rastreados → comparação antes/depois de gates inválida.

## Follow-up
PR #220 (`fix/hermes-h538172-audit-hardening`) com F1+F2+F3+B1+B2 + 7 testes novos (AuditHardening.test.ts) incluindo o teste do `removeAllHooks()` adversário. Gates: 165 arquivos/2602 passed/ratchets novas=0.

## Métrica de esforço
~19 min de fan-out paralelo (líder 5m14s, especialistas 9-19m) + ~40 min de consolidação+fix. Cada bypass encontrado virou teste de regressão permanente.
