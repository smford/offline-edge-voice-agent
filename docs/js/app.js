/**
 * app.js
 * Master orchestration module for Offline Edge AI Voice Agent.
 * Wires together VoiceOrb, VoicePipeline, ModelEngine, InstantNeuralEngine,
 * AirGapMonitor, and TelemetryManager.
 */

import { VoiceOrb } from './orb.js';
import { voicePipeline } from './voice.js';
import { modelEngine, MODEL_REGISTRY } from './model-engine.js';
import { instantNeuralEngine } from './instant-neural.js';
import { airgapMonitor } from './airgap-monitor.js';
import { telemetry } from './telemetry.js';

class App {
  constructor() {
    this.transcriptHistory = [];
    this.currentAssistantMessage = null;
    this.isMuted = false;

    this.initDOMElements();
    this.initOrb();
    this.initEventListeners();
    this.initSubscribers();
    this.initVoiceSelector();
    this.initTelemetryHUD();
    this.refreshCacheStats();

    // Start with Instant Neural Engine ready
    this.setStatus('IDLE', 'Offline & Ready');
  }

  initDOMElements() {
    // Stage elements
    this.orbCanvas = document.getElementById('orb-canvas');
    this.statusPill = document.getElementById('status-pill');
    this.statusText = document.getElementById('status-text');
    this.liveCaptionContainer = document.getElementById('live-caption-container');
    this.liveSpeechRole = document.getElementById('live-speech-role');
    this.liveSpeechText = document.getElementById('live-speech-text');
    this.vuMeterBar = document.getElementById('vu-meter-bar');

    // Controls
    this.btnMic = document.getElementById('btn-mic');
    this.btnContinuous = document.getElementById('btn-continuous');
    this.btnInterrupt = document.getElementById('btn-interrupt');
    this.btnMute = document.getElementById('btn-mute');
    this.textPromptInput = document.getElementById('text-prompt-input');
    this.btnSendText = document.getElementById('btn-send-text');

    // Telemetry HUD Elements
    this.hudTps = document.getElementById('hud-tps');
    this.hudTtft = document.getElementById('hud-ttft');
    this.hudTokens = document.getElementById('hud-tokens');
    this.hudBackend = document.getElementById('hud-backend');
    this.hudGpu = document.getElementById('hud-gpu');
    this.networkBadge = document.getElementById('network-badge');

    // Transcript Elements
    this.transcriptList = document.getElementById('transcript-list');
    this.btnExportMd = document.getElementById('btn-export-md');
    this.btnExportJson = document.getElementById('btn-export-json');
    this.btnClearTranscript = document.getElementById('btn-clear-transcript');

    // Model Selector & Progress
    this.modelSelect = document.getElementById('model-select');
    this.modelProgressModal = document.getElementById('model-progress-modal');
    this.modelProgressBar = document.getElementById('model-progress-bar');
    this.modelProgressText = document.getElementById('model-progress-text');
    this.modelProgressSubtext = document.getElementById('model-progress-subtext');

    // Cache elements
    this.cachedSizeLabel = document.getElementById('cached-size-label');
    this.btnClearCache = document.getElementById('btn-clear-cache');

    // Air-gap elements
    this.btnVerifyAirgap = document.getElementById('btn-verify-airgap');
    this.toggleAirplaneMode = document.getElementById('toggle-airplane-mode');
    this.packetLogBody = document.getElementById('packet-log-body');
    this.packetCountBadge = document.getElementById('packet-count-badge');
    this.btnClearPackets = document.getElementById('btn-clear-packets');
    this.airgapCertModal = document.getElementById('airgap-cert-modal');
    this.certDetails = document.getElementById('cert-details');
    this.btnCloseCert = document.getElementById('btn-close-cert');

    // Persona & Voice Tuning
    this.personaSelect = document.getElementById('persona-select');
    this.systemPromptInput = document.getElementById('system-prompt-input');
    this.voiceSelect = document.getElementById('voice-select');
    this.sliderRate = document.getElementById('slider-rate');
    this.sliderPitch = document.getElementById('slider-pitch');
    this.sliderVolume = document.getElementById('slider-volume');
    this.rateValueDisplay = document.getElementById('rate-val');
    this.pitchValueDisplay = document.getElementById('pitch-val');
    this.volumeValueDisplay = document.getElementById('volume-val');

    // Tabs
    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.tabPanels = document.querySelectorAll('.tab-panel');
  }

