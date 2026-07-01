"use client";
import { Brain, Search, Shield, Users } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";

const steps = [
    {
        step: "1",
        title: "User buys storage → creates FolderNFTs",
        icon: Users,
        image: "/illustrations/buy-storage.png"
    },
    {
        step: "2",
        title: "Upload file → client encrypts → pushes to Filecoin Storage Providers",
        icon: Shield,
        image: "/illustrations/upload-file.png"
    },
    {
        step: "3",
        title: "Generates embeddings, tags",
        icon: Brain,
        image: "/illustrations/embeddings.png"
    },
    {
        step: "4",
        title: "Search via query like: notes from DAO call",
        icon: Search,
        image: "/illustrations/searching.png"
    }
];

export function HowItWorks() {
    const [activeStep, setActiveStep] = useState(0);
    const sectionRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
    
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });
 
    const stepProgress = useTransform(
        scrollYProgress,
        [0, 1],
        [0, steps.length - 1]
    );

    useEffect(() => {
        const unsubscribe = stepProgress.on("change", (latest) => {
            const newStep = Math.round(latest);
            if (newStep !== activeStep && newStep >= 0 && newStep < steps.length) {
                setActiveStep(newStep);
            }
        });

        return () => unsubscribe();
    }, [activeStep, stepProgress]);

    return (
        <section id="how-it-works" ref={sectionRef} className="relative bg-primary-foreground">
            <div ref={containerRef} style={{ height: `${steps.length * 60}vh` }} className="relative">
                {/* Sticky container */}
                <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
                    <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12">
                        <motion.div 
                            className="text-center mb-6 sm:mb-8 md:mb-10"
                            initial={{ opacity: 0, y: -20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            viewport={{ once: true }}
                        >
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium mb-2 sm:mb-3 text-gray-900">FLOW OF INTERACTION</h2>
                            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto px-2">
                                Simple steps to get your semantic storage up and running
                            </p>
                        </motion.div>

                        <div className="max-w-6xl mx-auto">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                        {/* Left side - Steps */}
                        <div className="space-y-3 sm:space-y-4">
                            {steps.map((item, index) => (
                                <motion.div
                                    key={index}
                                    ref={(el) => { stepRefs.current[index] = el; }}
                                    className="flex items-start space-x-2 sm:space-x-3 p-3 sm:p-4 cursor-pointer"
                                    onClick={() => setActiveStep(index)}
                                    initial={{ opacity: 0, x: -50 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                    viewport={{ once: true }}
                                    whileHover={{ scale: 1.01 }}
                                    animate={{
                                        scale: activeStep === index ? 1.01 : 1,
                                    }}
                                >
                                    <div className="flex-1 space-y-6">
                                        <div className="flex items-center space-x-4">
                                            <motion.div
                                                animate={{
                                                    opacity: activeStep === index ? 1 : 0.4,
                                                    scale: activeStep === index ? 1.4 : 1,
                                                }}
                                            >
                                                <item.icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 text-gray-700" />
                                            </motion.div>
                                            <motion.h3 
                                                className="text-[10px] sm:text-xs"
                                                animate={{
                                                    color: activeStep === index ? "rgb(17, 24, 39)" : "rgb(156, 163, 175)",
                                                    fontWeight: activeStep === index ? 700 : 400,
                                                }}
                                                transition={{ duration: 0.3 }}
                                            >
                                                {item.title.toUpperCase()}
                                            </motion.h3>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Right side - Image */}
                        <div className="relative lg:sticky lg:top-24 h-[250px] sm:h-[320px] lg:h-[400px] flex items-center justify-center">
                            <motion.div 
                                className="relative w-full h-full rounded-none border overflow-hidden"
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.6 }}
                                viewport={{ once: true }}
                            >
                                {steps.map((item, index) => (
                                    <motion.div
                                        key={index}
                                        className="absolute inset-0"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{
                                            opacity: activeStep === index ? 1 : 0,
                                            scale: activeStep === index ? 1 : 0.90,
                                            zIndex: activeStep === index ? 10 : 0
                                        }}
                                        transition={{ 
                                            duration: 0.8,
                                            ease: "easeInOut"
                                        }}
                                    >
                                        <Image
                                            src={item.image}
                                            alt={item.title}
                                            fill
                                            className="object-fill p-4 sm:p-6 md:p-8 lg:p-10 bg-white/70"
                                        />
                                    </motion.div>
                                ))}
                            </motion.div>
                        </div>
                    </div>
                </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
