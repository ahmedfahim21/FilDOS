import { LandingNavbar } from "@/components/landing/navbar";
import { HeroCentered } from "@/components/landing/heroes/centered";
import { HeroSplit } from "@/components/landing/heroes/split";
import { HeroSpotlight } from "@/components/landing/heroes/spotlight";
import { HeroSwitcher, type HeroVariant } from "@/components/landing/heroes/switcher";
import { TechStrip } from "@/components/landing/tech-strip";
import { Features } from "@/components/landing/features";
import { Formats } from "@/components/landing/formats";
import { Ask } from "@/components/landing/ask";
import { Showcase } from "@/components/landing/showcase";
import { OpenSource } from "@/components/landing/open-source";
import { Download } from "@/components/landing/download";
import { LandingFooter } from "@/components/landing/footer";

const HEROES = {
  centered: HeroCentered,
  split: HeroSplit,
  spotlight: HeroSpotlight,
} as const;

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ hero?: string }>;
}) {
  const { hero } = await searchParams;
  const variant: HeroVariant = hero === "split" || hero === "spotlight" ? hero : "centered";
  const Hero = HEROES[variant];

  return (
    <div id="top" className="relative overflow-x-hidden">
      <LandingNavbar />
      <main>
        <Hero />
        <TechStrip />
        <Features />
        <Formats />
        <Ask />
        <Showcase />
        <OpenSource />
        <Download />
      </main>
      <LandingFooter />
      {/* Preview-only: remove once a hero direction is picked. */}
      <HeroSwitcher active={variant} />
    </div>
  );
}
