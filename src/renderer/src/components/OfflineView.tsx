import { Icon } from './Icon';

/**
 * Shown in place of the file browser when the current folder is a cloud account
 * but the machine has no network connection — reaching the provider is
 * impossible offline, so we surface a calm "you're offline" state instead of a
 * raw network error.
 */
export function OfflineView({
  provider,
  onRetry,
}: {
  /** Display name of the cloud provider being browsed, if known. */
  provider?: string;
  /** Re-attempt the load (used once the connection is back). */
  onRetry: () => void;
}) {
  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <Icon name="offline" size={26} />
      </div>
      <div className="space-y-1">
        <div className="text-foreground text-base font-semibold">You’re offline</div>
        <p className="max-w-xs text-sm">
          {provider ? `${provider} needs an internet connection.` : 'This cloud folder needs an internet connection.'}{' '}
          Your local files are still available.
        </p>
      </div>
      <button
        className="border-border text-foreground hover:bg-foreground/[0.08] mt-1 rounded-lg border px-3 py-1.5 text-sm font-medium"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}
