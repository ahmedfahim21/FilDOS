import { Icon } from './Icon';

/** Suggested prompts shown in the empty state — hints at what the assistant will do. */
const SUGGESTIONS = [
  'Find the invoice I saved last week',
  'Summarise everything in this folder',
  'Which photos have mountains in them?',
];

/**
 * The Assistant rail — a right-hand chat panel toggled from the {@link TopBar}.
 * The conversational layer is part of the deferred AI phase, so for now this is
 * a foundation shell: an inert composer and a preview of what it will answer.
 * Its header aligns with the location row and sidebar logo header (h-11 +
 * border-b) so the chrome reads as one band.
 */
export function ChatSidebar({ onClose }: { onClose: () => void }) {
  return (
    <aside className="border-border bg-card animate-in slide-in-from-right-4 fade-in-0 flex w-80 shrink-0 flex-col border-l duration-200">
      <header className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <Icon name="sparkles" size={16} className="text-mint" />
        <span className="text-foreground text-sm font-medium">Assistant</span>
        <span className="bg-mint/12 text-mint ml-1 rounded-full px-1.5 py-0.5 text-3xs font-medium">
          Soon
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:bg-accent hover:text-foreground ml-auto grid size-7 place-items-center rounded-md"
          title="Close Assistant"
          aria-label="Close Assistant"
        >
          <Icon name="close" size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="bg-mint/10 ring-mint/20 flex size-12 items-center justify-center rounded-2xl ring-1">
          <Icon name="sparkles" size={22} className="text-mint" />
        </div>
        <div className="space-y-1">
          <div className="text-foreground text-sm font-medium">Chat with your files</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ask questions in plain language and get answers drawn from everything you’ve indexed.
            Coming in the AI phase.
          </p>
        </div>

        <div className="mt-1 flex w-full flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <div
              key={s}
              className="border-border/70 text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-left text-xs"
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      <div className="border-border border-t p-3">
        <div className="border-border bg-background flex items-center gap-2 rounded-lg border px-3 py-2 opacity-60">
          <Icon name="sparkles" size={14} className="text-muted-foreground" />
          <input
            disabled
            placeholder="Ask about your files…"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 cursor-not-allowed border-0 bg-transparent text-sm outline-none"
          />
        </div>
      </div>
    </aside>
  );
}
