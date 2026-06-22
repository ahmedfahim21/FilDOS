import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { TechStrip } from "@/components/landing/tech-strip";
import { Features } from "@/components/landing/features";
import { Showcase } from "@/components/landing/showcase";
import { OpenSource } from "@/components/landing/open-source";
import { Download } from "@/components/landing/download";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div id="top" className="relative overflow-x-hidden">
      <LandingNavbar />
      <main>
        <LandingHero />
        <TechStrip />
        <Features />
        <Showcase />
        <OpenSource />
        <Download />
      </main>
      <LandingFooter />
    </div>
  );
}
