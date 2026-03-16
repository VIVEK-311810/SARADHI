import React from 'react';
import { Upload, Hash, Zap } from 'lucide-react';

const steps = [
  {
    icon: Upload,
    color: 'text-primary-400',
    bg: 'bg-primary-400/10 border-primary-400/30',
    step: '01',
    title: 'Drop your lecture materials',
    body: 'Upload your PDF, DOCX, or PPTX. The AI reads it, indexes it, and gets ready to answer student questions from it — in seconds.',
  },
  {
    icon: Hash,
    color: 'text-accent-400',
    bg: 'bg-accent-400/10 border-accent-400/30',
    step: '02',
    title: 'Start a session, share a code',
    body: 'Create a session, tell students the 6-digit code. They open a browser. Type the code. They\'re in. No app. No account creation. Nothing to install.',
  },
  {
    icon: Zap,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10 border-teal-400/30',
    step: '03',
    title: 'Teach as usual. The classroom responds.',
    body: 'Push a poll whenever you want a pulse check. Results stream in live. Students engage. AI generates quizzes from your slides. That\'s it.',
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="bg-section-dark py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <p
          className="text-xs font-semibold tracking-[0.2em] text-teal-400 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          No Training. No Setup. No IT Department.
        </p>

        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-4 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          If you can share a Google Doc,
          <br />
          <span className="bg-gradient-to-r from-teal-400 to-primary-400 bg-clip-text text-transparent">
            you can run SARADHI-AI.
          </span>
        </h2>

        <p
          className="text-lg text-slate-400 text-center max-w-xl mx-auto mb-16 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="150"
        >
          We built this for professors, not programmers. Three steps. Sixty
          seconds. That's the gap between your current classroom and an
          interactive one.
        </p>

        {/* Steps */}
        <div className="relative">
          {/* Connector line (desktop) */}
          <div
            className="hidden lg:block absolute top-12 left-[16.5%] right-[16.5%] h-px border-t-2 border-dashed border-white/10"
            data-aos="draw-line"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div
                key={i}
                className="relative flex flex-col items-center text-center"
                data-aos="fade-up"
                data-aos-delay={200 + i * 150}
              >
                {/* Step number */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 lg:mb-4">
                  <span className="text-xs font-mono font-bold text-white/20">{s.step}</span>
                </div>

                {/* Icon */}
                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mb-5 ${s.bg}`}>
                  <s.icon className={`w-7 h-7 ${s.color}`} />
                </div>

                {/* Card */}
                <div className="card-glass-dark rounded-2xl p-6 w-full">
                  <h3 className="text-white font-semibold text-base mb-3 leading-snug">
                    {s.title}
                  </h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Closing */}
        <div
          className="mt-14 text-center"
          data-aos="fade-up"
          data-aos-delay="650"
        >
          <p className="text-white/50 text-sm italic">
            "Wait, that's really all I have to do?"
          </p>
          <p className="text-white/30 text-sm mt-1">Yes. That's really all.</p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
