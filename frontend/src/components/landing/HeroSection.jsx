import React from 'react';
import ParticleBackground from './ParticleBackground';
import { ChevronDown } from 'lucide-react';

const HeroSection = ({ onGetStarted, onLearnMore }) => {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-slate-950"
    >
      {/* Gradient mesh base — shows even when particles disabled */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-primary-600/25 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-teal-500/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary-800/15 rounded-full blur-[100px]" />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Particle layer */}
      <div className="absolute inset-0 pointer-events-none">
        <ParticleBackground />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto pt-20">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 text-teal-300 text-xs font-medium mb-8"
          data-aos="fade-down"
          data-aos-delay="100"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse-glow" />
          Built at SASTRA University
        </div>

        {/* Logo */}
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-glow-primary mb-8 animate-float"
          data-aos="fade-down"
          data-aos-delay="150"
        >
          <img
            src="/saradhi_ai_logo_final.png"
            alt="SARADHI-AI"
            className="w-12 h-12 object-contain"
          />
        </div>

        {/* Main headline */}
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-tight mb-6 tracking-tight"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          You teach{' '}
          <span className="bg-gradient-to-r from-primary-300 to-teal-300 bg-clip-text text-transparent">
            150 students.
          </span>
          <br />
          How many did you actually
          <br />
          <span className="bg-gradient-to-r from-accent-400 to-accent-300 bg-clip-text text-transparent">
            reach today?
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="300"
        >
          Most teachers will never know. SARADHI-AI changes that — so every
          question you ask gets an honest answer, and every student who's
          struggling becomes visible{' '}
          <em className="text-white not-italic font-medium">before the exam.</em>
        </p>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          data-aos="fade-up"
          data-aos-delay="400"
        >
          <button
            onClick={onGetStarted}
            className="px-8 py-3.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] shadow-glow-primary hover:shadow-glow-primary min-h-0 text-base"
          >
            See what you're missing
          </button>
          <button
            onClick={onLearnMore}
            className="px-8 py-3.5 border border-white/20 text-white font-medium rounded-xl hover:bg-white/10 hover:border-white/30 transition-all duration-150 min-h-0 text-base backdrop-blur-sm"
          >
            Try it yourself →
          </button>
        </div>

        {/* Scroll hint */}
        <div
          className="mt-16 flex flex-col items-center gap-2 text-white/30 text-xs"
          data-aos="fade-up"
          data-aos-delay="600"
        >
          <span>Scroll to find out</span>
          <ChevronDown className="w-4 h-4 animate-bounce" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
