import React from 'react';
import { Shield, Lock, Heart } from 'lucide-react';

const trust = [
  {
    icon: Shield,
    color: 'text-primary-400',
    bg: 'bg-primary-400/10 border-primary-400/20',
    title: 'Your university login. Nothing else.',
    body: 'Sign in with your @sastra.edu account. No separate registration. No third-party accounts. Just your Google credentials.',
  },
  {
    icon: Lock,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10 border-teal-400/20',
    title: 'Teacher tools stay with teachers.',
    body: 'Role-based access enforced at every layer. Students see student tools. Teachers see teacher tools. No crossover.',
  },
  {
    icon: Heart,
    color: 'text-accent-400',
    bg: 'bg-accent-400/10 border-accent-400/20',
    title: 'Free. Open. Built for this campus.',
    body: 'No subscription. No upsell. No sales team. Just a tool that was built because someone here thought teaching deserved better.',
  },
];

const OriginSection = () => {
  return (
    <section id="origin" className="bg-section-alt py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <p
          className="text-xs font-semibold tracking-[0.2em] text-white/40 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          Not Another Edtech Startup
        </p>

        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-6 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          This wasn't built in Silicon Valley
          <br />
          for a pitch deck.
          <br />
          <span className="bg-gradient-to-r from-accent-300 to-primary-300 bg-clip-text text-transparent">
            It was built in Thanjavur
          </span>
          <br />
          for the classroom next door.
        </h2>

        <p
          className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-16 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          SARADHI-AI was born inside SASTRA University — by people who sit in
          the same lecture halls, deal with the same 150-student sections, and
          know exactly what doesn't work. Your login is your university Google
          account. Your data stays on university infrastructure.{' '}
          <span className="text-white">
            Just a tool that was built because someone here thought teaching
            deserved better technology.
          </span>
        </p>

        {/* Trust cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {trust.map((t, i) => (
            <div
              key={i}
              className="card-glass-dark rounded-2xl p-6 flex flex-col items-start gap-4"
              data-aos="fade-up"
              data-aos-delay={300 + i * 120}
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                <t.icon className={`w-5 h-5 ${t.color}`} />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm mb-2">{t.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{t.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Closing emotion */}
        <div
          className="mt-14 text-center"
          data-aos="fade-up"
          data-aos-delay="660"
        >
          <p className="text-white text-lg font-medium italic">
            "This is ours."
          </p>
        </div>
      </div>
    </section>
  );
};

export default OriginSection;
