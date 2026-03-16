import React from 'react';
import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';

const stats = [
  { label: 'Avg Engagement', value: '87%', icon: TrendingUp, color: 'text-teal-400', bg: 'bg-teal-400/10 border-teal-400/20' },
  { label: 'Sessions Tracked', value: '12', icon: BarChart2, color: 'text-primary-400', bg: 'bg-primary-400/10 border-primary-400/20' },
  { label: 'Ch.5 Confusion (retake)', value: '↓ 23%', icon: TrendingDown, color: 'text-success-500', bg: 'bg-success-500/10 border-success-500/20' },
];

const AnalyticsSection = () => {
  return (
    <section id="analytics" className="bg-section-alt py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Analytics visual */}
          <div data-aos="fade-right">
            <div className="card-glass-dark rounded-2xl p-6 border border-white/10">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-5">
                Session Analytics — Data Structures · Sem 5
              </p>

              {/* SVG area chart */}
              <div className="relative h-32 mb-5">
                <svg viewBox="0 0 400 128" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Fill */}
                  <path
                    d="M0,100 C40,90 60,80 100,60 C130,45 150,70 200,50 C250,30 280,20 320,25 C360,30 380,20 400,15 L400,128 L0,128 Z"
                    fill="url(#chartFill)"
                  />
                  {/* Line */}
                  <path
                    d="M0,100 C40,90 60,80 100,60 C130,45 150,70 200,50 C250,30 280,20 320,25 C360,30 380,20 400,15"
                    fill="none"
                    stroke="#818CF8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Data points */}
                  {[
                    [0, 100], [100, 60], [200, 50], [300, 25], [400, 15]
                  ].map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={4} fill="#818CF8" />
                  ))}
                </svg>
              </div>

              {/* Session labels */}
              <div className="flex justify-between text-xs text-slate-500 mb-6">
                {['Session 1', 'Session 3', 'Session 6', 'Session 9', 'Session 12'].map(s => (
                  <span key={s}>{s}</span>
                ))}
              </div>

              {/* Stat pills */}
              <div className="grid grid-cols-3 gap-3">
                {stats.map((s, i) => (
                  <div
                    key={i}
                    className={`border rounded-xl p-3 text-center ${s.bg}`}
                  >
                    <p className={`text-lg font-bold font-display ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Story */}
          <div>
            <p
              className="text-xs font-semibold tracking-[0.2em] text-primary-400 uppercase mb-4"
              data-aos="fade-left"
            >
              Teach With Your Eyes Open
            </p>

            <h2
              className="text-3xl sm:text-4xl font-display font-bold text-white leading-tight mb-6"
              data-aos="fade-left"
              data-aos-delay="100"
            >
              You sensed that{' '}
              <span className="text-primary-400">Chapter 5</span> didn't land.
              <br />
              <span className="text-white/70 text-2xl sm:text-3xl block mt-2">
                Now you can see it — session by session, question by question.
              </span>
            </h2>

            <div
              className="space-y-4 text-slate-400 leading-relaxed"
              data-aos="fade-left"
              data-aos-delay="200"
            >
              <p>
                Great teachers have instinct. They feel when a class is lost.
                But instinct doesn't scale to 4 sections of 150 students, and
                it doesn't help when the HOD asks for engagement data.
              </p>
              <p>
                SARADHI-AI gives you the receipts: which topics had the lowest
                accuracy, which sessions had the highest drop-off, which
                students went from active to silent.
              </p>
              <p className="text-white font-medium">
                Not to judge you — to arm you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AnalyticsSection;
