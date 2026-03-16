import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, MessageSquare, Trophy, BookOpen, ArrowLeft, Play } from 'lucide-react';
import { enterDemoMode } from '../../utils/demoData';

const previews = [
  {
    icon: Hash,
    color: 'text-accent-400',
    bg: 'bg-accent-400/10 border-accent-400/20',
    title: 'Join Live Sessions',
    body: 'Enter a 6-digit code from your teacher. You\'re in — instantly. Answer live polls, see real-time results, and earn points for every response.',
  },
  {
    icon: MessageSquare,
    color: 'text-teal-400',
    bg: 'bg-teal-400/10 border-teal-400/20',
    title: 'AI Study Assistant',
    body: 'Ask questions about your course materials any time. Get answers sourced directly from your professor\'s uploaded slides — not random Google results.',
  },
  {
    icon: Trophy,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/20',
    title: 'Leaderboard & Badges',
    body: 'Earn XP for every poll answered and quiz completed. Climb the class leaderboard and unlock achievement badges as you engage more.',
  },
  {
    icon: BookOpen,
    color: 'text-primary-400',
    bg: 'bg-primary-400/10 border-primary-400/20',
    title: 'Session Resources',
    body: 'Access all materials your teacher has uploaded. Search through them using AI — find exactly what you need for assignments and exam prep.',
  },
];

const StudentDemo = () => {
  const navigate = useNavigate();

  const handleLaunch = () => {
    enterDemoMode();
    navigate('/student/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-accent-500/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
        {/* Back link */}
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-12 transition-colors duration-150 min-h-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </button>

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent-400/30 bg-accent-400/10 text-accent-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400" />
            Student Experience
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white leading-tight mb-4">
            Welcome to the{' '}
            <span className="bg-gradient-to-r from-accent-400 to-yellow-300 bg-clip-text text-transparent">
              Student Dashboard
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
            See how SARADHI-AI helps you stay engaged, ask better questions, and
            actually understand — not just memorise.
          </p>
        </div>

        {/* Preview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
          {previews.map((p, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 bg-white/5 border border-white/10 hover:bg-white/8 hover:border-white/15 transition-all duration-200"
            >
              <div className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${p.bg}`}>
                <p.icon className={`w-5 h-5 ${p.color}`} />
              </div>
              <h3 className="text-white font-semibold mb-2">{p.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={handleLaunch}
            className="inline-flex items-center gap-3 px-10 py-4 bg-accent-600 hover:bg-accent-500 text-white font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] shadow-glow-accent text-base min-h-0"
          >
            <Play className="w-5 h-5" />
            Launch Student Demo
          </button>
          <p className="text-slate-600 text-xs mt-5 max-w-sm mx-auto">
            Simulated environment with sample data. Sign in with your{' '}
            <span className="text-slate-400">@sastra.ac.in</span> account for
            the real thing.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentDemo;
