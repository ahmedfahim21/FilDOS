import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { LandingAbout } from "@/components/landing/about";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SocialProof } from "@/components/landing/social-proof";
import { LandingCta } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <LandingNavbar />
      <main className="flex flex-col">
        <LandingHero />
        <LandingAbout />
        <HowItWorks />
        <SocialProof />
        <LandingCta />
      </main>
      <LandingFooter />
    </>
  );
}
