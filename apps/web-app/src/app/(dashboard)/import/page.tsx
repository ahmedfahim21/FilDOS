"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export default function ImportPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background">
      <div className="max-w-md w-full text-center space-y-8">
        {/* Google Drive Logo */}
        <div className="flex justify-center">
          <Image 
            src="/logos/Google_Drive.png"
            alt="Google Drive Logo"
            width={96}
            height={96}
          />
        </div>

        {/* Coming Soon Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mx-auto">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">Coming Soon</span>
        </div>

        {/* Title & Description */}
        <div className="space-y-4">
          <h1 className="text-xl font-medium text-foreground">
            Google Drive Bulk Import
          </h1>
          <p className="text-muted-foreground text-sm">
            We&apos;re working on bringing you seamless bulk import from Google Drive. 
            Soon you&apos;ll be able to migrate all your files to decentralized storage with just a few clicks.
          </p>
        </div>

        {/* Features Preview */}
        <div className="bg-muted/50 rounded-lg p-6 space-y-4">
          <h3 className="font-medium text-foreground">What to expect:</h3>
          <ul className="text-left text-muted-foreground space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              One-click Google Drive authentication
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Bulk select and import files & folders
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Preserve folder structure during migration
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              Automatic encryption for your privacy
            </li>
          </ul>
        </div>

        {/* Back Button */}
        <Button
          variant="outline"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}
