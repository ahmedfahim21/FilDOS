import type { Metadata } from "next";
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { Roadmap } from "@/components/roadmap/roadmap";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What's shipped in FilDOS today and what's coming next — semantic search, chat with your files, on-device AI, and more. All running locally on your machine.",
  alternates: {
    canonical: "/roadmap",
  },
};

export default function RoadmapPage() {
  return (
    <>
      <LandingNavbar />
      <main className="flex flex-col">
        <Roadmap />
      </main>
      <LandingFooter />
    </>
  );
}
