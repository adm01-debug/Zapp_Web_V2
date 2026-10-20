import { useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGmail, type GmailAccount } from '@/hooks/integrations/useGmail';
import {
  useGmailStoredDataCounts, usePurgeGmailAccountData, type GmailPurgeResult, type GmailPurgeError,
} from '@/hooks/integrations/useGmailDataPurge';
import { useUserRole } from '@/hooks/system/useUserRole';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

/** Texto por tipo de falha do RPC (42501 admin_required / 22023 purge_not_allowed). */
function purgeErrorCopy(error: GmailPurgeError | null | undefined): string {
  const code = error?.code;
  if (code === '42501') return 'Só administradores podem apagar os dados de e-mail.';
  if (code === '22023') return 'A conta precisa estar desconectada e o e-mail digitado precisa ser o da conta.';
  return 'Não foi possível apagar os dados. Nada foi apagado — tente de novo.';
}

/**
 * PM-48 (t_8b39959f) — o `disconnect` zera os tokens e marca `is_active=false`,
 * mas o corpo dos e-mails (conversas, mensagens e anexos) fica no banco para
 * sempre. Este dialogo e o unico caminho para apaga-lo: so admin, so conta
 * desconectada, digitando o e-mail da conta, e com o resultado (quantas linhas
 * sairam) confirmado na tela. Nao ha volta.
 */
