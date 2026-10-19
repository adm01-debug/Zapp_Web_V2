import { useReducedMotion } from 'framer-motion';
import { AuroraBorealis } from '@/components/ui/AuroraBorealis';
import { FloatingParticles } from '@/components/ui/FloatingParticles';
import { useWallet } from '@/hooks/wallet/useWallet';
import { WalletCard } from '@/components/wallet/WalletCard';
import { TransactionList } from '@/components/wallet/TransactionList';

export function ClientWalletView() {
  const isReducedMotion = useReducedMotion();
  const { wallet, transactions, loading } = useWallet();

  return (
    <div className="relative min-h-screen bg-background">
      {isReducedMotion ? null : (
        <>
          <AuroraBorealis />
          <FloatingParticles />
        </>
      )}
      <div className="relative z-10 p-6">
        <h1 className="text-2xl font-bold mb-6">Carteira</h1>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            <WalletCard wallet={wallet} />
            <TransactionList transactions={transactions} />
          </>
        )}
      </div>
    </div>
  );
}
