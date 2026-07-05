import Image from "next/image";

const QUOTES = [
  {
    quote:
      "This was super cool to see. For years, I've been hoping for something like this — a way to deliver a high-quality product experience to users in a familiar setting.",
    name: "Juan Benet",
    role: "Founder & CEO",
    logo: { src: "/logos/ProtocolLabs.png", alt: "Protocol Labs", w: 470, h: 170 },
  },
  {
    quote:
      "Clearly frames the usability gap in storage. The product is compelling, and I'm excited to see how it continues to differentiate from other storage + search solutions, AI or otherwise.",
    name: "Patrick Woodhead",
    role: "Co-Founder",
    logo: { src: "/logos/SpaceMeridian.svg", alt: "Space Meridian", w: 565, h: 242 },
  },
];

export function SocialProof() {
  return (
    <section id="social-proof" className="scroll-mt-16 bg-cloud/60 py-16 sm:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-ink/60">
            Reviews
          </span>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            What people are saying
          </h2>
          <p className="mt-4 text-base text-mist sm:text-lg">
            Early reactions from people who have spent their careers working
            with storage.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {QUOTES.map(({ quote, name, role, logo }) => (
            <figure
              key={name}
              className="flex flex-col rounded-3xl border border-ink/8 bg-white p-7 shadow-sm sm:p-8"
            >
              <blockquote className="flex-1 text-[15px] leading-relaxed text-ink/80">
                “{quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center justify-between gap-4 border-t border-ink/8 pt-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{name}</div>
                  <div className="mt-0.5 truncate text-xs text-mist">{role}</div>
                </div>
                <Image
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.w}
                  height={logo.h}
                  unoptimized
                  className="h-12 w-auto max-w-36 shrink-0 object-contain"
                />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
