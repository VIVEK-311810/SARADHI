import React, { useEffect } from 'react';
import AOS from 'aos';
import 'aos/dist/aos.css';

import LandingNavbar from './LandingNavbar';
import HeroSection from './HeroSection';
import ProblemSection from './ProblemSection';
import TurningPointSection from './TurningPointSection';
import RealTimeSection from './RealTimeSection';
import AISection from './AISection';
import GamificationSection from './GamificationSection';
import AnalyticsSection from './AnalyticsSection';
import HowItWorksSection from './HowItWorksSection';
import OriginSection from './OriginSection';
import CTASection from './CTASection';
import SalesAgentWidget from './SalesAgentWidget';

const LandingPage = () => {
  useEffect(() => {
    // Enable smooth scroll only on landing page
    document.documentElement.classList.add('landing-scroll');

    AOS.init({
      duration: 700,
      once: true,
      easing: 'ease-out-cubic',
      offset: 60,
    });

    return () => {
      document.documentElement.classList.remove('landing-scroll');
    };
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <LandingNavbar />

      <main>
        <HeroSection
          onGetStarted={() => scrollToSection('problem')}
          onLearnMore={() => scrollToSection('get-started')}
        />
        <ProblemSection />
        <TurningPointSection />
        <RealTimeSection />
        <AISection />
        <GamificationSection />
        <AnalyticsSection />
        <HowItWorksSection />
        <OriginSection />
        <CTASection />
      </main>

      <SalesAgentWidget />

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-white/5 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <img
              src="/saradhi_ai_logo_final.png"
              alt="SARADHI-AI"
              className="w-5 h-5 object-contain opacity-40"
            />
            <span>SARADHI-AI · SASTRA University</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => scrollToSection('hero')}
              className="hover:text-slate-400 transition-colors duration-150 min-h-0"
            >
              Back to top
            </button>
            <button
              onClick={() => scrollToSection('get-started')}
              className="hover:text-slate-400 transition-colors duration-150 min-h-0"
            >
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
