import React from 'react';
import { Users } from 'lucide-react';

const TurningPointSection = () => {
  return (
    <section id="solution" className="bg-section-alt py-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Eyebrow */}
        <p
          className="text-xs font-semibold tracking-[0.2em] text-primary-400 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          Now Imagine This
        </p>

        {/* Headline */}
        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-6 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          What if you could hear{' '}
          <span className="bg-gradient-to-r from-primary-400 to-teal-300 bg-clip-text text-transparent">
            every student at once
          </span>{' '}
          — without anyone saying a word?
        </h2>

        {/* Story body */}
        <p
          className="text-lg text-slate-300 text-center max-w-2xl mx-auto mb-14 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          Imagine you just explained Kirchhoff's Law. Instead of asking "any
          doubts?" to a silent room, you push a quick question to every phone
          in the hall.
        </p>

        {/* The moment — browser mockup with live poll */}
        <div
          className="max-w-2xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="300"
        >
          <div className="card-glass-dark rounded-2xl overflow-hidden border border-white/10">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <div className="ml-3 flex-1 bg-white/10 rounded px-3 py-0.5 text-xs text-slate-400">
                saradhi.ai — Live Session
              </div>
            </div>

            {/* Poll content */}
            <div className="p-6">
              <p className="text-white/60 text-xs font-medium mb-1">LIVE POLL · 30 seconds</p>
              <p className="text-white font-semibold mb-5">
                In Kirchhoff's Voltage Law, the algebraic sum of voltages around a loop is:
              </p>

              {/* Options with animated bars */}
              {[
                { label: 'A. Equal to the current', pct: '8%', color: 'bg-slate-600', textColor: 'text-slate-400' },
                { label: 'B. Always positive', pct: '16%', color: 'bg-slate-600', textColor: 'text-slate-400' },
                { label: 'C. Zero', pct: '76%', color: 'bg-primary-500', textColor: 'text-primary-300' },
                { label: 'D. Equal to resistance', pct: '0%', color: 'bg-slate-600', textColor: 'text-slate-400' },
              ].map((opt, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className={opt.textColor + ' font-medium'}>{opt.label}</span>
                    <span className={opt.textColor}>{opt.pct}</span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${opt.color} rounded-full transition-all duration-1000`}
                      style={{ width: opt.pct }}
                    />
                  </div>
                </div>
              ))}

              {/* Response count */}
              <div className="mt-5 flex items-center gap-2 text-teal-400 text-sm">
                <Users className="w-4 h-4" />
                <span className="font-semibold">147 responses</span>
                <span className="text-slate-500">· 35 students chose B — misconception flagged</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reveal text */}
        <div
          className="mt-12 text-center max-w-2xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="450"
        >
          <p className="text-slate-300 text-lg leading-relaxed">
            In 30 seconds, 147 responses appear on your screen.{' '}
            <strong className="text-white">112 got it. 35 chose the wrong answer</strong>{' '}
            — and you can see exactly which misconception tripped them up. You
            reteach that one part. Two minutes. Done.{' '}
            <span className="text-teal-300">
              Nobody had to raise their hand. Nobody had to feel stupid.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
};

export default TurningPointSection;
