"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Wallet, LucideIcon } from 'lucide-react';
import Image from 'next/image';

interface ConnectWalletPromptProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  showConnectButton?: boolean;
  className?: string;
}

export function ConnectWalletPrompt({
  description = "Please connect your wallet to access this feature.",
  showConnectButton = false,
  className = "",
}: ConnectWalletPromptProps) {
  return (
    <div className={`flex items-center justify-center min-h-[60vh] ${className}`}>
      <div className="p-12 max-w-md mx-auto text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
          <Image className="w-14 h-14 text-primary" src="/FILDOS.png" alt="FilDOS" width={56} height={56} />
        </div>
        
        <h2 className="text-2xl font-semibold mb-3 text-foreground">
          Sign In
        </h2>
        
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {description}
        </p>

        {showConnectButton && (
          <Button size="lg" className="gap-2">
            <Wallet className="w-4 h-4" />
            Sign in
          </Button>
        )}

        <div className="mt-6 pt-6 border-t border-border/50">
          <p className="text-xs text-muted-foreground">
            Use the button in the top right corner to connect
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConnectWalletPrompt;
