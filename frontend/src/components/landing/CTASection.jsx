import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, Play, ArrowRight, Loader2 } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const CTASection = () => {
  const [loading, setLoading] = useState(null);
  const navigate = useNavigate();
  const AUTH_URL = process.env.REACT_APP_AUTH_URL;

  const handleTeacherSignIn = () => {
    setLoading('teacher');
    window.location.href = `${AUTH_URL}/auth/google/edu`;
  };

  const handleStudentSignIn = () => {
    setLoading('student');
    window.location.href = `${AUTH_URL}/auth/google/acin`;
  };

  return (
    <section id="get-started" className="bg-section-dark py-24 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Glow blob */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-96 h-96 bg-primary-600/20 rounded-full blur-[100px]" />
          </div>

          <div className="relative z-10">
            <p
              className="text-xs font-semibold tracking-[0.2em] text-teal-400 uppercase mb-4 text-center"
              data-aos="fade-up"
            >
              See It For Yourself
            </p>

            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white text-center leading-tight mb-4 max-w-3xl mx-auto"
              data-aos="fade-up"
              data-aos-delay="100"
            >
              The best way to understand SARADHI-AI
              <br />
              <span className="text-slate-400 text-2xl sm:text-3xl">
                is to experience it.
              </span>
            </h2>

            <p
              className="text-base text-slate-400 text-center max-w-xl mx-auto mb-14"
              data-aos="fade-up"
              data-aos-delay="150"
            >
              Sign in with your SASTRA account to start using it in your next
              class. Or explore the demo first — no login required.
            </p>

            {/* Three columns */}
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              data-aos="fade-up"
              data-aos-delay="250"
            >
              {/* Teacher sign-in */}
              <div className="card-glass-dark rounded-2xl p-6 border border-primary-400/30 flex flex-col">
                <div className="w-12 h-12 rounded-2xl bg-primary-400/10 border border-primary-400/30 flex items-center justify-center mb-5">
                  <BookOpen className="w-6 h-6 text-primary-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">I'm a Teacher</h3>
                <p className="text-slate-500 text-xs mb-5">@sastra.edu account</p>
                <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1">
                  Launch sessions, create live polls, auto-generate quizzes, and
                  track engagement across every student.
                </p>
                <button
                  onClick={handleTeacherSignIn}
                  disabled={loading === 'teacher'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-70 text-white font-medium rounded-xl transition-all duration-150 active:scale-[0.97] min-h-0 text-sm"
                >
                  {loading === 'teacher' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Sign in with Google
                </button>
              </div>

              {/* Student sign-in */}
              <div className="card-glass-dark rounded-2xl p-6 border border-accent-400/30 flex flex-col">
                <div className="w-12 h-12 rounded-2xl bg-accent-400/10 border border-accent-400/30 flex items-center justify-center mb-5">
                  <GraduationCap className="w-6 h-6 text-accent-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">I'm a Student</h3>
                <p className="text-slate-500 text-xs mb-5">@sastra.ac.in account</p>
                <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1">
                  Join live sessions, answer polls, ask the AI assistant
                  questions about your course materials anytime.
                </p>
                <button
                  onClick={handleStudentSignIn}
                  disabled={loading === 'student'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-600 hover:bg-accent-500 disabled:opacity-70 text-white font-medium rounded-xl transition-all duration-150 active:scale-[0.97] min-h-0 text-sm"
                >
                  {loading === 'student' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  Sign in with Google
                </button>
              </div>

              {/* Demo explore */}
              <div className="card-glass-dark rounded-2xl p-6 border border-dashed border-teal-400/30 flex flex-col">
                <div className="w-12 h-12 rounded-2xl bg-teal-400/10 border border-teal-400/30 flex items-center justify-center mb-5">
                  <Play className="w-6 h-6 text-teal-400" />
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">Just Exploring?</h3>
                <p className="text-slate-500 text-xs mb-5">No login required</p>
                <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1">
                  Take a full interactive walkthrough of either role. See exactly
                  what you'll get before signing in.
                </p>
                <div className="flex flex-col gap-2 mt-auto">
                  <button
                    onClick={() => navigate('/demo/teacher')}
                    className="w-full flex items-center justify-between px-4 py-2.5 border border-teal-400/30 text-teal-300 hover:bg-teal-400/10 font-medium rounded-xl transition-all duration-150 min-h-0 text-sm"
                  >
                    Teacher Demo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/demo/student')}
                    className="w-full flex items-center justify-between px-4 py-2.5 border border-teal-400/20 text-teal-400/70 hover:bg-teal-400/5 font-medium rounded-xl transition-all duration-150 min-h-0 text-sm"
                  >
                    Student Demo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Security note */}
            <p
              className="text-center text-slate-600 text-xs mt-10"
              data-aos="fade-up"
              data-aos-delay="400"
            >
              Protected by Google OAuth2 — we never store your password.
              Official SASTRA credentials required.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
