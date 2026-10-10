Especialista: vera

# Relatório de Auditoria de Fontes — N-211

**Data:** 2026-10-10  
**Escopo:** docs/talkx/*.html, public/ e generate_audit_pdf.ts  
**Fonte da stack de referência:** `src/styles/tokens.css`  
**Stack do sistema (tokens.css):**
- `--font-sans`: `'Plus Jakarta Sans', system-ui, sans-serif`
- `--font-display`: `'Outfit', system-ui, sans-serif`
- `--font-mono`: `'JetBrains Mono', 'Fira Code', ui-monospace, monospace`

## Font-family encontradas (todas, inclusive OK)

| Status | Arquivo | Linha | font-family | Desvio |
|---|---|---|---|---|
| OK | docs/talkx/references/INDEX.html | 4 | system-ui | — |
| DESVIO | docs/talkx/references/INDEX.html | 4 | -apple-system | fora de tokens.css |
| DESVIO | docs/talkx/references/INDEX.html | 4 | segoe ui | fora de tokens.css |
| OK | docs/talkx/references/INDEX.html | 4 | sans-serif | — |
| DESVIO | generate_audit_pdf.ts | 7 | helvetica | fora de tokens.css |
| DESVIO | generate_audit_pdf.ts | 18 | helvetica | fora de tokens.css |

## Resumo

- **Total de font-family encontradas:** 6 (em 3 declarações)
- **OK (dentro da stack de tokens.css):** 2
- **DESVIO (fora da stack):** 4
- **public/:** 0 arquivos HTML encontrados, 0 font-family

## Detalhes

### docs/talkx/references/INDEX.html
`font-family: system-ui,-apple-system,"Segoe UI",sans-serif`
- `system-ui` — OK (em tokens.css como fallback de --font-sans e --font-display)
- `-apple-system` — DESVIO (não consta em tokens.css)
- `segoe ui` — DESVIO (não consta em tokens.css)
- `sans-serif` — OK (genérico, presente em tokens.css)

### public/
Nenhum arquivo HTML encontrado. Nenhuma fonte declarada.

### generate_audit_pdf.ts
`doc.setFont("helvetica")` — DESVIO (`helvetica` não pertence à stack de tokens.css). O jsPDF interno limita-se a 14 fontes padrão; `helvetica` é a mais próxima de `sans-serif` entre as disponíveis.

## Caminhos do git grep font-family (mesmo defeito)

- `docs/talkx/references/INDEX.html:4` — `font-family:system-ui,-apple-system,"Segoe UI",sans-serif`
- `generate_audit_pdf.ts:7` — `doc.setFont("helvetica", "bold")`
- `generate_audit_pdf.ts:18` — `doc.setFont("helvetica", "normal")`

## Recomendação

Substituir `helvetica` por uma fonte da stack de tokens.css em `generate_audit_pdf.ts` ou documentar a justificativa da exceção (jsPDF fontes internas são limitadas a 14 fontes padrão; `helvetica` é a mais próxima de `sans-serif` entre as disponíveis). Os desvios `-apple-system` e `segoe ui` em INDEX.html são fontes de sistema legadas que não estão em tokens.css; avaliar se devem ser substituídas por `system-ui` ou documentadas como exceção.
