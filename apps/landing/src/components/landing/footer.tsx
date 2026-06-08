"use client";
import Image from "next/image";
import { Separator } from "../ui/separator";
import Link from "next/link";
import { Button } from "../ui/button";
import { Twitter } from "lucide-react";

export function LandingFooter() {
    return (
        <>
            <section className="relative py-12 sm:py-16 md:py-20 bg-primary-foreground overflow-hidden">
                <div className="absolute inset-0 w-full h-full z-0 opacity-25">
                </div>
                <div className="container mx-auto px-4 sm:px-6 text-center relative z-10">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-3 sm:mb-4">
                        READY TO EXPERIENCE THE FUTURE OF STORAGE?
                    </h2>
                    <div className="w-full max-w-xs sm:max-w-md md:max-w-2xl lg:max-w-4xl mx-auto mt-8 sm:mt-10 px-2 sm:px-0">
                        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                            <iframe 
                                className="absolute top-0 left-0 w-full h-full rounded-sm opacity-80"
                                src="https://www.youtube.com/embed/fFJgACii3tM?si=vz6sEukN3K1oRKfn" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                                allowFullScreen
                            ></iframe>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="relative bg-primary text-white pt-8 sm:pt-12 pb-4 overflow-hidden">
                <div className="absolute inset-0 w-full h-full z-0 opacity-20">
                </div>
                <div className="container mx-auto px-4 sm:px-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center">
                        <div>
                            <div className="flex items-center space-x-2 mb-3 sm:mb-4">
                                <Image src="/FILDOS.png" alt="FilDOS Logo" width={32} height={32} className="w-6 h-6 sm:w-8 sm:h-8" />
                                <h3 className="text-lg sm:text-xl font-medium">FilDOS</h3>
                            </div>
                            <p className="text-slate-100 text-sm sm:text-base font-light">
                                A Secure, AI-Native, Meaning-First Decentralized Drive
                            </p>
                        </div>
                        <div className="flex flex-col md:items-end items-start gap-3 sm:gap-4 mt-6 sm:mt-8 md:mt-0">
                            <span className="text-slate-100 mb-1 sm:mb-2 text-sm sm:text-base font-light">Follow us for updates:</span>
                            <Link href="https://x.com/fildos_cloud" target="_blank" rel="noopener noreferrer">
                                <Button variant="outline" className="flex font-light items-center gap-2 border-gray-700 text-white bg-gray-800 hover:bg-gray-700 text-sm sm:text-base">
                                    <Twitter className="w-4 h-4 sm:w-5 sm:h-5" />
                                    <span>X (Twitter)</span>
                                </Button>
                            </Link>
                        </div>
                    </div>

                    <Separator className="mt-6 sm:mt-8 mb-3 sm:mb-4 bg-white/80" />

                    <div className="text-center text-gray-100 text-xs sm:text-sm font-light">
                        <p>&copy; 2025 FilDOS. All rights reserved</p>
                    </div>
                </div>
            </footer>
        </>
    );
}