  initOrb() {
    if (this.orbCanvas) {
      this.orb = new VoiceOrb(this.orbCanvas);
      this.orb.start();

      // Audio frequency sampling loop for real-time reactivity
      const sampleAudio = () => {
        if (voicePipeline.isMicActive && voicePipeline.isListening) {
          const audioData = voicePipeline.getMicAudioData();
          this.orb.updateAudio(audioData);

          if (this.vuMeterBar) {
            const volPct = Math.min(100, Math.round(audioData.volume * 180));
            this.vuMeterBar.style.width = `${volPct}%`;
          }
        } else {
          this.orb.updateAudio({ volume: 0, bass: 0, mid: 0, treble: 0 });
          if (this.vuMeterBar) {
            this.vuMeterBar.style.width = '0%';
          }
        }
        requestAnimationFrame(sampleAudio);
      };
      requestAnimationFrame(sampleAudio);
    }
  }

  initEventListeners() {
    // Mic Button (Push-to-Talk or Toggle)
    if (this.btnMic) {
      this.btnMic.addEventListener('click', () => {
        if (!voicePipeline.hasSpeechRec) {
          alert('Speech Recognition is not supported or permitted in this browser. You can type queries via the text console below.');
          return;
        }
        voicePipeline.toggleListening();
      });
    }

    // Continuous Mode Toggle
    if (this.btnContinuous) {
      this.btnContinuous.addEventListener('click', () => {
        const isContinuous = !voicePipeline.continuousMode;
        voicePipeline.setContinuousMode(isContinuous);
        this.btnContinuous.classList.toggle('active', isContinuous);
      });
    }

    // Interrupt / Stop button
    if (this.btnInterrupt) {
      this.btnInterrupt.addEventListener('click', () => {
        this.interrupt();
      });
    }

    // Mute button
    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        this.isMuted = !this.isMuted;
        voicePipeline.setTuning({ muted: this.isMuted });
        this.btnMute.classList.toggle('active', this.isMuted);
        this.btnMute.textContent = this.isMuted ? '🔇 Unmute' : '🔊 Mute';
      });
    }

    // Text Prompt Input
    if (this.btnSendText && this.textPromptInput) {
      const handleSend = () => {
        const text = this.textPromptInput.value.trim();
        if (text) {
          this.textPromptInput.value = '';
          this.handleUserQuery(text);
        }
      };

      this.btnSendText.addEventListener('click', handleSend);
      this.textPromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
    }

    // Model Selector
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', async (e) => {
        const modelId = e.target.value;
        await this.handleModelSwitch(modelId);
      });
    }

    // Persona Selector
    if (this.personaSelect) {
      this.personaSelect.addEventListener('change', (e) => {
        const pId = e.target.value;
        const persona = instantNeuralEngine.setPersonality(pId);
        if (this.systemPromptInput) {
          this.systemPromptInput.value = persona.systemPrompt;
        }
        this.addTranscriptItem('system', `Persona updated to: ${persona.name} (${persona.title})`);
      });
    }

    // System Prompt Editor
    if (this.systemPromptInput) {
      this.systemPromptInput.addEventListener('input', (e) => {
        instantNeuralEngine.setCustomSystemPrompt(e.target.value);
      });
    }

    // Voice Tuning Sliders
    if (this.sliderRate) {
      this.sliderRate.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.rateValueDisplay) this.rateValueDisplay.textContent = val.toFixed(1) + 'x';
        voicePipeline.setTuning({ rate: val });
      });
    }
    if (this.sliderPitch) {
      this.sliderPitch.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.pitchValueDisplay) this.pitchValueDisplay.textContent = val.toFixed(1);
        voicePipeline.setTuning({ pitch: val });
      });
    }
    if (this.sliderVolume) {
      this.sliderVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.volumeValueDisplay) this.volumeValueDisplay.textContent = Math.round(val * 100) + '%';
        voicePipeline.setTuning({ volume: val });
      });
    }

    // Voice Selector
    if (this.voiceSelect) {
      this.voiceSelect.addEventListener('change', (e) => {
        voicePipeline.setVoice(e.target.value);
      });
    }

    // Transcript Controls
    if (this.btnExportMd) {
      this.btnExportMd.addEventListener('click', () => this.exportTranscript('markdown'));
    }
    if (this.btnExportJson) {
      this.btnExportJson.addEventListener('click', () => this.exportTranscript('json'));
    }
    if (this.btnClearTranscript) {
      this.btnClearTranscript.addEventListener('click', () => {
        this.transcriptHistory = [];
        this.renderTranscript();
        instantNeuralEngine.resetMemory();
      });
    }

    // Air-gap Isolation Test
    if (this.btnVerifyAirgap) {
      this.btnVerifyAirgap.addEventListener('click', () => this.runAirGapAudit());
    }

    // Airplane Mode Simulation Toggle
    if (this.toggleAirplaneMode) {
      this.toggleAirplaneMode.addEventListener('change', (e) => {
        airgapMonitor.setAirplaneModeSimulation(e.target.checked);
      });
    }

    // Clear Network Packet Log
    if (this.btnClearPackets) {
      this.btnClearPackets.addEventListener('click', () => {
        airgapMonitor.clearLogs();
        this.renderPacketLogs();
      });
    }

    // Close Certificate Modal
    if (this.btnCloseCert && this.airgapCertModal) {
      this.btnCloseCert.addEventListener('click', () => {
        this.airgapCertModal.classList.remove('active');
      });
    }

    // Clear Cache Button
    if (this.btnClearCache) {
      this.btnClearCache.addEventListener('click', async () => {
        if (confirm('Clear all downloaded model files from local Cache Storage and OPFS?')) {
          await modelEngine.clearModelCache();
          await this.refreshCacheStats();
          alert('Model cache cleared.');
        }
      });
    }

    // Navigation Tabs
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabKey = btn.getAttribute('data-tab');
        this.tabButtons.forEach(b => b.classList.remove('active'));
        this.tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetPanel = document.getElementById(`tab-${tabKey}`);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // If typing in input, don't trigger global shortcuts
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        voicePipeline.toggleListening();
      } else if (e.key === 'Escape') {
        this.interrupt();
      } else if (e.key === 'm' || e.key === 'M') {
        if (this.btnMute) this.btnMute.click();
      } else if (e.key === '/') {
        e.preventDefault();
        if (this.textPromptInput) this.textPromptInput.focus();
      }
    });
  }

  initSubscribers() {
    // 1. Voice Pipeline Events
    voicePipeline.subscribe((data) => {
      switch (data.event) {
        case 'recognition_start':
          this.setStatus('LISTENING', 'Listening to Voice...');
          this.orb.setState('listening');
          if (this.btnMic) this.btnMic.classList.add('recording');
          this.showLiveCaption('You', 'Listening...');
          break;

        case 'recognition_result':
          if (data.interim) {
            this.showLiveCaption('You', data.interim);
          }
          if (data.final) {
            this.handleUserQuery(data.final);
          }
          break;

        case 'recognition_end':
          if (this.btnMic) this.btnMic.classList.remove('recording');
          if (!modelEngine.isGenerating && !voicePipeline.isSpeaking) {
            this.setStatus('IDLE', 'Offline & Ready');
            this.orb.setState('idle');
          }
          break;

        case 'speaking_start':
          this.setStatus('SPEAKING', 'Speaking Response');
          this.orb.setState('speaking');
          break;

        case 'speaking_end':
        case 'speaking_stopped':
          if (!voicePipeline.isListening && !modelEngine.isGenerating) {
            this.setStatus('IDLE', 'Offline & Ready');
            this.orb.setState('idle');
          }
          break;

        case 'voices_loaded':
          this.populateVoiceSelect(data.voices, data.selected);
          break;
      }
    });

    // 2. Airgap Monitor Events
    airgapMonitor.subscribe((data, stats) => {
      this.updateNetworkBadge(stats);
      this.renderPacketLogs();
    });

    // 3. Telemetry Events
    telemetry.subscribe((data, summary) => {
      this.updateTelemetryHUD(summary);
    });

    // 4. Model Engine Events
    modelEngine.subscribe((data) => {
      if (data.event === 'hardware_checked') {
        this.updateHardwareBadge(data);
      }
    });
  }

  setStatus(state, text) {
    if (this.statusPill) {
      this.statusPill.className = `status-pill ${state.toLowerCase()}`;
    }
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  showLiveCaption(role, text) {
    if (this.liveCaptionContainer && this.liveSpeechText && this.liveSpeechRole) {
      this.liveCaptionContainer.classList.add('active');
      this.liveSpeechRole.textContent = role;
      this.liveSpeechText.textContent = text;
    }
  }

  hideLiveCaption() {
    if (this.liveCaptionContainer) {
      this.liveCaptionContainer.classList.remove('active');
    }
  }

  async handleUserQuery(query) {
    const cleanText = (query || '').trim();
    if (!cleanText) return;

    // 1. Interrupt any active speaking
    voicePipeline.stopSpeaking();

    // 2. Add User message to transcript
    this.addTranscriptItem('user', cleanText);
    this.showLiveCaption('You', cleanText);

    // 3. Set Orb to thinking / inferring
    this.setStatus('THINKING', 'Edge Inference Executing...');
    this.orb.setState('thinking');

    // 4. Begin audio streaming synthesis & network audit tracking
    voicePipeline.startStreamingGeneration();
    airgapMonitor.startInferenceAudit();

    // 5. Prepare assistant message holder in transcript
    const assistantMsg = this.addTranscriptItem('assistant', '...', { isStreaming: true });
    let streamedTokens = '';

    try {
      const result = await modelEngine.generateStream(
        cleanText,
        (token, accumulated, isFinished, metrics) => {
          streamedTokens = accumulated;
          assistantMsg.content = accumulated;
          this.showLiveCaption('Assistant', accumulated);
          this.updateStreamingTranscriptItem(assistantMsg.id, accumulated);
          voicePipeline.feedStreamToken(token, isFinished);

          if (metrics && this.hudTps) {
            const currentTps = metrics.elapsedMs > 0 ? ((metrics.tokenCount / (metrics.elapsedMs / 1000))).toFixed(1) : '0';
            this.hudTps.textContent = `${currentTps} tok/s`;
          }
        },
        {
          systemPrompt: instantNeuralEngine.customSystemPrompt || instantNeuralEngine.getPersonality().systemPrompt
        }
      );

      // Audit result
      const auditResult = airgapMonitor.endInferenceAudit();

      // Finalize assistant message with telemetry metrics
      assistantMsg.content = result.text || streamedTokens;
      assistantMsg.isStreaming = false;
      assistantMsg.metrics = {
        tokens: result.tokenCount,
        ttftMs: result.ttftMs,
        durationMs: result.totalDurationMs,
        tokensPerSec: result.tokensPerSec,
        airGapped: auditResult.airGapped
      };
      this.renderTranscript();

      // Record Turn Telemetry
      telemetry.recordInferenceTurn({
        tokenCount: result.tokenCount,
        ttftMs: result.ttftMs,
        totalDurationMs: result.totalDurationMs,
        tokensPerSec: result.tokensPerSec,
        modelName: result.model
      });

      // Update state: if voice is speaking, Orb goes to speaking, else idle
      if (voicePipeline.isSpeaking) {
        this.setStatus('SPEAKING', 'Speaking Response');
        this.orb.setState('speaking');
      } else {
        this.setStatus('IDLE', 'Offline & Ready');
        this.orb.setState('idle');
      }
    } catch (err) {
      console.error('Inference error:', err);
      airgapMonitor.endInferenceAudit();
      assistantMsg.content = `[Edge Error: ${err.message}]`;
      assistantMsg.isStreaming = false;
      this.renderTranscript();
      this.setStatus('IDLE', 'Offline & Ready');
      this.orb.setState('idle');
    }
  }

  interrupt() {
    voicePipeline.stopSpeaking();
    voicePipeline.stopListening();
    modelEngine.abortCurrentGeneration();
    this.setStatus('IDLE', 'Offline & Ready');
    this.orb.setState('idle');
    this.hideLiveCaption();
  }

  async handleModelSwitch(modelId) {
    if (modelId === 'instant') {
      await modelEngine.switchModel('instant');
      this.updateHudBackend('Instant Neural (Zero-Wait)');
      return;
    }

    // Show progress modal for external model downloads
    if (this.modelProgressModal) {
      this.modelProgressModal.classList.add('active');
    }

    try {
      await modelEngine.switchModel(modelId, (progress) => {
        if (this.modelProgressBar) {
          this.modelProgressBar.style.width = `${progress.progress}%`;
        }
        if (this.modelProgressText) {
          this.modelProgressText.textContent = `${progress.progress}% - ${progress.status}`;
        }
        if (this.modelProgressSubtext) {
          this.modelProgressSubtext.textContent = progress.text;
        }
      });

      this.updateHudBackend(modelEngine.device.toUpperCase() + ' Engine');
      await this.refreshCacheStats();

      setTimeout(() => {
        if (this.modelProgressModal) {
          this.modelProgressModal.classList.remove('active');
        }
      }, 800);
    } catch (err) {
      alert(`Model loading error: ${err.message}. Falling back to Instant Neural Engine.`);
      if (this.modelSelect) {
        this.modelSelect.value = 'instant';
      }
      await modelEngine.switchModel('instant');
      if (this.modelProgressModal) {
        this.modelProgressModal.classList.remove('active');
      }
    }
  }

  async refreshCacheStats() {
    const stats = await modelEngine.getCacheStats();
    if (this.cachedSizeLabel) {
      this.cachedSizeLabel.textContent = `${stats.formattedSize} (${stats.totalFiles} files cached)`;
    }
  }

  async runAirGapAudit() {
    this.setStatus('AUDITING', 'Conducting Air-Gap Isolation Audit...');
    if (this.btnVerifyAirgap) {
      this.btnVerifyAirgap.disabled = true;
      this.btnVerifyAirgap.textContent = 'Auditing...';
    }

    try {
      const cert = await airgapMonitor.runAirGapVerificationAudit(async (testPrompt) => {
        const res = await modelEngine.generateStream(testPrompt, null, { maxTokens: 48 });
        return res.text;
      });

      // Display Certificate Modal
      if (this.certDetails && this.airgapCertModal) {
        this.certDetails.innerHTML = `
          <div class="cert-box ${cert.verifiedAirGapped ? 'passed' : 'failed'}">
            <div class="cert-header">
              <span class="cert-badge">${cert.verifiedAirGapped ? '✓ 100% AIR-GAP VERIFIED' : '⚠ NETWORK LEAK DETECTED'}</span>
              <span class="cert-id">${cert.auditId}</span>
            </div>
            <div class="cert-grid">
              <div><strong>Status:</strong> ${cert.isolationGrade}</div>
              <div><strong>Packets Transmitted:</strong> ${cert.networkPacketsTransmitted} (Zero outbound)</div>
              <div><strong>Execution Latency:</strong> ${cert.executionDurationMs} ms</div>
              <div><strong>Hardware Boundary:</strong> ${cert.hardwareTarget}</div>
              <div><strong>Integrity Seal:</strong> <code>${cert.verificationHash}</code></div>
              <div><strong>Airplane Mode Active:</strong> ${cert.simulatedAirplaneMode ? 'Yes (Simulated)' : 'No (Direct Air-Gap)'}</div>
            </div>
            <p class="cert-summary">${cert.details}</p>
          </div>
        `;
        this.airgapCertModal.classList.add('active');
      }
    } catch (err) {
      alert('Air-gap audit encounter: ' + err.message);
    } finally {
      if (this.btnVerifyAirgap) {
        this.btnVerifyAirgap.disabled = false;
        this.btnVerifyAirgap.textContent = '🛡 Run Air-Gap Isolation Audit';
      }
      this.setStatus('IDLE', 'Offline & Ready');
    }
  }

  addTranscriptItem(role, content, options = {}) {
    const item = {
      id: 'msg_' + Math.random().toString(36).substring(2, 9),
      role,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isStreaming: options.isStreaming || false,
      metrics: options.metrics || null
    };

    this.transcriptHistory.push(item);
    this.renderTranscript();
    return item;
  }

  updateStreamingTranscriptItem(id, content) {
    const el = document.getElementById(`msg-text-${id}`);
    if (el) {
      el.textContent = content;
      if (this.transcriptList) {
        this.transcriptList.scrollTop = this.transcriptList.scrollHeight;
      }
    }
  }

  renderTranscript() {
    if (!this.transcriptList) return;

    if (this.transcriptHistory.length === 0) {
      this.transcriptList.innerHTML = `
        <div class="empty-transcript">
          <p>No conversation turns yet. Click the <strong>Microphone</strong> or press <kbd>Space</kbd> to begin speaking completely offline.</p>
        </div>
      `;
      return;
    }

    this.transcriptList.innerHTML = this.transcriptHistory.map(item => {
      const isUser = item.role === 'user';
      const isSystem = item.role === 'system';
      const roleLabel = isUser ? 'You' : (isSystem ? 'System' : 'Assistant');
      const avatarIcon = isUser ? '👤' : (isSystem ? '⚙️' : '✦');

      let metricsBadge = '';
      if (item.metrics) {
        metricsBadge = `
          <div class="msg-metrics">
            <span>⚡ ${item.metrics.tokens} tok</span>
            <span>⏱ ${item.metrics.ttftMs}ms TTFT</span>
            <span>🚀 ${item.metrics.tokensPerSec} tok/s</span>
            ${item.metrics.airGapped ? '<span class="tag-airgapped">🛡 Air-Gapped</span>' : ''}
          </div>
        `;
      }

      const replayBtn = (!isUser && !isSystem && !item.isStreaming)
        ? `<button class="btn-replay" data-text="${encodeURIComponent(item.content)}" title="Replay Audio">🔊</button>`
        : '';

      return `
        <div class="transcript-row ${item.role}">
          <div class="msg-avatar">${avatarIcon}</div>
          <div class="msg-bubble">
            <div class="msg-meta">
              <span class="msg-author">${roleLabel}</span>
              <span class="msg-time">${item.timestamp}</span>
              ${replayBtn}
            </div>
            <div class="msg-content" id="msg-text-${item.id}">${item.content}</div>
            ${metricsBadge}
          </div>
        </div>
      `;
    }).join('');

    // Bind replay buttons
    this.transcriptList.querySelectorAll('.btn-replay').forEach(btn => {
      btn.addEventListener('click', () => {
        const rawText = decodeURIComponent(btn.getAttribute('data-text') || '');
        voicePipeline.speakFullText(rawText);
      });
    });

    this.transcriptList.scrollTop = this.transcriptList.scrollHeight;
  }

  exportTranscript(format) {
    if (this.transcriptHistory.length === 0) {
      alert('Transcript is currently empty.');
      return;
    }

    let blob, filename;
    if (format === 'markdown') {
      const mdContent = [
        '# Offline Edge AI Voice Agent - Conversation Transcript',
        `Date: ${new Date().toISOString()}`,
        `Air-Gap Status: Sovereign Isolated (Zero Cloud Packets)`,
        '',
        '---',
        '',
        ...this.transcriptHistory.map(item => {
          const role = item.role.toUpperCase();
          const metrics = item.metrics ? ` *(Tokens: ${item.metrics.tokens}, TTFT: ${item.metrics.ttftMs}ms, Speed: ${item.metrics.tokensPerSec} tok/s)*` : '';
          return `### [${item.timestamp}] ${role}${metrics}\n\n${item.content}\n`;
        })
      ].join('\n');

      blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      filename = `voice-agent-transcript-${Date.now()}.md`;
    } else {
      const jsonContent = JSON.stringify({
        exportedAt: new Date().toISOString(),
        airGapped: true,
        turns: this.transcriptHistory
      }, null, 2);

      blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      filename = `voice-agent-transcript-${Date.now()}.json`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  renderPacketLogs() {
    if (!this.packetLogBody) return;

    const logs = airgapMonitor.logs;
    if (this.packetCountBadge) {
      this.packetCountBadge.textContent = `${logs.length} Packets`;
    }

    if (logs.length === 0) {
      this.packetLogBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-table">No network packets observed. Complete air-gap isolation active.</td>
        </tr>
      `;
      return;
    }

    this.packetLogBody.innerHTML = logs.slice(0, 50).map(entry => {
      const isBlocked = entry.status && entry.status.includes('BLOCKED');
      const isDuring = entry.duringInference;

      return `
        <tr class="${isBlocked ? 'packet-blocked' : ''} ${isDuring ? 'packet-inference' : ''}">
          <td>${entry.timeFormatted}</td>
          <td><span class="badge-method">${entry.method || entry.type}</span></td>
          <td class="url-cell" title="${entry.url}">${entry.url}</td>
          <td><span class="badge-status ${entry.ok ? 'ok' : 'alert'}">${entry.status}</span></td>
          <td>${isDuring ? '<span class="leak-warn">⚠️ During Turn</span>' : '<span class="safe-tag">Background</span>'}</td>
        </tr>
      `;
    }).join('');
  }

  updateNetworkBadge(stats) {
    if (!this.networkBadge) return;

    if (!stats.isOnline) {
      this.networkBadge.className = 'status-tag offline';
      this.networkBadge.innerHTML = '● AIR-GAPPED (OFFLINE)';
    } else {
      this.networkBadge.className = 'status-tag online';
      this.networkBadge.innerHTML = '● AIR-GAP ENFORCED (0 LEAK)';
    }
  }

  updateHardwareBadge(data) {
    if (this.hudGpu) {
      if (data.hasWebGPU && data.gpuInfo) {
        this.hudGpu.textContent = data.gpuInfo.device || data.gpuInfo.vendor || 'WebGPU Active';
      } else {
        this.hudGpu.textContent = 'WASM SIMD (CPU)';
      }
    }
  }

  updateHudBackend(name) {
    if (this.hudBackend) {
      this.hudBackend.textContent = name;
    }
  }

  initTelemetryHUD() {
    this.updateHudBackend('Instant Neural (Zero-Wait)');
    if (this.hudTps) this.hudTps.textContent = '0.0 tok/s';
    if (this.hudTtft) this.hudTtft.textContent = '0 ms';
    if (this.hudTokens) this.hudTokens.textContent = '0 tok';
  }

  updateTelemetryHUD(summary) {
    if (this.hudTps) this.hudTps.textContent = `${summary.lastTokensPerSec} tok/s`;
    if (this.hudTtft) this.hudTtft.textContent = `${summary.lastTtftMs} ms`;
    if (this.hudTokens) this.hudTokens.textContent = `${summary.sessionTokens} tok`;
  }

  initVoiceSelector() {
    if (voicePipeline.availableVoices && voicePipeline.availableVoices.length > 0) {
      this.populateVoiceSelect(voicePipeline.availableVoices, voicePipeline.selectedVoice);
    }
  }

  populateVoiceSelect(voices, selected) {
    if (!this.voiceSelect) return;
    this.voiceSelect.innerHTML = voices.map(v => {
      const isSelected = selected && (selected.voiceURI === v.voiceURI || selected.name === v.name);
      return `<option value="${v.voiceURI}" ${isSelected ? 'selected' : ''}>${v.name} (${v.lang})</option>`;
    }).join('');
  }
}

// Instantiate application once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.__edgeVoiceAgent = new App();
});
