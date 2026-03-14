import { useState, useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const WS_BASE_URL = process.env.REACT_APP_API_URL ?
  process.env.REACT_APP_API_URL.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '') :
  'ws://localhost:3001';

/**
 * Custom hook for audio recording functionality
 * Persists recording state across component mount/unmount
 */
const useAudioRecorder = (initialSessionId = '') => {
  // State
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [pdfFile, setPdfFile] = useState(null);
  const [segmentInterval, setSegmentInterval] = useState(10);
  const [status, setStatus] = useState('idle'); // idle, recording, paused
  const [transcripts, setTranscripts] = useState([]);
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const streamRef = useRef(null);
  const audioBufferRef = useRef([]);
  const wsRef = useRef(null);
  const statusRef = useRef('idle'); // mirror of status for use inside audio callbacks

  // Update sessionId when prop changes
  useEffect(() => {
    if (initialSessionId && initialSessionId !== sessionId) {
      setSessionId(initialSessionId);
    }
  }, [initialSessionId]);

  // WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useAudioRecorder] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'transcript-received' && data.session_id && sessionId && data.session_id.toUpperCase() === sessionId.toUpperCase()) {
          console.log('[useAudioRecorder] Transcript received:', data.transcript);

          const newTranscript = {
            text: data.transcript,
            timestamp: new Date(data.timestamp),
            language: data.detected_language
          };

          // Prevent duplicates: check if transcript with same text and similar timestamp exists
          setTranscripts(prev => {
            const isDuplicate = prev.some(t =>
              t.text === newTranscript.text &&
              Math.abs(t.timestamp - newTranscript.timestamp) < 1000 // Within 1 second
            );

            if (isDuplicate) {
              console.log('[useAudioRecorder] Duplicate transcript ignored');
              return prev;
            }

            return [...prev, newTranscript];
          });
        }
      } catch (error) {
        console.error('[useAudioRecorder] Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[useAudioRecorder] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[useAudioRecorder] WebSocket disconnected');
    };

    return () => {
      // Close regardless of state to prevent zombie connections
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [sessionId]);

  // Handle PDF file selection
  const handlePdfChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
    } else if (file) {
      alert('Please select a valid PDF file');
      e.target.value = '';
    }
  };

  // Clear PDF
  const clearPdf = () => {
    setPdfFile(null);
    const fileInput = document.getElementById('pdf-input');
    if (fileInput) fileInput.value = '';
  };

  // Start recording session
  const startRecording = async () => {
    if (!sessionId.trim()) {
      alert('Please enter a Session ID');
      return;
    }

    try {
      setIsProcessing(true);

      // Prepare form data for session start
      const formData = new FormData();
      formData.append('session_id', sessionId);
      formData.append('segment_interval', segmentInterval);
      if (pdfFile) {
        formData.append('pdf', pdfFile);
      }

      // Start session on backend
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

      const result = await response.json();
      console.log('[useAudioRecorder] Session started:', result);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      // Create AudioContext at 16kHz (Whisper's native rate)
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create ScriptProcessor for raw audio extraction
      const bufferSize = 4096;
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      const SAMPLES_PER_CHUNK = 15 * 16000; // 15 seconds of audio at 16kHz
      let audioBuffer = [];
      audioBufferRef.current = audioBuffer;

      processor.onaudioprocess = (e) => {
        if (statusRef.current === 'paused') return;

        // Get raw Float32 PCM data from input buffer
        const inputData = e.inputBuffer.getChannelData(0);

        // Add to buffer
        for (let i = 0; i < inputData.length; i++) {
          audioBuffer.push(inputData[i]);
        }

        // When buffer reaches 15 seconds, send to backend
        if (audioBuffer.length >= SAMPLES_PER_CHUNK) {
          const chunkToSend = audioBuffer.slice(0, SAMPLES_PER_CHUNK);
          sendRawAudioChunk(chunkToSend);

          // Keep remaining samples for next chunk
          audioBuffer = audioBuffer.slice(SAMPLES_PER_CHUNK);
          audioBufferRef.current = audioBuffer;
        }
      };

      // Connect audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      statusRef.current = 'recording';
      setStatus('recording');
      setTranscripts([]);
      console.log('[useAudioRecorder] Recording started with raw audio capture (16kHz PCM)');

    } catch (error) {
      console.error('[useAudioRecorder] Error starting recording:', error);
      alert(`Failed to start recording: ${error.message}`);
      stopRecording();
    } finally {
      setIsProcessing(false);
    }
  };

  // Send raw audio data to backend (low-latency streaming)
  const sendRawAudioChunk = async (audioData) => {
    try {
      console.log(`[useAudioRecorder] Sending raw audio stream: ${audioData.length} samples (${(audioData.length / 16000).toFixed(2)}s)`);

      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/transcription/audio-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audio_data: Array.from(audioData), // Convert Float32Array to regular array
          sample_rate: 16000,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[useAudioRecorder] Error sending audio stream:', error);
      } else {
        const result = await response.json();
        console.log('[useAudioRecorder] Stream processed:', result.transcript?.substring(0, 50));
      }

    } catch (error) {
      console.error('[useAudioRecorder] Error sending audio stream:', error);
    }
  };

  // Pause recording
  const pauseRecording = async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      await audioContextRef.current.suspend();
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

  // Resume recording
  const resumeRecording = async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
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

  // Stop recording
  const stopRecording = async () => {
    // Disconnect audio nodes
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear audio buffer
    audioBufferRef.current = [];

    // Stop session on backend
    if (sessionId && status !== 'idle') {
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

  // Generate complete notes
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
      console.log('[useAudioRecorder] Complete notes generated');

    } catch (error) {
      console.error('[useAudioRecorder] Error generating notes:', error);
      alert(`Failed to generate notes: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Send manual notes
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
        body: JSON.stringify({
          session_id: sessionId,
          notes: notes
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notes');
      }

      alert('Notes sent successfully!');
      setNotes('');
      console.log('[useAudioRecorder] Manual notes sent');

    } catch (error) {
      console.error('[useAudioRecorder] Error sending notes:', error);
      alert(`Failed to send notes: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    // State
    sessionId,
    setSessionId,
    pdfFile,
    segmentInterval,
    setSegmentInterval,
    status,
    transcripts,
    notes,
    setNotes,
    isProcessing,

    // Functions
    handlePdfChange,
    clearPdf,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    generateNotes,
    sendManualNotes
  };
};

export default useAudioRecorder;
