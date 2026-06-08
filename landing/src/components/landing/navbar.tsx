"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Navbar,
  NavBody,
  NavItems,
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavbarButton,
} from "@/components/ui/resizable-navbar";

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "FEATURES", link: "#features" },
    { name: "HOW IT WORKS", link: "#how-it-works" },
    { name: "REVIEWS", link: "#social-proof" },
  ];

  return (
    <Navbar>
      <NavBody>
        <a
          href="#"
          className="relative z-20 mr-4 flex items-center gap-1 px-2 py-1 text-sm font-normal text-black"
        >
          <Image src="/FILDOS.png" alt="FilDOS Logo" width={32} height={32} className="w-10 h-10" />
          <span className="font-base text-secondary-foreground text-md">FilDOS</span>
        </a>
        <NavItems items={navLinks} />
        <NavbarButton href="https://app.fildos.cloud" variant="primary">
          My Storage
        </NavbarButton>
      </NavBody>
      <MobileNav>
        <MobileNavHeader>
          <a
            href="#"
            className="relative z-20 mr-4 flex items-center space-x-2 px-2 py-1 text-sm font-normal text-black"
          >
            <Image src="/FILDOS.png" alt="FilDOS Logo" width={32} height={32} className="w-8 h-8" />
            <span className="font-bold text-primary tracking-tight">FilDOS</span>
          </a>
          <MobileNavToggle
            isOpen={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          />
        </MobileNavHeader>
        <MobileNavMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
          {navLinks.map((link, idx) => (
            <a
              key={idx}
              href={link.link}
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-secondary-foreground"
            >
              {link.name}
            </a>
          ))}
          <div className="mt-4">
            <NavbarButton href="https://app.fildos.cloud" variant="primary">
              My Storage
            </NavbarButton>
          </div>
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  );
}