import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, safeParseUser } from '../../utils/api';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

const CreateSession = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ title: '', description: '', course_name: '' });
  const [loading, setLoading] = useState(false);
  const currentUser = safeParseUser();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiRequest('/sessions', {
        method: 'POST',
        body: JSON.stringify({ ...formData, teacher_id: currentUser?.id || 1 }),
      });
      const sessionId = data.session_id;
      if (sessionId) {
        toast.success(`Session "${formData.title}" created!`);
        navigate(`/teacher/session/${sessionId}`);
      } else {
        toast.warning('Session created but navigation failed. Check your dashboard.');
        navigate('/teacher/dashboard');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-display text-slate-900 dark:text-white">Create New Session</h1>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">Set up a new class session for your students</p>
      </div>

      <Card variant="glass">
        <CardHeader>
          <CardTitle>Session Details</CardTitle>
          <CardDescription>Students will join using the unique 6-character code generated after creation</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Session Title <span className="text-error-500">*</span>
              </label>
              <Input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Introduction to React"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Course Name <span className="text-error-500">*</span>
              </label>
              <Input
                type="text"
                name="course_name"
                value={formData.course_name}
                onChange={handleChange}
                placeholder="e.g., Web Development"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Brief description of what will be covered..."
              />
            </div>

            <div className="bg-primary-50/70 dark:bg-primary-900/20 border border-primary-200/60 dark:border-primary-800/40 rounded-xl p-3 sm:p-4">
              <h3 className="font-medium text-primary-800 dark:text-primary-300 mb-2 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Session Features
              </h3>
              <ul className="text-xs sm:text-sm text-primary-700 dark:text-primary-400 space-y-1">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />Students join using unique Session Code</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />Create real-time polls/MCQs</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />Track student participation</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />Share resources with students</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
              <Button type="button" variant="secondary" onClick={() => navigate('/teacher/dashboard')} className="w-full">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : 'Create Session'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateSession;
