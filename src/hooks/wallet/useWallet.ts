import { useState } from 'react';

export interface WalletData {
  balance: number;
  currency: string;
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  type: 'credit' | 'debit';
}

export function useWallet() {
  const [wallet] = useState<WalletData | null>(null);
  const [transactions] = useState<Transaction[]>([]);
  const [loading] = useState(false);

  return { wallet, transactions, loading };
}
