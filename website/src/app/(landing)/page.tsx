import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { LandingAbout } from "@/components/landing/about";
import { LandingBento } from "@/components/landing/bento";
import { LandingCompare } from "@/components/landing/compare";
import { LandingCta } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <LandingNavbar />
      <main className="flex flex-col">
        <LandingHero />
        <LandingAbout />
        <LandingBento />
        <LandingCompare />
        <LandingCta />
      </main>
      <LandingFooter />
    </>
  );
}
