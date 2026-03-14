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
    <div className="max-w-2xl mx-auto px-4 sm:px-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white">Create New Session</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-2">Set up a new class session for your students</p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Session Title *</label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course Name *</label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
              <Textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Brief description of what will be covered..."
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 sm:p-4">
              <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2 text-sm sm:text-base">Session Features</h3>
              <ul className="text-xs sm:text-sm text-blue-700 dark:text-blue-400 space-y-1">
                <li>• Students join using unique Session Code</li>
                <li>• Create real-time polls/MCQs</li>
                <li>• Track student participation</li>
                <li>• Share resources with students</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/teacher/dashboard')}
                className="w-full"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating...' : 'Create Session'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateSession;
