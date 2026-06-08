"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useConnection } from "wagmi";
import ConnectButton from "@/components/connect-button";

export default function GetStarted() {
  const { isConnected } = useConnection();

  return (
    <div className="w-full flex flex-col h-screen bg-background">
      {/* <Navbar /> */}
      <main className="flex flex-col items-center justify-center flex-1 py-10 px-6 w-full mx-auto">
        <div className="max-w-2xl w-full space-y-6">
          {/* Header */}
          <div className="text-center space-y-4">
            <Badge className="bg-primary text-primary-foreground">Get Started</Badge>
            <h1 className="text-4xl font-medium text-foreground">
              Welcome to FilDOS
            </h1>
          </div>

          {/* Connection Status */}
          {!isConnected ? (
            <Card className="border-2 border-primary/20">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  Connect Your Wallet
                </CardTitle>
                <CardDescription>
                  Get ready to start using FilDOS decentralized storage
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center space-y-4">
                <ConnectButton />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">

              {/* Quick Start Card */}
              <Card className="border-2 border-secondary/20">
                <CardHeader>
                  <CardTitle>Ready to Get Started?</CardTitle>
                  <CardDescription>
                    Access your decentralized storage dashboard and start storing files
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Buy Storage and set up your account</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Create NFT-based folders</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Upload files</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Access files semantically</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Share folders with others</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Link href="/storage" className="flex-1">
                      <Button className="w-full bg-primary hover:bg-primary/90">
                        Go to Storage Dashboard
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href="/" className="flex-1">
                      <Button variant="outline" className="w-full">
                        View Dashboard
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
