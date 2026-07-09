import { useEffect, useState } from 'react';
import type { AccountRecord } from '@shared/types';
import { OPENDAL_BACKENDS, type BackendField } from '@shared/opendalBackends';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './Dialog';
import { Icon } from './Icon';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import gdriveLogo from '@/assets/cloud/GDrive.png';
import dropboxLogo from '@/assets/cloud/Dropbox.png';
import onedriveLogo from '@/assets/cloud/OneDrive.png';
import s3Logo from '@/assets/cloud/AmazonS3.webp';
import ipfsLogo from '@/assets/cloud/IPFS.png';
import megaLogo from '@/assets/cloud/mega.webp';

type Group = 'drives' | 'object';

interface ProviderDef {
  id: string;
  name: string;
  logo?: string;
  available: boolean;
  /** OAuth loopback flow, or a credentials form (OpenDAL config backends). */
  auth: 'oauth' | 'config';
  /** Fields to collect for a config backend. */
  fields?: BackendField[];
  unavailableReason?: string;
  /** One-line human descriptor shown under the name. */
  blurb: string;
  group: Group;
}

/** Presentation metadata (logo + descriptor + grouping) keyed by provider id. */
const META: Record<string, { logo?: string; blurb: string; group: Group }> = {
  gdrive: { logo: gdriveLogo, blurb: 'Personal cloud storage', group: 'drives' },
  dropbox: { logo: dropboxLogo, blurb: 'Personal cloud storage', group: 'drives' },
  onedrive: { logo: onedriveLogo, blurb: 'Personal cloud storage', group: 'drives' },
  mega: { logo: megaLogo, blurb: 'Personal cloud storage', group: 'drives' },
  s3: { logo: s3Logo, blurb: 'S3-compatible object storage', group: 'object' },
  ipfs: { logo: ipfsLogo, blurb: 'Content-addressed network', group: 'object' },
};

const PROVIDERS: ProviderDef[] = [
  { id: 'gdrive', name: 'Google Drive', available: true, auth: 'oauth' },
  { id: 'dropbox', name: 'Dropbox', available: true, auth: 'oauth' },
  ...OPENDAL_BACKENDS.map((b) => ({
    id: b.id,
    name: b.name,
    available: b.available,
    auth: b.auth,
    fields: b.fields,
    unavailableReason: b.unavailableReason,
  })),
  { id: 'mega', name: 'Mega', available: false, auth: 'oauth' as const },
].map((p) => ({ ...p, ...META[p.id] }) as ProviderDef);

const GROUPS: { id: Group; label: string }[] = [
  { id: 'drives', label: 'Personal drives' },
  { id: 'object', label: 'Object storage & networks' },
];

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-3.5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/** A consistent framed tile for the provider logo (transparent PNGs vary wildly). */
function LogoTile({ provider }: { provider: ProviderDef }) {
  return (
    <div className="bg-muted ring-border/60 flex size-10 shrink-0 items-center justify-center rounded-lg ring-1">
      {provider.logo ? (
        <img src={provider.logo} alt="" className="size-6 object-contain" />
      ) : (
        <Icon name="cloud" size={18} />
      )}
    </div>
  );
}

