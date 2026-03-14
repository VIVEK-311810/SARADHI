import { useState, useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const WS_BASE_URL = process.env.REACT_APP_API_URL ?
  process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '') :
  'ws://localhost:3001';

/**
 * Custom hook for audio recording functionality.
 * Uses MediaRecorder (WebM/Opus) instead of ScriptProcessorNode + raw PCM JSON.
 * WebM chunks are ~100-200KB vs ~4MB JSON — eliminates Render crash on 4th chunk.
 */
const useAudioRecorder = (initialSessionId = '') => {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [pdfFile, setPdfFile] = useState(null);
  const [segmentInterval, setSegmentInterval] = useState(10);
  const [status, setStatus] = useState('idle'); // idle, recording, paused
  const [transcripts, setTranscripts] = useState([]);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const statusRef = useRef('idle');

  // Update sessionId when prop changes
  useEffect(() => {
    if (initialSessionId && initialSessionId !== sessionId) {
      setSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  // WebSocket connection (kept for future broadcast events)
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen  = () => console.log('[useAudioRecorder] WebSocket connected');
    ws.onerror = (e) => console.error('[useAudioRecorder] WebSocket error:', e);
    ws.onclose = () => console.log('[useAudioRecorder] WebSocket disconnected');

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [sessionId]);

  const handlePdfChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else if (file) {
      alert('Please select a valid PDF file');
      e.target.value = '';
    }
  };

  const clearPdf = () => {
    setPdfFile(null);
    const fileInput = document.getElementById('pdf-input');
    if (fileInput) fileInput.value = '';
  };

  // Send a WebM blob to /audio-chunk (binary, uses multer + Groq fallback)
  const sendAudioChunk = async (blob) => {
    if (!blob || blob.size === 0) return;
    try {
      console.log(`[useAudioRecorder] Sending audio chunk: ${(blob.size / 1024).toFixed(1)} KB`);

      const formData = new FormData();
      formData.append('audio', blob, 'audio.webm');
      formData.append('session_id', sessionId);

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/transcription/audio-chunk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[useAudioRecorder] Chunk upload error:', err);
        return;
      }

      const result = await response.json();
      console.log('[useAudioRecorder] Chunk processed:', result.transcript?.substring(0, 60));

      if (result.transcript && result.transcript.trim()) {
        setTranscripts(prev => [...prev, {
          text: result.transcript.trim(),
          timestamp: new Date(),
          language: result.detected_language || null
        }]);
      }
    } catch (error) {
      console.error('[useAudioRecorder] Error sending chunk:', error);
    }
  };

  const startRecording = async () => {
    if (!sessionId.trim()) {
      alert('Please enter a Session ID');
      return;
    }

    try {
      setIsProcessing(true);

      // Register session on backend
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('segment_interval', segmentInterval);
      if (pdfFile) formData.append('pdf', pdfFile);

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/transcription/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start session');
      }
      console.log('[useAudioRecorder] Session started:', await response.json().catch(() => ({})));

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      // Pick best supported MIME type (Whisper/Groq accept webm and ogg)
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0 && statusRef.current !== 'paused') {
          sendAudioChunk(event.data);
        }
      };

      mediaRecorder.onerror = (e) => console.error('[useAudioRecorder] MediaRecorder error:', e);

      // Fire ondataavailable every 15 seconds
      mediaRecorder.start(15000);

      statusRef.current = 'recording';
      setStatus('recording');
      setTranscripts([]);
      console.log(`[useAudioRecorder] Recording started (${mimeType || 'browser default'})`);

    } catch (error) {
      console.error('[useAudioRecorder] Error starting recording:', error);
      alert(`Failed to start recording: ${error.message}`);
      await stopRecording();
    } finally {
      setIsProcessing(false);
    }
  };

  const pauseRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      statusRef.current = 'paused';
      setStatus('paused');

      try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_URL}/transcription/pause`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (error) {
        console.error('[useAudioRecorder] Error pausing session:', error);
      }
    }
  };

  const resumeRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      statusRef.current = 'recording';
      setStatus('recording');

      try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_URL}/transcription/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (error) {
        console.error('[useAudioRecorder] Error resuming session:', error);
      }
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (sessionId && statusRef.current !== 'idle') {
      try {
        const token = localStorage.getItem('authToken');
        await fetch(`${API_URL}/transcription/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId })
        });
      } catch (error) {
        console.error('[useAudioRecorder] Error stopping session:', error);
      }
    }

    statusRef.current = 'idle';
    setStatus('idle');
  };

  const generateNotes = async () => {
    if (!sessionId) return;
    try {
      setIsProcessing(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/transcription/generate-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate notes');
      }
      alert('Complete notes have been sent to the workflow!');
    } catch (error) {
      console.error('[useAudioRecorder] Error generating notes:', error);
      alert(`Failed to generate notes: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendManualNotes = async () => {
    if (!sessionId || !notes.trim()) {
      alert('Please enter notes to send');
      return;
    }
    try {
      setIsProcessing(true);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/transcription/send-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId, notes })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notes');
      }
      alert('Notes sent successfully!');
      setNotes('');
    } catch (error) {
      console.error('[useAudioRecorder] Error sending notes:', error);
      alert(`Failed to send notes: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const fullTranscript = transcripts.map(t => t.text).join(' ');

  return {
    sessionId, setSessionId,
    pdfFile,
    segmentInterval, setSegmentInterval,
    status,
    transcripts, fullTranscript,
    notes, setNotes,
    isProcessing,
    handlePdfChange, clearPdf,
    startRecording, pauseRecording, resumeRecording, stopRecording,
    generateNotes, sendManualNotes
  };
};

export default useAudioRecorder;
