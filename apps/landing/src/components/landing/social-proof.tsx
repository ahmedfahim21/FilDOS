import Image from "next/image";
import { Card, CardContent } from "../ui/card";

export function SocialProof() {
    return (
        <section id="social-proof" className="pt-12 sm:pt-16 md:pt-20 bg-primary-foreground">
            <div className="container mx-auto px-4 sm:px-6">
                <div className="text-center mb-8 sm:mb-12 md:mb-16">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-3 sm:mb-4 text-gray-900">TRUSTED BY INNOVATORS</h2>
                </div>

                {/* Testimonials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
                    <Card className="card-interactive border border-gray-200 group">
                        <CardContent className="p-4 sm:p-6">
                            <p className="text-gray-600 mb-3 sm:mb-4 italic text-xs sm:text-sm font-light">
                                &ldquo;This was super cool to see. For years, I&apos;ve been hoping for something like this — a way to deliver a high-quality product experience to users in a familiar setting.&rdquo;
                            </p>
                            <div className="flex items-center">
                                
                                <div>
                                    <div className="font-medium text-gray-900 text-sm sm:text-base">Juan Benet</div>
                                    <div className="text-xs sm:text-sm text-gray-500 font-light">Founder & CEO, Protocol Labs</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="card-interactive border border-gray-200 group">
                        <CardContent className="p-4 sm:p-6">
                            <p className="text-gray-600 mb-3 sm:mb-4 italic text-xs sm:text-sm font-light">
                                &ldquo;Clearly frames the usability gap in decentralized storage. The product is compelling, and I&apos;m excited to see how it continues to differentiate from other storage + search solutions, AI or otherwise.&rdquo;
                            </p>
                            <div className="flex items-center">
                                <div>
                                    <div className="font-medium text-gray-900 text-sm sm:text-base">Patrick Woodhead</div>
                                    <div className="text-xs sm:text-sm text-gray-500 font-light">Co-Founder, Space Meridian</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="card-interactive border border-gray-200 group">
                        <CardContent className="p-4 sm:p-6">
                            <p className="text-gray-600 mb-3 sm:mb-4 italic text-xs sm:text-sm font-light">
                                &ldquo;There&apos;s everything under the sun when it comes to file storage — but not with a paywall. Its a really powerful unique selling proposition.&rdquo;
                            </p>
                            <div className="flex items-center">
                                <div>
                                    <div className="font-medium text-gray-900 text-sm sm:text-base">Sabeen Ali</div>
                                    <div className="text-xs sm:text-sm text-gray-500 font-light">Founder & CEO, AngelHack</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Trust badges */}
                <div className="mt-12 sm:mt-16 text-center">
                    <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 font-light">Powered by industry-leading technologies</p>
                    <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-8">
                        <div className="flex items-center space-x-2 relative">
                            <Image src="/logos/filecoin.png" alt="Filecoin Logo" width={48} height={48} className="object-contain" />
                        </div>
                        <div className="flex items-center space-x-2 relative">
                            <Image src="/logos/ethereum.png" alt="Ethereum Logo" width={60} height={60} className="object-contain" />
                        </div>
                        <div className="flex items-center space-x-2 relative">
                            <Image src="/logos/filcdn.png" alt="FilCDN Logo" width={48} height={48} className="object-contain" />
                        </div>
                        <div className="flex items-center space-x-2 relative">
                            <Image src="/logos/openai.png" alt="OpenAI Logo" width={48} height={48} className="object-contain p-1" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
