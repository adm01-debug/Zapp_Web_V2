import type { Transaction } from '@/hooks/wallet/useWallet';

interface TransactionListProps {
  transactions: Transaction[];
}

export function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma transação encontrada.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {transactions.map((tx) => (
        <li key={tx.id} className="flex items-center justify-between py-3">
          <span className="text-sm">{tx.description}</span>
          <span className={`text-sm font-medium ${tx.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
            {tx.type === 'credit' ? '+' : '-'}{Math.abs(tx.amount).toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  );
}
