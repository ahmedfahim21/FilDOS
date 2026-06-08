import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import Image from "next/image";

export function LandingAbout() {
    return (
        <>
            <section className="pt-12 sm:pt-16 md:pt-20 bg-primary-foreground">
                <div className="container mx-auto px-4 sm:px-6">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-4 sm:mb-6 text-gray-900">WHAT IS IT?</h2>
                        <p className="text-sm sm:text-lg font-light text-gray-700 leading-relaxed text-justify">
                            <strong>FilDOS</strong> is a decentralized drive built on Filecoin, reimagined for the AI era.{" "}
                            It lets you store, search, and share files by meaning, not by raw identifiers like CIDs.
                            With AI-native and agent-compatible access, FilDOS transforms decentralized storage into a semantic memory layer — 
                            where data becomes intelligent, discoverable, and alive.
                        </p>
                    </div>
                </div>
            </section>

            <section id="features" className="relative pt-12 sm:pt-16 md:pt-20 bg-primary-foreground overflow-hidden">
                <div className="relative w-full overflow-hidden rounded-none">
                    <div className="container mx-auto px-4 sm:px-6 relative z-10">
                        <div className="text-center mb-8 sm:mb-12 md:mb-16">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-3 sm:mb-4 text-gray-900">WHAT MAKES US DIFFERENT?</h2>
                            <p className="text-md sm:text-md font-base text-gray-700 max-w-2xl mx-auto px-2">
                                Revolutionary features that make FilDOS the future of decentralized storage
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
                            {/* Vertically taller cards, all images same height, object-cover, border, zoom on hover */}
                            <Card className="border transition-all duration-300  group  flex flex-col justify-between">
                                <CardHeader className="text-center p-0 mb-4 sm:mb-6">
                                    <div className="w-full flex justify-center items-start overflow-hidden mb-2 p-0">
                                        <Image src="/illustrations/nft-folders.png" alt="Feature" width={320} height={220} className="w-full h-[180px] sm:h-[200px] md:h-[220px] object-cover border-b rounded-t-md transition-transform duration-300 group-hover:scale-105 group-hover:brightness-95" />
                                    </div>
                                    <CardTitle className="text-base sm:text-lg px-2">ORGANISATION REIMAGINED</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6">
                                    <p className="text-gray-600 font-light text-xs sm:text-sm group-hover:text-gray-700 transition-colors text-justify">
                                        Folders aren&apos;t just file paths. They&apos;re NFTs with logic, metadata, and intelligence.
                                        Own your storage. Program it. Compose it.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border transition-all duration-300  group  flex flex-col justify-between">
                                <CardHeader className="text-center p-0 mb-4 sm:mb-6">
                                    <div className="w-full flex justify-center items-start overflow-hidden mb-2 p-0">
                                        <Image src="/illustrations/semantic-search.png" alt="Feature" width={320} height={220} className="w-full h-[180px] sm:h-[200px] md:h-[220px] object-cover border-b rounded-t-md transition-transform duration-300 group-hover:scale-105 group-hover:brightness-95" />
                                    </div>
                                    <CardTitle className="text-base sm:text-lg px-2">MEANING-FIRST SEARCH</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6">
                                    <p className="text-gray-600 font-light text-xs sm:text-sm group-hover:text-gray-700 transition-colors text-justify">
                                        Search naturally like you think.<br />
                                        FilDOS understands context using embeddings, making every search feel intuitive and human.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border transition-all duration-300  group  flex flex-col justify-between">
                                <CardHeader className="text-center p-0 mb-4 sm:mb-6">
                                    <div className="w-full flex justify-center items-start overflow-hidden mb-2 p-0">
                                        <Image src="/illustrations/ai-native.png" alt="Feature" width={320} height={220} className="w-full h-[180px] sm:h-[200px] md:h-[220px] object-cover border-b rounded-t-md transition-transform duration-300 group-hover:scale-105 group-hover:brightness-95" />
                                    </div>
                                    <CardTitle className="text-base sm:text-lg px-2">AI-NATIVE & AGENT-READY</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6">
                                    <p className="text-gray-600 font-light text-xs sm:text-sm group-hover:text-gray-700 transition-colors text-justify">
                                        Built for the next generation of intelligent systems.
                                        Agents can organize, label, and access files autonomously.
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="border transition-all duration-300  group  flex flex-col justify-between">
                                <CardHeader className="text-center p-0 mb-4 sm:mb-6">
                                    <div className="w-full flex justify-center items-start overflow-hidden mb-2 p-0">
                                        <Image src="/illustrations/seamless-ux.png" alt="Feature" width={320} height={220} className="w-full h-[180px] sm:h-[200px] md:h-[220px] object-cover border-b rounded-t-md transition-transform duration-300 group-hover:scale-105 group-hover:brightness-95" />
                                    </div>
                                    <CardTitle className="text-base sm:text-lg px-2">SEAMLESS USER EXPERIENCE</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-6">
                                    <p className="text-gray-600 font-light text-xs sm:text-sm group-hover:text-gray-700 transition-colors text-justify">
                                        No CIDs. No friction.<br />
                                        Just a beautiful, intuitive web app that makes decentralized storage feel effortless.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}