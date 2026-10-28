/**
 * Fuso único da suíte: vários testes (filesPeriod, workItemFormat, QuickAdd…) são escritos para o
 * dia LOCAL de São Paulo (UTC-3, sem horário de verão desde 2019). O runner do CI roda em UTC e o
 * notebook do dev em UTC-3, então sem isto a mesma suíte passa num e quebra no outro.
 */
export default function setup(): void {
  process.env.TZ = 'America/Sao_Paulo';
}
