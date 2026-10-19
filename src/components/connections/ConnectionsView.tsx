import { useState, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { AuroraBorealis } from '@/components/ui/AuroraBorealis';
import { FloatingParticles } from '@/components/ui/FloatingParticles';
import { useConnections } from '@/hooks/connections/useConnections';
import { ConnectionCard } from '@/components/connections/ConnectionCard';
import { ConnectWhatsAppDialog } from '@/components/connections/ConnectWhatsAppDialog';
import { Button } from '@/shadcn/ui/button';
import { Plus } from 'lucide-react';
import type { WhatsAppConnection } from '@/types/connections';

export function ConnectionsView() {
  const isReducedMotion = useReducedMotion();
  const { connections, loading, refresh } = useConnections();
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<WhatsAppConnection | null>(null);

  const handleAddConnection = useCallback(() => {
    setSelectedConnection(null);
    setShowConnectDialog(true);
  }, []);

  const handleEditConnection = useCallback((connection: WhatsAppConnection) => {
    setSelectedConnection(connection);
    setShowConnectDialog(true);
  }, []);

  const handleDialogClose = useCallback(() => {
    setShowConnectDialog(false);
    setSelectedConnection(null);
    refresh();
  }, [refresh]);

  return (
    <div className="relative min-h-screen bg-background">
      {isReducedMotion ? null : (
        <>
          <AuroraBorealis />
          <FloatingParticles />
        </>
      )}
      <div className="relative z-10 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Conexões</h1>
          <Button onClick={handleAddConnection}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar conexão
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((conn) => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                onEdit={() => handleEditConnection(conn)}
              />
            ))}
          </div>
        )}
      </div>
      <ConnectWhatsAppDialog
        open={showConnectDialog}
        onClose={handleDialogClose}
        connection={selectedConnection}
      />
    </div>
  );
}
