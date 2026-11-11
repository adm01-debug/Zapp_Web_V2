// Agregador deliberado: o job Node CI executa scripts/ci/*.unit.mjs e estes imports
// registram as suites nos mesmos processos do node:test, sem duplicar os casos.
import '../qa/contatos-redesign-baseline.unit.mjs';
import '../qa/contraste-auditores.unit.mjs';
