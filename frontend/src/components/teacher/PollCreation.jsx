import React, { useState } from 'react';
import { toast } from 'sonner';
import { pollAPI } from '../../utils/api';

const PollCreation = ({ sessionId, onPollCreated }) => {
  const [formData, setFormData] = useState({
    question: '',
    options: ['', '', '', ''],
    correct_answer: 0,
    justification: '',
    time_limit: 60,
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'correct_answer' || name === 'time_limit') {
      setFormData({ ...formData, [name]: parseInt(value) });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate that all options are filled
    if (formData.options.some(option => !option.trim())) {
      toast.warning('Please fill in all options');
      return;
    }

    setLoading(true);
    try {
      await pollAPI.createPoll({
        session_id: sessionId,
        ...formData,
      });

      toast.success('Poll created successfully!');
      setFormData({
        question: '',
        options: ['', '', '', ''],
        correct_answer: 0,
        justification: '',
        time_limit: 60,
      });
      onPollCreated();
    } catch (error) {
      console.error('Error creating poll:', error);
      toast.error('Error creating poll. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4 dark:text-white">Create New Poll</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label dark:text-slate-300">Question *</label>
          <textarea
            name="question"
            value={formData.question}
            onChange={handleChange}
            className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            rows="3"
            placeholder="Enter your question here..."
            required
          />
        </div>

        <div>
          <label className="label dark:text-slate-300">Options *</label>
          <div className="space-y-2">
            {formData.options.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-8">
                  {String.fromCharCode(65 + index)}.
                </span>
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  className="input-field flex-1 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder={`Option ${String.fromCharCode(65 + index)}`}
                  required
                />
                <input
                  type="radio"
                  name="correct_answer"
                  value={index}
                  checked={formData.correct_answer === index}
                  onChange={handleChange}
                  className="text-primary-600"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">Correct</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="label dark:text-slate-300">Justification/Explanation</label>
          <textarea
            name="justification"
            value={formData.justification}
            onChange={handleChange}
            className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            rows="2"
            placeholder="Explain why the correct answer is right..."
          />
        </div>

        <div>
          <label className="label dark:text-slate-300">Time Limit (seconds)</label>
          <select
            name="time_limit"
            value={formData.time_limit}
            onChange={handleChange}
            className="input-field dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={90}>1.5 minutes</option>
            <option value={120}>2 minutes</option>
            <option value={180}>3 minutes</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Creating Poll...' : 'Create Poll'}
        </button>
      </form>
    </div>
  );
};

export default PollCreation;
