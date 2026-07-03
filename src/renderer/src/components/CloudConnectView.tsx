import { useEffect, useState } from 'react';
import type { AccountRecord } from '@shared/types';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './Dialog';
import { Icon } from './Icon';
import gdriveLogo from '@/assets/cloud/GDrive.png';
import dropboxLogo from '@/assets/cloud/Dropbox.png';
import onedriveLogo from '@/assets/cloud/OneDrive.png';
import megaLogo from '@/assets/cloud/mega.webp';

interface ProviderDef {
  id: string;
  name: string;
  url: string;
  logo?: string;
  available: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'gdrive',
    name: 'Google Drive',
    url: 'https://drive.google.com',
    logo: gdriveLogo,
    available: true,
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    url: 'https://www.dropbox.com',
    logo: dropboxLogo,
    available: true,
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    url: 'https://onedrive.live.com',
    logo: onedriveLogo,
    available: false,
  },
  {
    id: 'mega',
    name: 'Mega',
    url: 'https://mega.io',
    logo: megaLogo,
    available: false,
  },
];

function Spinner() {
  return (
    <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ProviderCard({
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
  return (
    <div
      className={cn(
        'border-border bg-card flex flex-col rounded-xl border p-5 transition-colors',
        !provider.available && 'opacity-50',
        error && 'border-destructive/60',
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        {provider.logo ? (
          <img src={provider.logo} alt="" className="size-9 rounded-lg object-contain" />
        ) : (
          <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon name="cloud" size={20} />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-medium">{provider.name}</div>
          <a
            href={provider.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary truncate text-[11px] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {provider.url.replace(/^https?:\/\//, '')}
          </a>
        </div>
      </div>

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-primary/10 group flex items-center gap-2 rounded-md px-2.5 py-1.5"
            >
              <Icon name="check" size={12} />
              <span className="text-foreground min-w-0 flex-1 truncate text-[11px]">
                {account.label}
              </span>
              <button
                className="text-muted-foreground rounded p-0.5 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                title={`Disconnect ${account.label}`}
                onClick={() => onDisconnect(account.id)}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Error message */}
      {error && <p className="text-destructive mb-3 text-[11px] leading-snug">{error}</p>}

      {/* Connecting hint */}
      {connecting && (
        <p className="text-muted-foreground mb-2 text-center text-[11px]">
          Complete sign-in in your browser
        </p>
      )}

      {/* Action */}
      {provider.available ? (
        <button
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all',
            connecting
              ? 'border-border text-muted-foreground cursor-wait'
              : 'border-border text-foreground hover:bg-foreground/[0.08] active:opacity-90',
          )}
          onClick={onConnect}
          disabled={connecting || !provider.available}
        >
          {connecting ? (
            <>
              <Spinner />
              Authorizing…
            </>
          ) : error ? (
            'Try again'
          ) : accounts.length > 0 ? (
            'Add another account'
          ) : (
            'Connect'
          )}
        </button>
      ) : (
        <div className="border-border text-muted-foreground flex w-full items-center justify-center rounded-lg border border-dashed px-3 py-2 text-xs">
          Coming soon
        </div>
      )}
    </div>
  );
}

export function CloudConnectView({ onAccountsChanged }: { onAccountsChanged: () => void }) {
  const { notify, notifyError } = useToast();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDisconnect, setPendingDisconnect] = useState<AccountRecord | null>(null);

  useEffect(() => {
    window.cloud.listAccounts().then((res) => {
      if (res.ok) setAccounts(res.data);
    });
  }, []);

  async function handleConnect(providerId: string) {
    setConnecting(providerId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    const result = await window.cloud.connect(providerId);
    setConnecting(null);

    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [providerId]: result.error.message }));
    } else {
      setAccounts((prev) => [...prev, result.data]);
      onAccountsChanged();
      notify('success', `Connected ${result.data.label}`);
    }
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-foreground mb-1 text-xl font-medium">Cloud Storage</h1>
          <p className="text-muted-foreground text-sm">
            Connect accounts to browse and manage cloud files alongside local ones.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              accounts={accounts.filter((a) => a.provider === provider.id)}
              connecting={connecting === provider.id}
              error={errors[provider.id]}
              onConnect={() => handleConnect(provider.id)}
              onDisconnect={(id) => {
                const account = accounts.find((a) => a.id === id);
                if (account) setPendingDisconnect(account);
              }}
            />
          ))}
        </div>
      </div>

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
