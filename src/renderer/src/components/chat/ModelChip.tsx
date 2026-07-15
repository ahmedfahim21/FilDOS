import type { AiModelState } from '@shared/types';
import { CLOUD_CONFIG_LIMITS, resolveLlmConfig } from '@shared/llmModels';
import { getCloudProvider, isCloudModelId } from '@shared/cloudLlm';
import { useChat } from '@/state/chat';
import { useNavigation } from '@/state/navigation';
import { modelLogo } from '@/lib/modelLogo';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATE_DOT } from './util';

/**
 * The model chip in the composer footer — a drop-up listing the models on this
 * device with the parameters set in Settings, plus a link to manage them.
 */
export function ModelChip() {
  const { modelId, statuses, configs, recommendedId, setModelId, allModels, cloudModels, modelDef } =
    useChat();
  const nav = useNavigation();
  const current = modelDef(modelId);
  const state: AiModelState = statuses[modelId]?.state ?? 'absent';

  // Only downloaded models are pickable in chat (built-in or custom); the
  // current selection always shows so a just-removed model doesn't vanish.
  const listed = allModels.filter(
    (def) => statuses[def.id]?.state === 'ready' || def.id === modelId,
  );

  /** "0.3 temp · 0.9 top-p · 1024 tok · 4k ctx" from the model's stored config. */
  const summary = (id: string) => {
    if (isCloudModelId(id)) {
      const cloud = cloudModels.find((m) => m.id === id);
      const cfg = resolveLlmConfig(id, configs[id], CLOUD_CONFIG_LIMITS);
      const provider = cloud ? (getCloudProvider(cloud.provider)?.label ?? cloud.provider) : 'cloud';
      return `${provider} · ${cfg.maxTokens} tok`;
    }
    const cfg = resolveLlmConfig(id, configs[id]);
    return `${cfg.temperature} temp · ${cfg.topP} top-p · ${cfg.maxTokens} tok · ${cfg.contextSize / 1024}k ctx`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1.5 rounded-md px-1.5 py-1 text-2xs font-medium"
          title="Choose the chat model"
        >
          {current ? (
            <img src={modelLogo(current.family)} alt={current.family} className="size-3.5 rounded-sm object-contain" />
          ) : (
            <span className={cn('size-1.5 rounded-full', STATE_DOT[state])} />
          )}
          {current?.label ?? modelId}
          {isCloudModelId(modelId) && (
            <Icon name="cloud" size={11} className="text-blueberry" aria-label="Cloud model" />
          )}
          <Icon name="chevron" size={10} className="-rotate-90 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        {listed.length === 0 && (
          <div className="text-muted-foreground px-2 py-2 text-2xs">
            No models on this device yet.
          </div>
        )}
        {listed.map((def) => {
          const status = statuses[def.id];
          const s: AiModelState = status?.state ?? 'absent';
          return (
            <DropdownMenuItem
              key={def.id}
              onClick={() => setModelId(def.id)}
              className="flex-col items-start gap-0.5 py-2"
            >
              <div className="flex w-full items-center gap-2">
                <div className="relative shrink-0">
                  <img src={modelLogo(def.family)} alt={def.family} className="size-5 rounded-sm object-contain" />
                  <span className={cn('absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-popover', STATE_DOT[s])} />
                </div>
                <span className="text-sm font-medium">{def.label}</span>
                {def.modality === 'vision' && (
                  <span className="bg-blueberry/15 text-blueberry rounded-full px-1.5 py-px text-3xs font-medium">
                    Vision
                  </span>
                )}
                {def.id === recommendedId && (
                  <span className="bg-mint/15 text-mint rounded-full px-1.5 py-px text-3xs font-medium">
                    Recommended
                  </span>
                )}
                <span className="text-muted-foreground ml-auto font-mono text-3xs">
                  {s === 'ready'
                    ? ''
                    : s === 'downloading'
                      ? `${Math.round((status?.progress ?? 0) * 100)}%`
                      : 'not downloaded'}
                </span>
                {def.id === modelId && <Icon name="check" size={13} className="text-mint" />}
              </div>
              <span className="text-muted-foreground pl-3.5 font-mono text-3xs">{summary(def.id)}</span>
            </DropdownMenuItem>
          );
        })}
        {cloudModels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-3xs font-medium tracking-wider uppercase">
              <Icon name="cloud" size={11} />
              Cloud — leaves this device
            </div>
            {cloudModels.map((def) => (
              <DropdownMenuItem
                key={def.id}
                onClick={() => setModelId(def.id)}
                className="flex-col items-start gap-0.5 py-2"
              >
                <div className="flex w-full items-center gap-2">
                  <img
                    src={modelLogo(def.family)}
                    alt={def.family}
                    className="size-5 shrink-0 rounded-sm object-contain"
                  />
                  <span className="text-sm font-medium">{def.label}</span>
                  {def.id === modelId && <Icon name="check" size={13} className="text-mint ml-auto" />}
                </div>
                <span className="text-muted-foreground pl-3.5 font-mono text-3xs">
                  {summary(def.id)}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => nav.openPage({ kind: 'settings' })}
          className="text-muted-foreground gap-2 text-xs"
        >
          <Icon name="settings" size={13} />
          Manage models in Settings…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
