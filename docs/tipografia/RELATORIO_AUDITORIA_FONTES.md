# Relatório de Auditoria de Fontes — N-211

**Data:** 2026-10-10  
**Escopo:** docs/talkx/*.html, public/ e generate_audit_pdf.ts  
**Stack de referência do sistema:** `system-ui, -apple-system, "Segoe UI", sans-serif` (e equivalentes mono)

## Resumo

| Superfície | Arquivos escaneados | Font-family encontradas | Desvios |
|---|---|---|---|
| docs/talkx/ | 1 (INDEX.html) | 1 | 0 |
| public/ | 0 | 0 | 0 |
| generate_audit_pdf.ts | 1 | 1 (helvetica via setFont) | 1 |

## Detalhes

### docs/talkx/references/INDEX.html
- `font-family: system-ui,-apple-system,"Segoe UI",sans-serif` — **OK** (dentro da stack do sistema)

### public/
- Nenhum arquivo HTML encontrado. Nenhuma fonte declarada.

### generate_audit_pdf.ts
- `doc.setFont("helvetica")` — **DESVIO** (`helvetica` não pertence à stack do sistema)

## Conclusão

A única superfície fora do app que contém uma fonte não padrão é `generate_audit_pdf.ts`, que usa `helvetica` como fonte do jsPDF. O INDEX.html em docs/talkx/ usa corretamente a stack do sistema. A pasta public/ está vazia de HTML.

## Recomendação

Substituir `helvetica` por uma fonte da stack do sistema em `generate_audit_pdf.ts` ou documentar a justificativa da exceção (jsPDF fontes internas são limitadas a 14 fontes padrão; `helvetica` é a mais próxima de `sans-serif` entre as disponíveis).