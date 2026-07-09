import { useState } from 'react';
import type { AiModelState } from '@shared/types';
import { useChat } from '@/state/chat';
import { modelLogo } from '@/lib/modelLogo';
import { Icon } from '@/components/Icon';

/**
 * Shown above the composer while Research is on: it leans on context and tool
 * use, so a small model leaves capability on the table. When the machine's
 * recommended model isn't the one selected, nudge toward it — switch in place
 * if it's already downloaded, otherwise select it so the composer offers the
 * one-time download.
 */
export function ResearchCallout() {
  const chat = useChat();
  const [dismissed, setDismissed] = useState(false);
  const { recommendedId, modelId, modelDef, statuses, setModelId } = chat;

  if (dismissed || !recommendedId || recommendedId === modelId) return null;
  const rec = modelDef(recommendedId);
  if (!rec) return null;
  const recState: AiModelState = statuses[recommendedId]?.state ?? 'absent';
  const ready = recState === 'ready';

  return (
    <div className="px-3 pt-3">
      <div className="border-border bg-muted/40 flex items-center gap-2.5 rounded-xl border px-3 py-2">
        <span className="bg-mint/10 text-mint grid size-6 shrink-0 place-items-center rounded-lg">
          <Icon name="sparkles" size={13} />
        </span>
        <div className="min-w-0 flex-1 text-xs">
          <span className="text-foreground font-medium">Research works best with a capable model.</span>{' '}
          <span className="text-muted-foreground">
            <span className="inline-flex items-center gap-1 align-middle">
              <img src={modelLogo(rec.family)} alt="" className="size-3.5 rounded-sm object-contain" />
              {rec.label}
            </span>{' '}
            is recommended for this machine.
          </span>
        </div>
        <button
          onClick={() => setModelId(recommendedId)}
          className={
            ready
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 rounded-md px-2.5 py-1 text-2xs font-medium'
              : 'border-border hover:bg-accent text-foreground shrink-0 rounded-md border px-2.5 py-1 text-2xs font-medium'
          }
          title={ready ? undefined : 'Select it, then download from the composer'}
        >
          {ready ? 'Switch' : 'Use it'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground grid size-6 shrink-0 place-items-center rounded-md"
          aria-label="Dismiss"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}