function ProviderRow({
  provider,
  accounts,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: {
  provider: ProviderDef;
  accounts: AccountRecord[];
  connecting: boolean;
  error?: string;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
}) {
  const connected = accounts.length > 0;

  return (
    <div className={cn('flex items-start gap-3.5 p-4', !provider.available && 'opacity-55')}>
      <LogoTile provider={provider} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">{provider.name}</span>
          {connected && (
            <span className="bg-mint/15 text-mint inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-3xs font-medium">
              {accounts.length > 1 ? `${accounts.length} accounts` : 'Connected'}
            </span>
          )}
        </div>

        {/* Secondary line: waiting hint → error → descriptor. */}
        {connecting ? (
          <p className="text-muted-foreground mt-0.5 text-2xs">Waiting for your browser…</p>
        ) : error ? (
          <p className="text-destructive mt-0.5 text-2xs leading-snug">{error}</p>
        ) : (
          <p className="text-muted-foreground mt-0.5 text-2xs">
            {provider.available ? provider.blurb : (provider.unavailableReason ?? 'Coming soon')}
          </p>
        )}

        {/* Connected accounts */}
        {connected && (
          <div className="mt-2 flex flex-col gap-1">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="bg-muted/60 group/acc flex items-center gap-2 rounded-md px-2.5 py-1.5"
              >
                <span className="bg-mint size-1.5 shrink-0 rounded-full" />
                <span className="text-foreground min-w-0 flex-1 truncate text-2xs">{account.label}</span>
                <button
                  className="text-muted-foreground hover:text-foreground focus-visible:text-foreground rounded p-0.5 opacity-0 transition-opacity group-hover/acc:opacity-100 focus-visible:opacity-100"
                  title={`Disconnect ${account.label}`}
                  onClick={() => onDisconnect(account.id)}
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 pt-0.5">
        {!provider.available ? (
          <span className="text-muted-foreground border-border rounded-md border border-dashed px-2.5 py-1 text-2xs">
            Soon
          </span>
        ) : connecting ? (
          <Button size="sm" variant="secondary" disabled className="cursor-wait">
            <Spinner />
            Authorizing…
          </Button>
        ) : (
          <Button size="sm" variant={connected ? 'secondary' : 'default'} onClick={onConnect}>
            {error ? (
              'Try again'
            ) : connected ? (
              <>
                <Icon name="plus" size={13} />
                Add
              </>
            ) : (
              'Connect'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Collects the credentials/options for a config-based backend (S3, IPFS, …). */
function BackendConnectDialog({
  provider,
  connecting,
  onCancel,
  onSubmit,
}: {
  provider: ProviderDef;
  connecting: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = provider.fields ?? [];
  const canSubmit = fields.every((f) => f.optional || values[f.key]?.trim());

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent showCloseButton={false} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <LogoTile provider={provider} />
            <div className="min-w-0">
              <DialogTitle>Connect {provider.name}</DialogTitle>
              <p className="text-muted-foreground mt-0.5 text-2xs">{provider.blurb}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3.5">
          {fields.map((f) => (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={`field-${f.key}`} className="text-2xs">
                {f.label}
                {f.optional && <span className="text-muted-foreground font-normal"> · optional</span>}
              </Label>
              <Input
                id={`field-${f.key}`}
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm"
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.help && <p className="text-muted-foreground text-2xs leading-snug">{f.help}</p>}
            </div>
          ))}
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-2xs">
          <Icon name="info" size={12} className="shrink-0" />
          Credentials are encrypted on this device and never leave it.
        </p>

        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={connecting}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(values)} disabled={!canSubmit || connecting}>
            {connecting ? (
              <>
                <Spinner />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloudConnectView({ onAccountsChanged }: { onAccountsChanged: () => void }) {
  const { notify, notifyError } = useToast();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDisconnect, setPendingDisconnect] = useState<AccountRecord | null>(null);
  const [formProvider, setFormProvider] = useState<ProviderDef | null>(null);

  useEffect(() => {
    window.cloud.listAccounts().then((res) => {
      if (res.ok) setAccounts(res.data);
    });
  }, []);

  function clearError(providerId: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  }

  /** Fold a connect result into state, shared by both the OAuth and config flows. */
  function applyConnectResult(providerId: string, result: Awaited<ReturnType<typeof window.cloud.connect>>) {
    setConnecting(null);
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [providerId]: result.error.message }));
      return false;
    }
    setAccounts((prev) => [...prev, result.data]);
    onAccountsChanged();
    notify('success', `Connected ${result.data.label}`);
    return true;
  }

  function handleConnect(provider: ProviderDef) {
    clearError(provider.id);
    // Config backends collect credentials in a form before connecting.
    if (provider.auth === 'config') {
      setFormProvider(provider);
      return;
    }
    setConnecting(provider.id);
    window.cloud.connect(provider.id).then((result) => applyConnectResult(provider.id, result));
  }

  async function handleConfigSubmit(provider: ProviderDef, values: Record<string, string>) {
    setConnecting(provider.id);
    clearError(provider.id);
    const result = await window.cloud.connectConfig(provider.id, values);
    if (applyConnectResult(provider.id, result)) setFormProvider(null);
  }

  async function handleDisconnect(accountId: string) {
    const result = await window.cloud.disconnect(accountId);
    if (!result.ok) {
      notifyError(result.error);
    } else {
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      onAccountsChanged();
    }
  }

  async function confirmDisconnect() {
    if (!pendingDisconnect) return;
    const account = pendingDisconnect;
    setPendingDisconnect(null);
    await handleDisconnect(account.id);
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-foreground mb-1 text-xl font-medium">Cloud Storage</h1>
            <p className="text-muted-foreground text-sm">
              Browse and manage cloud files right alongside your local ones.
            </p>
          </div>
          {accounts.length > 0 && (
            <span className="text-muted-foreground border-border mt-1 shrink-0 rounded-full border px-2.5 py-1 text-2xs">
              {accounts.length} connected
            </span>
          )}
        </header>

        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => {
            const inGroup = PROVIDERS.filter((p) => p.group === group.id);
            if (inGroup.length === 0) return null;
            return (
              <section key={group.id}>
                <div className="text-muted-foreground mb-2 px-1 text-2xs font-medium tracking-wider uppercase">
                  {group.label}
                </div>
                <div className="border-border bg-card divide-border/70 divide-y overflow-hidden rounded-xl border">
                  {inGroup.map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      accounts={accounts.filter((a) => a.provider === provider.id)}
                      connecting={connecting === provider.id}
                      error={errors[provider.id]}
                      onConnect={() => handleConnect(provider)}
                      onDisconnect={(id) => {
                        const account = accounts.find((a) => a.id === id);
                        if (account) setPendingDisconnect(account);
                      }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {formProvider && (
        <BackendConnectDialog
          provider={formProvider}
          connecting={connecting === formProvider.id}
          onCancel={() => setFormProvider(null)}
          onSubmit={(values) => handleConfigSubmit(formProvider, values)}
        />
      )}

      {pendingDisconnect && (
        <ConfirmDialog
          title="Disconnect account?"
          message={`"${pendingDisconnect.label}" (${PROVIDERS.find((p) => p.id === pendingDisconnect.provider)?.name ?? pendingDisconnect.provider}) will be removed. You can reconnect at any time.`}
          confirmLabel="Disconnect"
          danger
          onCancel={() => setPendingDisconnect(null)}
          onConfirm={confirmDisconnect}
        />
      )}
    </div>
  );
}
