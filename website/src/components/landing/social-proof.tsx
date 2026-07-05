const QUOTES = [
  {
    quote:
      "This was super cool to see. For years, I've been hoping for something like this — a way to deliver a high-quality product experience to users in a familiar setting.",
    name: "Juan Benet",
    role: "Founder & CEO, Protocol Labs",
    accent: "bg-mint",
  },
  {
    quote:
      "Clearly frames the usability gap in decentralized storage. The product is compelling, and I'm excited to see how it continues to differentiate from other storage + search solutions, AI or otherwise.",
    name: "Patrick Woodhead",
    role: "Co-Founder, Space Meridian",
    accent: "bg-blueberry",
  },
  {
    quote:
      "There's everything under the sun when it comes to file storage — but not with a paywall. It's a really powerful unique selling proposition.",
    name: "Sabeen Ali",
    role: "Founder & CEO, AngelHack",
    accent: "bg-mango",
  },
];

const BADGES = ["Open source (MIT)", "100% on-device AI", "No accounts, no telemetry"];

export function SocialProof() {
  return (
    <section id="social-proof" className="scroll-mt-16 bg-cloud/60 py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-mist">
            Reviews
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            People are noticing
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {QUOTES.map(({ quote, name, role, accent }) => (
            <figure
              key={name}
              className="flex flex-col justify-between rounded-3xl border border-ink/8 bg-white p-6 shadow-sm"
            >
              <blockquote className="text-sm leading-relaxed text-ink/80">
                <span
                  aria-hidden
                  className={`mb-4 block h-1 w-8 rounded-full ${accent}`}
                />
                “{quote}”
              </blockquote>
              <figcaption className="mt-5">
                <div className="text-sm font-medium text-ink">{name}</div>
                <div className="mt-0.5 text-xs text-mist">{role}</div>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-2.5 sm:mt-14">
          {BADGES.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-ink/10 bg-white px-3.5 py-1.5 font-mono text-[11px] text-ink/70"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
