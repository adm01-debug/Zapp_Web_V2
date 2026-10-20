/**
 * Reconexão automática e exaustão de tentativas — LACUNA já com cartão.
 *
 * A máquina de estados da reconexão (`auto_reconnect_enabled`,
 * `reconnect_interval_seconds`, `max_reconnect_attempts`, `protection_active`,
 * `reconnection_logs` e o motivo de saúde `health_reason`) ainda não existe
 * integrada no produto: a V2 só tem o banner global de desconexão e um
 * histórico em memória. Sem código não há como provar comportamento — os casos
 * ficam como `it.todo` apontando o cartão responsável, para não escrever um
 * teste que finge.
 *
 * Ver `~/hermes-workspaces/.assets/paridade-16/achados_2_conexoes_config.md`
 * (linhas 14-15) e `achados_1_conexoes_cartao_qr.md`.
 */
import { describe, it } from 'vitest';

describe('Reconexão automática (depende de RC1..RC3 — não integrado)', () => {
  it.todo('RC1 (workersql) t_a77a5aad: motivo de saúde (`health_reason`) exibido no cartão');
  it.todo('RC2 (edgar) t_44c5a12d: health-check por instância e degradação por camadas');
  it.todo('RC2/RC3: reconexão automática esgota após `max_reconnect_attempts` e para (sem laço infinito)');
  it.todo('RC3 (iris) t_ce00ee34: botão “Reconectar” do cartão (restart → health-check → QR)');
  it.todo('RC3: campos de reconexão validados (intervalo 10-3600 s, tentativas 1-20, NaN bloqueado)');
});
