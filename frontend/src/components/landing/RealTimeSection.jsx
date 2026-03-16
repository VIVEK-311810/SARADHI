import React from 'react';
import { Zap } from 'lucide-react';

const checkpoints = [
  { time: '0 min', label: 'Session starts', active: true },
  { time: '15 min', label: 'Attention drops', warning: true },
  { time: '16 min', label: 'Poll launched', active: true },
  { time: '30 min', label: 'Back on track', active: true },
  { time: '45 min', label: 'Another check', active: true },
  { time: '60 min', label: 'Session ends', active: true },
];

const RealTimeSection = () => {
  return (
    <section id="realtime" className="bg-section-dark py-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Eyebrow */}
        <p
          className="text-xs font-semibold tracking-[0.2em] text-accent-400 uppercase mb-4 text-center"
          data-aos="fade-up"
        >
          The 15-Minute Problem
        </p>

        {/* Headline */}
        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-6 max-w-3xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="100"
        >
          A student lost at{' '}
          <span className="text-accent-400">minute 15</span>
          <br />
          is still lost at minute 75.
          <br />
          <span className="text-white/50 text-3xl sm:text-4xl">
            Unless you catch it at minute 16.
          </span>
        </h2>

        {/* Body */}
        <p
          className="text-lg text-slate-400 text-center max-w-2xl mx-auto mb-16 leading-relaxed"
          data-aos="fade-up"
          data-aos-delay="200"
        >
          Research says attention drops sharply after 15 minutes. That's not a
          student problem — that's a signal. The teachers who hold attention
          aren't louder or funnier. They{' '}
          <strong className="text-white">check in. They adapt. They course-correct.</strong>{' '}
          But you can't do that by reading faces in a 200-seat hall.
        </p>

        {/* Attention timeline visual */}
        <div
          className="max-w-3xl mx-auto mb-16"
          data-aos="fade-up"
          data-aos-delay="300"
        >
          <div className="card-glass-dark rounded-2xl p-6 sm:p-8">
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-6 text-center">
              Attention in a 60-minute lecture
            </p>

            {/* Attention curve */}
            <div className="relative h-24 mb-6">
              <svg viewBox="0 0 600 96" className="w-full h-full" preserveAspectRatio="none">
                {/* Drop curve */}
                <defs>
                  <linearGradient id="attnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.8" />
                    <stop offset="25%" stopColor="#F97316" stopOpacity="0.9" />
                    <stop offset="30%" stopColor="#22C55E" stopOpacity="0.9" />
                    <stop offset="75%" stopColor="#4F46E5" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                {/* Fill area */}
                <path
                  d="M0,10 C60,10 100,12 150,50 C160,58 160,70 180,88 L180,96 L0,96 Z"
                  fill="rgba(249,115,22,0.12)"
                />
                {/* Recovery bumps (poll checkpoints) */}
                <path
                  d="M180,88 C185,88 190,30 200,20 C210,10 220,10 240,12 C260,14 280,40 290,58 C295,68 298,72 300,88 L300,96 L180,96 Z"
                  fill="rgba(79,70,229,0.12)"
                />
                <path
                  d="M300,88 C305,88 310,30 320,20 C330,10 340,10 360,12 C380,14 400,40 410,58 C415,68 418,72 420,88 L420,96 L300,96 Z"
                  fill="rgba(79,70,229,0.12)"
                />
                <path
                  d="M420,88 C425,88 430,30 440,20 C450,10 460,10 480,12 C500,14 520,40 530,58 C535,68 538,72 540,88 L540,96 L420,96 Z"
                  fill="rgba(20,184,166,0.12)"
                />
                {/* Main line */}
                <polyline
                  points="0,10 150,12 180,88 200,20 300,88 320,20 420,88 440,20 600,18"
                  fill="none"
                  stroke="url(#attnGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Poll checkpoint dots */}
                {[180, 300, 420].map((x, i) => (
                  <g key={i}>
                    <circle cx={x} cy={88} r={5} fill="#F97316" opacity="0.9" />
                    <line x1={x} y1={0} x2={x} y2={96} stroke="rgba(79,70,229,0.3)" strokeWidth="1" strokeDasharray="4,4" />
                  </g>
                ))}
                {[200, 320, 440].map((x, i) => (
                  <circle key={i} cx={x} cy={20} r={4} fill="#22C55E" opacity="0.9" />
                ))}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-accent-500" />
                Attention drops (without intervention)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-success-500" />
                Poll checkpoint — attention recovers
              </div>
            </div>
          </div>
        </div>

        {/* Subtext */}
        <div
          className="text-center max-w-xl mx-auto"
          data-aos="fade-up"
          data-aos-delay="400"
        >
          <div className="inline-flex items-start gap-3 text-left card-glass-dark rounded-2xl p-5">
            <Zap className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-300 text-sm leading-relaxed">
              SARADHI-AI puts a checkpoint wherever you need one. Polls,
              quizzes, pulse checks — in seconds, not semesters. You teach as
              normal. The classroom responds in real time.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RealTimeSection;
