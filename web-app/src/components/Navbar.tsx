"use client";

import Image from "next/image";
import ConnectButton from "./connect-button";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-16 items-center justify-between px-3 sm:px-6">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2">
          <Image
            src="/FILDOS.png"
            alt="FilDOS"
            width={48}
            height={48}
            className="w-10 h-10 sm:w-12 sm:h-12"
          />
          <div>
            <h1 className="text-lg text-foreground">FilDOS</h1>
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 sm:gap-3 mr-12">
          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
