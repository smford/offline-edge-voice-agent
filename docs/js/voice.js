/**
 * voice.js
 * Full-duplex voice input and streaming audio synthesis pipeline.
 * Features:
 * - Web Speech API SpeechRecognition with interim transcripts & continuous mode
 * - Web Audio API AnalyserNode for real-time microphone FFT frequency analysis
 * - Low-latency sentence-chunking streaming SpeechSynthesis
 * - Barge-in interruption and voice tuning controls (pitch, rate, volume)
 */

class VoicePipeline {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.continuousMode = false;
    this.isPushToTalkActive = false;

    // AudioContext & Analyser for Mic FFT
    this.audioContext = null;
    this.analyser = null;
    this.micStream = null;
    this.micDataArray = null;
    this.isMicActive = false;

    // Speech Synthesis
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.selectedVoice = null;
    this.speechRate = 1.05;
    this.speechPitch = 1.0;
    this.speechVolume = 1.0;
    this.isMuted = false;
    this.isSpeaking = false;
    this.sentenceQueue = [];
    this.currentUtterance = null;
    this.streamBuffer = '';

    this.listeners = new Set();

    this.initRecognition();
    this.initVoices();
  }

  /* =========================================================================
   * 1. SPEECH RECOGNITION (VOICE INPUT)
   * ========================================================================= */

  initRecognition() {
    if (typeof window === 'undefined') return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('SpeechRecognition API not supported in this browser.');
      this.hasSpeechRec = false;
      return;
    }

    this.hasSpeechRec = true;
    this.recognition = new SpeechRec();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.notify({ event: 'recognition_start' });
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimTranscript += transcriptPart;
        }
      }

      this.notify({
        event: 'recognition_result',
        interim: interimTranscript,
        final: finalTranscript
      });
    };

    this.recognition.onerror = (event) => {
      console.warn('SpeechRecognition error:', event.error);
      this.notify({ event: 'recognition_error', error: event.error });
      if (event.error === 'not-allowed') {
        this.stopListening();
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      // In continuous mode, restart recognition if still desired
      if (this.continuousMode && !this.manualStop) {
        try {
          this.recognition.start();
          this.isListening = true;
        } catch (e) {
          // ignore already started
        }
      }
      this.notify({ event: 'recognition_end' });
    };
  }

  async startListening() {
    this.manualStop = false;
    // Barge-in: immediately cancel AI speaking if user starts talking
    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    await this.initMicAnalyser();

    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Recognition start caught:', e);
      }
    }
  }

  stopListening() {
    this.manualStop = true;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false;
  }

  toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  setContinuousMode(enabled) {
    this.continuousMode = Boolean(enabled);
    if (!this.continuousMode && this.isListening) {
      this.stopListening();
    }
    this.notify({ event: 'continuous_mode_changed', continuous: this.continuousMode });
  }

  /* =========================================================================
   * 2. AUDIO ANALYSER (MIC FFT FOR 3D ORB)
   * ========================================================================= */

  async initMicAnalyser() {
    if (this.micStream && this.analyser) {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.micStream = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      this.micDataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isMicActive = true;
      this.notify({ event: 'mic_ready' });
    } catch (err) {
      console.warn('Microphone access denied or error:', err);
      this.isMicActive = false;
    }
  }

  /**
   * Reads real-time frequency and volume data for the 3D Orb and VU meter.
   * Returns: { volume: 0..1, bass: 0..1, mid: 0..1, treble: 0..1, waveform: Uint8Array }
   */
  getMicAudioData() {
    if (!this.analyser || !this.isMicActive || !this.micDataArray) {
      return { volume: 0, bass: 0, mid: 0, treble: 0, waveform: null };
    }

    this.analyser.getByteFrequencyData(this.micDataArray);

    const length = this.micDataArray.length;
    let sum = 0;
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    const bassEnd = Math.floor(length * 0.15);
    const midEnd = Math.floor(length * 0.55);

    for (let i = 0; i < length; i++) {
      const val = this.micDataArray[i];
      sum += val;
      if (i < bassEnd) bassSum += val;
      else if (i < midEnd) midSum += val;
      else trebleSum += val;
    }

    const volume = Math.min(1.0, (sum / length) / 128);
    const bass = Math.min(1.0, (bassSum / (bassEnd || 1)) / 140);
    const mid = Math.min(1.0, (midSum / ((midEnd - bassEnd) || 1)) / 130);
    const treble = Math.min(1.0, (trebleSum / ((length - midEnd) || 1)) / 120);

    return { volume, bass, mid, treble, raw: this.micDataArray };
  }

  /* =========================================================================
   * 3. STREAMING SPEECH SYNTHESIS (VOICE OUTPUT)
   * ========================================================================= */

  initVoices() {
    if (!this.synth) return;

    const loadVoices = () => {
      const voices = this.synth.getVoices();
      if (voices && voices.length > 0) {
        this.availableVoices = voices;
        // Prioritize natural or English voices
        const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Enhanced') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Alex'))) 
          || voices.find(v => v.lang.startsWith('en')) 
          || voices[0];
        
        if (!this.selectedVoice) {
          this.selectedVoice = englishVoice;
        }
        this.notify({ event: 'voices_loaded', voices, selected: this.selectedVoice });
      }
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  setVoice(voiceUri) {
    if (this.availableVoices) {
      const found = this.availableVoices.find(v => v.voiceURI === voiceUri || v.name === voiceUri);
      if (found) {
        this.selectedVoice = found;
        this.notify({ event: 'voice_changed', voice: found });
      }
    }
  }

  setTuning({ rate, pitch, volume, muted }) {
    if (rate !== undefined) this.speechRate = Math.max(0.5, Math.min(2.0, rate));
    if (pitch !== undefined) this.speechPitch = Math.max(0.5, Math.min(1.5, pitch));
    if (volume !== undefined) this.speechVolume = Math.max(0.0, Math.min(1.0, volume));
    if (muted !== undefined) this.isMuted = Boolean(muted);
    this.notify({
      event: 'tuning_changed',
      rate: this.speechRate,
      pitch: this.speechPitch,
      volume: this.speechVolume,
      muted: this.isMuted
    });
  }

  /**
   * Resets the stream buffer before a new generation begins.
   */
  startStreamingGeneration() {
    this.stopSpeaking();
    this.streamBuffer = '';
    this.sentenceQueue = [];
  }

  /**
   * Pushes a new token into the streaming synthesis queue.
   * Chunks tokens into complete sentences and dispatches them to speech synthesis immediately!
   */
  feedStreamToken(token, isFinished = false) {
    if (this.isMuted) return;

    this.streamBuffer += token;

    // Sentence splitting regex: splits at .!?;\n followed by whitespace or end
    const sentenceDelimiters = /(?<=[.!?;\n])\s+/;
    const parts = this.streamBuffer.split(sentenceDelimiters);

    // If we have at least one complete sentence
    if (parts.length > 1) {
      for (let i = 0; i < parts.length - 1; i++) {
        const sentence = parts[i].trim();
        if (sentence.length > 0) {
          this.enqueueSentence(sentence);
        }
      }
      this.streamBuffer = parts[parts.length - 1]; // remainder
    }

    if (isFinished && this.streamBuffer.trim().length > 0) {
      this.enqueueSentence(this.streamBuffer.trim());
      this.streamBuffer = '';
    }
  }

  enqueueSentence(sentence) {
    // Strip markdown formatting symbols for natural speech
    const cleanSentence = sentence
      .replace(/[*_~`#\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSentence) return;

    this.sentenceQueue.push(cleanSentence);
    if (!this.isSpeaking) {
      this.playNextSentence();
    }
  }

  playNextSentence() {
    if (this.sentenceQueue.length === 0 || this.isMuted || !this.synth) {
      this.isSpeaking = false;
      this.notify({ event: 'speaking_end' });
      return;
    }

    const text = this.sentenceQueue.shift();
    const utterance = new SpeechSynthesisUtterance(text);

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = this.speechRate;
    utterance.pitch = this.speechPitch;
    utterance.volume = this.speechVolume;

    this.currentUtterance = utterance;
    this.isSpeaking = true;

    utterance.onstart = () => {
      this.notify({ event: 'speaking_start', text });
    };

    utterance.onend = () => {
      this.playNextSentence();
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      this.playNextSentence();
    };

    try {
      this.synth.speak(utterance);
    } catch (err) {
      console.error('SpeechSynthesis speak failed:', err);
      this.playNextSentence();
    }
  }

  speakFullText(text) {
    this.stopSpeaking();
    if (this.isMuted || !text) return;

    // Split text into readable sentences
    const sentences = text.match(/[^.!?;\n]+[.!?;\n]+/g) || [text];
    for (const s of sentences) {
      this.enqueueSentence(s.trim());
    }
  }

  stopSpeaking() {
    this.sentenceQueue = [];
    this.streamBuffer = '';
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {
        // ignore
      }
    }
    this.isSpeaking = false;
    this.notify({ event: 'speaking_stopped' });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (e) {
        console.error('VoicePipeline listener error:', e);
      }
    }
  }
}

export const voicePipeline = new VoicePipeline();
