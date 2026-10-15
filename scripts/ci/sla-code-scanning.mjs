#!/usr/bin/env node
// W83 — SLA dos alertas abertos de Code Scanning (usado pelo branch-hygiene-audit.yml).
// high/critical → 14 dias; medium/low → 30 dias. Violação → exit 1.
//
// Saiu do YAML em 15/10/2026: inline no workflow, o heredoc do Node estava menos
// indentado que o `run: |` e o arquivo inteiro virou YAML inválido (o GitHub
// recusava o workflow em todo push). Mesmo corrigida a indentação, o passo tinha
// dois defeitos: `echo $ALERTAS | node - <<EOF` entregava o heredoc no stdin e o
// JSON se perdia; e a severidade vinha de `rule.severity` (error/warning/note),
// que nunca vale "high" — nenhum alerta recebia o SLA de 14 dias.
//
// Uso: node scripts/ci/sla-code-scanning.mjs <alertas.json>  (markdown no stdout)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SLA_DIAS = { alto: 14, baixo: 30 };

// security_severity_level (low/medium/high/critical) e o campo de severidade de
// seguranca; regras sem ele (qualidade) usam rule.severity: error conta como alto.
export function nivel(alerta) {
  const seg = alerta?.rule?.security_severity_level;
  if (seg) return String(seg).toLowerCase();
  return alerta?.rule?.severity === 'error' ? 'high' : 'low';
}

export function avaliarSla(alertas, agoraMs = Date.now()) {
  const violacoes = [];
  for (const a of alertas) {
    const sev = nivel(a);
    const prazo = sev === 'high' || sev === 'critical' ? SLA_DIAS.alto : SLA_DIAS.baixo;
    const dias = Math.floor((agoraMs - new Date(a.created_at).getTime()) / 86_400_000);
    if (dias > prazo) {
      const local = a.most_recent_instance?.location?.path ?? '?';
      violacoes.push(`${sev.toUpperCase()} (${dias}d > ${prazo}d) — #${a.number}: ${a.rule?.id ?? '?'} em ${local}`);
    }
  }
  return { total: alertas.length, violacoes };
}

export function relatorio({ total, violacoes }) {
  const linhas = [
    '',
    '### 🔒 Code Scanning — SLA (W83)',
    '',
    `SLA: high/critical → ${SLA_DIAS.alto}d · medium/low → ${SLA_DIAS.baixo}d`,
    '',
    `Alertas abertos: ${total}`,
    '',
  ];
  if (violacoes.length) linhas.push('⚠️ **Violações de SLA:**', '```', ...violacoes, '```');
  else linhas.push('✅ Nenhuma violação de SLA.');
  return `${linhas.join('\n')}\n`;
}

function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error('uso: sla-code-scanning.mjs <alertas.json>');
    process.exit(2);
  }
  const alertas = JSON.parse(readFileSync(arquivo, 'utf8'));
  if (!Array.isArray(alertas)) {
    console.error('::warning::W83: a API não devolveu uma lista de alertas');
    process.stdout.write('\n### ⚠️ Code Scanning — SLA (W83)\n\nNão foi possível consultar os alertas (permissão ou API).\n');
    return;
  }
  const r = avaliarSla(alertas);
  process.stdout.write(relatorio(r));
  if (r.violacoes.length) {
    for (const v of r.violacoes) console.error(`::error::W83: SLA vencido — ${v}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
