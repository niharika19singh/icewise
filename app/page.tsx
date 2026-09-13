import Navbar from "@/components/navigation/Navbar";
import Hero from "@/components/hero/Hero";
import AboutSection from "@/components/sections/AboutSection";
import HowItWorksSection from "@/components/sections/HowItWorksSection";
import TechnologySection from "@/components/sections/TechnologySection";
import ArchitectureSection from "@/components/sections/ArchitectureSection";
import ImpactSection from "@/components/sections/ImpactSection";
import CommandCenterCTASection from "@/components/sections/CommandCenterCTASection";

export default function Home() {
  return (
    <main className="flex-1 bg-abyss">
      <Navbar />
      <Hero />
      <AboutSection />
      <HowItWorksSection />
      <TechnologySection />
      <ArchitectureSection />
      <ImpactSection />
      <CommandCenterCTASection />
    </main>
  );
}