function PurgeGmailDataDialog({ account, onClose }: { account: GmailAccount; onClose: () => void }) {
  const [typedEmail, setTypedEmail] = useState('');
  const [result, setResult] = useState<GmailPurgeResult | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const accountEmail = account.email_address ?? '';

  const { data: counts, isLoading: countsLoading, error: countsError } = useGmailStoredDataCounts(account.id);
  const purge = usePurgeGmailAccountData();

  // O RPC compara `p_confirm IS DISTINCT FROM email_address` (migration
  // 20261016033451, linha 77): a tela repete a MESMA comparacao, sem trim e sem
  // case-insensitive, para nao habilitar o botao num texto que o banco recusa.
  const matches = accountEmail.length > 0 && typedEmail === accountEmail;
  const done = Boolean(result);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Enquanto a limpeza roda nao fecha por clique fora/Esc: a transacao ja
        // pode ter apagado, e fechar sem ver o resultado esconderia o desfecho.
        if (!next && !purge.isPending) onClose();
      }}
    >
      <DialogContent
        size="sm"
        showCloseButton={!purge.isPending}
        // O FOCO INICIAL e o botao Cancelar (pedido do cartao): sem isto o Radix
        // focaria o primeiro campo tabulavel, que e o input de confirmacao.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-destructive">Apagar os e-mails guardados desta conta?</DialogTitle>
          <DialogDescription>
            Apaga do banco as conversas, mensagens e anexos ja baixados da conta{' '}
            <strong className="break-all">{accountEmail}</strong>. <strong>Não pode ser desfeito.</strong>{' '}
            A conta continua desconectada.
          </DialogDescription>
        </DialogHeader>

        {!done && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs" aria-live="polite">
            {countsError ? (
              <p className="text-destructive">
                Não foi possível contar os dados guardados. A limpeza continua possível — o resultado aparece depois.
              </p>
            ) : countsLoading ? (
              <p className="text-muted-foreground">Contando os dados guardados…</p>
            ) : (
              <>
                <p className="font-medium">Será apagado:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  <li>Conversas: <span className="font-medium text-foreground">{counts?.threads ?? 0}</span></li>
                  <li>Mensagens: <span className="font-medium text-foreground">{counts?.messages ?? 0}</span></li>
                  <li>Anexos: <span className="font-medium text-foreground">{counts?.attachments ?? 0}</span></li>
                </ul>
              </>
            )}
          </div>
        )}

        {done && result && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs" aria-live="polite">
            <p className="font-medium">Limpeza concluída.</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>Conversas apagadas: <span className="font-medium text-foreground">{result.deleted.email_threads}</span></li>
              <li>Mensagens apagadas: <span className="font-medium text-foreground">{result.deleted.email_messages}</span></li>
              <li>Anexos apagados: <span className="font-medium text-foreground">{result.deleted.email_attachments}</span></li>
              <li>Total de linhas: <span className="font-medium text-foreground">{result.total_rows}</span></li>
            </ul>
          </div>
        )}

        {!done && (
          <div className="space-y-2">
            <Label htmlFor="purge-gmail-confirm-email">
              Digite <strong className="break-all">{accountEmail}</strong> para confirmar
            </Label>
            <Input
              id="purge-gmail-confirm-email"
              value={typedEmail}
              autoComplete="off"
              placeholder={accountEmail}
              disabled={purge.isPending}
              onChange={(e) => setTypedEmail(e.target.value)}
            />
          </div>
        )}

        {purge.error && (
          <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {purgeErrorCopy(purge.error)}
          </p>
        )}

        <DialogFooter>
          {done ? (
            <Button type="button" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button ref={cancelRef} type="button" variant="outline" onClick={onClose} disabled={purge.isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!matches || purge.isPending}
                onClick={() => {
                  // O e-mail digitado vai como confirmacao: o RPC exige igual ao
                  // email da conta e recusa (22023) qualquer outra coisa.
                  purge.mutate(
                    { accountId: account.id, confirm: typedEmail },
                    { onSuccess: (data) => setResult(data) },
                  );
                }}
              >
                {purge.isPending && <Loader2 className="w-3 h-3 motion-safe:animate-spin mr-1" />}
                Apagar definitivamente
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PM-48 — bloco de limpeza das contas DESCONECTADAS, so para admin.
 *
 * O papel e lido AQUI (e nao no cartao) porque este bloco so existe quando ha
 * conta desconectada: assim o cartao continua renderizavel sem os provedores de
 * sessao/permissao (telas de teste que so olham o estado vazio).
 */
function GmailPurgeSection({ accounts }: { accounts: GmailAccount[] }) {
  const { isAdmin } = useUserRole();
  const [purgeTarget, setPurgeTarget] = useState<GmailAccount | null>(null);

  if (!isAdmin) return null;

  return (
    <div className="border-t border-border/60 px-6 py-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Conta desconectada ainda guarda os e-mails já baixados. A limpeza é definitiva e só o administrador pode fazê-la.
      </p>
      {accounts.map((account) => (
        <div key={account.id} className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium break-all">{account.email_address ?? 'Conta sem endereço'}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive shrink-0"
            onClick={() => setPurgeTarget(account)}
          >
            Apagar dados de e-mail
          </Button>
        </div>
      ))}
      {purgeTarget && <PurgeGmailDataDialog account={purgeTarget} onClose={() => setPurgeTarget(null)} />}
    </div>
  );
}

export function GmailIntegrationCard() {
  const { activeAccount, accountsLoading, accountsError, refetchAccounts, disconnectGmail, syncInbox, connectGmail } = useGmail();

  // R2-API-059: a lista de contas vazia so significa "desconectado" quando a
  // consulta terminou bem. Enquanto carrega (ou quando falha) o cartao nao pode
  // afirmar desconexao — o operador reconectaria uma conta que continua viva.
  const checking = Boolean(accountsLoading) && !activeAccount;
  const unavailable = Boolean(accountsError) && !activeAccount;
  const stateLabel = activeAccount ? 'Conectado' : checking ? 'Verificando' : unavailable ? 'Indisponível' : 'Desconectado';
  const description = activeAccount?.email_address
    || (checking ? 'Verificando conta...' : unavailable ? 'Não foi possível verificar a conexão' : 'Não conectado');
  // "Não conectado" fala a mesma língua nas 3 telas (Conexões/Integrações/Omnichannel):
  // badge outline com o par status-offline. `destructive` fica reservado à falha real
  // (consulta indisponível).
  const offline = !activeAccount && !checking && !unavailable;
  const badgeVariant = activeAccount ? 'default' : unavailable ? 'destructive' : offline ? 'outline' : 'secondary';

  return (
    <Card className="border-secondary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted">
              <Mail className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Gmail</CardTitle>
              <CardDescription className="text-xs">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={badgeVariant}
            className={offline ? 'border-status-offline text-status-offline' : undefined}
          >
            {stateLabel}
          </Badge>
        </div>
      </CardHeader>
      {activeAccount && (
        <CardContent className="space-y-1 text-xs text-muted-foreground pb-2">
          {/* E46: exibir sync_status e last_error */}
          <div>Status: <span className="font-medium">{activeAccount.sync_status}</span></div>
          <div>Último sync: {activeAccount.last_sync_at ? format(new Date(activeAccount.last_sync_at), 'dd/MM HH:mm', { locale: ptBR }) : '—'}</div>
          {activeAccount.last_error && (
            <div className="text-destructive mt-1 p-2 bg-destructive/10 rounded text-xs">
              Erro: {activeAccount.last_error}
            </div>
          )}
        </CardContent>
      )}
      {!activeAccount && unavailable && (
        <CardContent className="pb-2 text-xs text-destructive">
          A consulta das contas falhou. A conta pode continuar conectada — tente verificar de novo antes de reconectar.
        </CardContent>
      )}
      <CardFooter className="gap-2 pt-0">
        {activeAccount ? (
          <>
            <Button size="sm" variant="outline" disabled={syncInbox.isPending} onClick={() => syncInbox.mutate({})}>
              {/* E47: spinner durante sync */}
              {syncInbox.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Sincronizar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => disconnectGmail.mutate(activeAccount.id)}>
              Desconectar
            </Button>
          </>
        ) : checking ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
            Verificando
          </Button>
        ) : unavailable ? (
          <Button size="sm" variant="outline" onClick={() => { void refetchAccounts?.(); }}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Tentar de novo
          </Button>
        ) : (
          <Button size="sm" onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending}>
            {connectGmail.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Conectar Gmail
          </Button>
        )}
      </CardFooter>
      {/* PM-48: limpeza dos dados guardados — so ADMIN e so CONTA DESCONECTADA. */}
      {disconnectedAccounts.length > 0 && <GmailPurgeSection accounts={disconnectedAccounts} />}
    </Card>
  );
}
