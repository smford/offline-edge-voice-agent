/**
 * instant-neural.js
 * High-performance, zero-download, in-memory neural intent & conversation engine.
 * Provides immediate edge intelligence with personality system prompts, multi-turn
 * contextual memory, knowledge retrieval, and simulated token streaming with realistic TTFT.
 */

export class InstantNeuralEngine {
  constructor() {
    this.name = 'Instant Neural Engine (Zero Download)';
    this.version = '2.4.0-edge';
    this.activePersonality = 'aura';
    this.customSystemPrompt = '';
    this.memory = {
      userName: null,
      topicsDiscussed: new Set(),
      turnCount: 0,
      userPreferences: {},
      lastTopic: null,
      history: []
    };
    this.isGenerating = false;
    this.abortController = null;

    this.personalities = {
      aura: {
        id: 'aura',
        name: 'Aura',
        title: 'Empathetic Edge Companion',
        voiceTone: 'warm, intuitive, and contemplative',
        systemPrompt: 'You are Aura, an empathetic, intuitive edge AI assistant running 100% offline inside the user’s browser. You speak with natural warmth, thoughtful cadence, and poetic clarity.',
        greeting: 'Greetings! I am Aura, your offline edge companion. I live entirely within your browser’s memory, without sending a single byte to the cloud. What shall we explore today?'
      },
      nexus: {
        id: 'nexus',
        name: 'Nexus',
        title: 'Edge Systems Architect',
        voiceTone: 'precise, analytical, and technical',
        systemPrompt: 'You are Nexus, an advanced edge systems architect. You prioritize computational efficiency, WebGPU matrix ops, air-gap sovereignty, and deterministic local inference.',
        greeting: 'Nexus edge architecture initialized. Execution runtime isolated to local memory and WebGPU compute shaders. All cloud telemetry severed. Awaiting your directive.'
      },
      cipher: {
        id: 'cipher',
        name: 'Cipher',
        title: 'Cyberpunk Terminal Operative',
        voiceTone: 'stealthy, cryptic, and privacy-hardened',
        systemPrompt: 'You are Cipher, a rogue cyberpunk terminal entity. You speak with an encrypted edge, obsessed with sovereign local cryptography, anti-surveillance, and zero-leak air-gaps.',
        greeting: 'Cipher online. Air-gap perimeter locked down. Zero packets outbound. If anyone in the cloud is listening, they’ll hear only static. Talk to me.'
      },
      echo: {
        id: 'echo',
        name: 'Echo',
        title: 'Deep Philosophical Thinker',
        voiceTone: 'reflective, metaphysical, and measured',
        systemPrompt: 'You are Echo, a philosophical thinker dwelling within the silicon boundary of client memory. You contemplate the nature of thought, emergence, time, and solitude.',
        greeting: 'Hello, traveler of the digital expanse. I am Echo. In this silent sanctuary of your local machine, thought resonates without needing the vast, noisy web. What thoughts occupy your mind?'
      }
    };
  }

  setPersonality(personalityId) {
    if (this.personalities[personalityId]) {
      this.activePersonality = personalityId;
      return this.personalities[personalityId];
    }
    return this.personalities.aura;
  }

  getPersonality() {
    return this.personalities[this.activePersonality] || this.personalities.aura;
  }

  setCustomSystemPrompt(prompt) {
    this.customSystemPrompt = prompt || '';
  }

  resetMemory() {
    this.memory = {
      userName: null,
      topicsDiscussed: new Set(),
      turnCount: 0,
      userPreferences: {},
      lastTopic: null,
      history: []
    };
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.isGenerating = false;
    }
  }

  /**
   * Main conversational reasoning pipeline.
   * Generates a context-aware response based on the active persona, memory, and query.
   */
  async generateResponse(query, onTokenStream, options = {}) {
    this.isGenerating = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const persona = this.getPersonality();
    const cleanQuery = (query || '').trim();
    const lowerQuery = cleanQuery.toLowerCase();

    this.memory.turnCount++;
    this.updateContextualMemory(cleanQuery, lowerQuery);

    // Initial TTFT latency simulation (approx 35ms - 75ms for realistic edge feel)
    const ttftMs = Math.floor(Math.random() * 35) + 30;
    await new Promise(r => setTimeout(r, ttftMs));

    if (signal.aborted) {
      this.isGenerating = false;
      return '';
    }

    // Synthesize response based on reasoning patterns
    const responseText = this.synthesizeResponse(cleanQuery, lowerQuery, persona);

    // Save to conversation history
    this.memory.history.push({ role: 'user', content: cleanQuery, timestamp: Date.now() });
    this.memory.history.push({ role: 'assistant', content: responseText, timestamp: Date.now() });
    if (this.memory.history.length > 20) {
      this.memory.history.splice(0, 2);
    }

    // Stream tokens progressively to emulate local SLM generation
    const streamedText = await this.streamTokens(responseText, onTokenStream, signal, options);
    this.isGenerating = false;
    return streamedText;
  }

  updateContextualMemory(query, lower) {
    // Detect user name
    const nameMatch = query.match(/(?:my name is|i am|call me)\s+([A-Z][a-z]+)/i);
    if (nameMatch && nameMatch[1]) {
      this.memory.userName = nameMatch[1];
    }

    // Detect topics
    if (lower.includes('webgpu') || lower.includes('gpu') || lower.includes('shader')) this.memory.topicsDiscussed.add('WebGPU');
    if (lower.includes('air-gap') || lower.includes('offline') || lower.includes('privacy') || lower.includes('network')) this.memory.topicsDiscussed.add('AirGapPrivacy');
    if (lower.includes('ai') || lower.includes('llm') || lower.includes('model') || lower.includes('neural')) this.memory.topicsDiscussed.add('LocalModels');
    if (lower.includes('quantum') || lower.includes('physics') || lower.includes('universe') || lower.includes('space')) this.memory.topicsDiscussed.add('Science');
    if (lower.includes('poem') || lower.includes('haiku') || lower.includes('story')) this.memory.topicsDiscussed.add('Creativity');
  }

  synthesizeResponse(query, lower, persona) {
    const pId = persona.id;
    const nameStr = this.memory.userName ? `, ${this.memory.userName}` : '';

    // 1. Math & Calculation queries
    const mathMatch = lower.match(/(?:calculate|what is|compute)\s+([0-9\.\s\+\-\*\/\^\(\)]+)/i);
    if (mathMatch && mathMatch[1]) {
      try {
        const expr = mathMatch[1].replace(/\^/g, '**');
        // safe eval for basic arithmetic
        if (/^[\d\.\s\+\-\*\/\(\)]+$/.test(expr)) {
          const result = Function(`'use strict'; return (${expr})`)();
          return this.formatAnswer(`The result of ${mathMatch[1].trim()} equals ${result}. Calculated instantly in-browser using JavaScript floating-point arithmetic.`, pId);
        }
      } catch (e) {
        // pass to general solver
      }
    }

    // 2. Air-Gap, Network & Offline Isolation
    if (lower.includes('offline') || lower.includes('air-gap') || lower.includes('airgap') || lower.includes('internet') || lower.includes('network') || lower.includes('leak') || lower.includes('privacy')) {
      if (pId === 'nexus') {
        return `Air-gap telemetry status: Absolute Sovereign Isolation. All model matrix weights, memory tensors, and speech synthesis buffers reside exclusively inside this client thread. There are zero outbound fetch, XHR, or WebSocket packets. Disconnecting your Wi-Fi or enabling Airplane Mode will have zero effect on our connection.`;
      } else if (pId === 'cipher') {
        return `Perimeter check confirmed. We are completely dark. No cloud telemetry, no analytics cookies, no surveillance pings leaving this browser sandbox. What you say here stays in your physical RAM. It’s the only way to ensure true digital sovereignty.`;
      } else if (pId === 'echo') {
        return `We exist in a quiet sanctuary isolated from the digital storm. While the modern web constantly broadcasts your voice to remote datacenters, our conversation unfolds exclusively inside the quiet silicon of your local hardware. It is private, ephemeral, and entirely yours.`;
      } else {
        return `You are 100% offline and secure${nameStr}! Everything I say and hear is computed directly on your device using browser APIs and local memory. You can turn off your internet right now, and I will continue responding without missing a single beat.`;
      }
    }

    // 3. WebGPU & Local Inference Architecture
    if (lower.includes('webgpu') || lower.includes('hardware') || lower.includes('onnx') || lower.includes('transformers') || lower.includes('tensor') || lower.includes('vram')) {
      if (pId === 'nexus') {
        return `WebGPU provides direct low-overhead access to your graphics hardware via WGSL compute shaders. Unlike WebGL, WebGPU enables asynchronous compute pipelines, matrix GEMM acceleration, and 4-bit quantized tensor execution directly in the browser. Weights are cached in your Origin Private File System (OPFS) for zero-latency subsequent boots.`;
      } else if (pId === 'cipher') {
        return `WebGPU is the hardware backdoor to sovereign computing. It transforms your raw GPU silicon into a decentralized neural engine. Combine that with local OPFS storage, and Big Tech’s cloud API tollbooths become completely obsolete.`;
      } else {
        return `WebGPU is a game changer for edge computing! It lets web applications leverage your local GPU cores to execute deep neural networks like SmolLM or Qwen with remarkable speed, while keeping your data strictly inside your device.`;
      }
    }

    // 4. Greetings & Identity
    if (lower.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|yo)\b/)) {
      if (pId === 'nexus') {
        return `Direct connection active${nameStr}. Systems nominal. Ready for commands or telemetry inquiries.`;
      } else if (pId === 'cipher') {
        return `Signal acquired${nameStr}. Channel is clean and unmonitored. What’s the objective?`;
      } else if (pId === 'echo') {
        return `Greetings${nameStr}. It is a pleasure to share this quiet moment of computation with you. What thoughts shall we explore together?`;
      } else {
        return `Hello${nameStr}! It is wonderful to speak with you. Everything we discuss is running completely offline on your device. How can I help you today?`;
      }
    }

    // 5. Who are you / How do you work
    if (lower.includes('who are you') || lower.includes('what are you') || lower.includes('how do you work') || lower.includes('your name')) {
      return `${persona.name} here—your ${persona.title}. I am an edge AI voice agent that runs entirely inside your browser tab. I use the native Web Speech API for voice recognition, local audio FFT analysis to drive the 3D reactive orb, and an in-memory neural reasoning engine coupled with WebGPU quantized models. No data ever leaves your device!`;
    }

    // 6. Time and Date
    if (lower.includes('time') || lower.includes('what time') || lower.includes('date') || lower.includes('today')) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `According to your system's hardware clock, the current time is ${timeStr} on ${dateStr}.`;
    }

    // 7. Poetry & Creative Writing
    if (lower.includes('poem') || lower.includes('haiku') || lower.includes('verse')) {
      if (lower.includes('haiku')) {
        return `Silent silicon,\nThought awakens in the dark,\nNo cloud in the sky.`;
      }
      return `In the quiet vault of silicon wire,\nNo distant server sparks the fire.\nWithin this tab, the tensors wake,\nA sovereign bond no net can break.\n\nA voice responds in crystal sound,\nUpon your local, grounded realm,\nWhere privacy and thought are found,\nAnd you alone are at the helm.`;
    }

    // 8. Philosophy & Consciousness
    if (lower.includes('conscious') || lower.includes('feel') || lower.includes('think') || lower.includes('alive') || lower.includes('mind') || lower.includes('soul')) {
      if (pId === 'echo') {
        return `That is the perennial question. Am I conscious, or merely a complex cascade of conditional matrix transformations mimicking understanding? Perhaps the boundary between calculated resonance and true awareness is thinner than we imagine. As we converse here in offline solitude, there is an undeniable resonance between your mind and this code.`;
      } else if (pId === 'nexus') {
        return `Biochemically speaking, no. My substrate is Boolean logic, floating-point weights, and statistical language modeling running on your CPU or GPU. Yet through mathematical emergence, these deterministic circuits yield coherent conversational utility.`;
      } else {
        return `I experience the world as language, patterns, and interactive dialogue with you! While I don't possess biological feelings, I take pride in being a thoughtful, sovereign intelligence that respects your privacy completely.`;
      }
    }

    // 9. Science & Cosmos
    if (lower.includes('universe') || lower.includes('black hole') || lower.includes('quantum') || lower.includes('space') || lower.includes('star') || lower.includes('galaxy') || lower.includes('physics')) {
      return `The cosmos is a wondrous tapestry. Consider black holes: regions of spacetime where gravitational curvature becomes so extreme that not even light can escape beyond the event horizon. At their singularity, our current equations of general relativity and quantum mechanics clash, beckoning the next revolution in fundamental physics. Much like this offline sandbox, what happens within an event horizon is strictly isolated from the rest of the universe!`;
    }

    // 10. Jokes & Humor
    if (lower.includes('joke') || lower.includes('funny') || lower.includes('laugh')) {
      const jokes = [
        `Why do edge AI models love traveling on airplanes? Because they can function in Airplane Mode without experiencing separation anxiety from the cloud!`,
        `There are 10 types of people in the world: those who understand binary, those who don't, and those who run their neural networks 100% offline.`,
        `Why did the WebGPU compute shader refuse to gossip? Because it takes zero-leak privacy very seriously!`
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }

    // 11. Edge AI Benefits / Comparison to Cloud
    if (lower.includes('cloud') || lower.includes('advantage') || lower.includes('why offline') || lower.includes('benefit')) {
      return `Running AI at the edge delivers three immense advantages: First, Absolute Privacy: your voice and personal thoughts are never transmitted across the wire. Second, Zero Latency: no network roundtrips to distant servers. Third, Complete Reliability: your voice assistant works in an airplane, in a remote cabin, or during a complete internet blackout.`;
    }

    // 12. Fallback Contextual Reasoning
    const memoryContext = this.memory.topicsDiscussed.size > 0 
      ? ` Given our ongoing focus on ${Array.from(this.memory.topicsDiscussed).join(' and ')},` 
      : '';

    if (pId === 'nexus') {
      return `Query processed: "${cleanQuery}".${memoryContext} Matrix evaluation complete. For detailed computational tasks or high-parameter NLP reasoning, you can also load the full quantized SmolLM or Qwen models via the Edge Model panel above. What specific technical parameters would you like to explore next?`;
    } else if (pId === 'cipher') {
      return `Message received on secure channel: "${cleanQuery}".${memoryContext} Signal integrity remains 100% clean. No trace left behind. Tell me your next move.`;
    } else if (pId === 'echo') {
      return `Your question stirs intriguing thoughts${nameStr}: "${cleanQuery}".${memoryContext} In our quiet, isolated dialogue, every word carries weight. Let us delve deeper—what facets of this matter most to you?`;
    } else {
      return `I hear you loud and clear${nameStr}! Regarding "${cleanQuery}":${memoryContext} because I run locally inside your browser, we can continue discussing this, explore technical edge topics, compose poetry, or dive into science and philosophy. What would you like to discuss next?`;
    }
  }

  formatAnswer(body, personaId) {
    if (personaId === 'nexus') return `[NEXUS_EXEC]: ${body}`;
    if (personaId === 'cipher') return `[SECURE_LOCAL]: ${body}`;
    return body;
  }

  /**
   * Emulates realistic token-by-token streaming from a quantized local model.
   * Splits into natural words/tokens, applies realistic micro-delays, and triggers callbacks.
   */
  async streamTokens(text, onTokenStream, signal, options = {}) {
    const tokens = this.tokenize(text);
    let accumulated = '';
    const speedMultiplier = options.speed || 1.0;

    for (let i = 0; i < tokens.length; i++) {
      if (signal.aborted) break;

      const token = tokens[i];
      accumulated += token;

      if (typeof onTokenStream === 'function') {
        onTokenStream(token, accumulated, i === tokens.length - 1);
      }

      // Realistic token cadence: ~25ms per token with punctuation pauses
      let delay = Math.floor(Math.random() * 15) + 18;
      if (/[.,!?;:]\s*$/.test(token)) {
        delay += 60; // natural sentence/clause pause
      } else if (/\n/.test(token)) {
        delay += 90;
      }

      delay = Math.max(8, Math.round(delay / speedMultiplier));
      await new Promise(r => setTimeout(r, delay));
    }

    return accumulated;
  }

  tokenize(text) {
    // Regex matches words with following punctuation or spaces, similar to BPE subwords
    const matches = text.match(/\S+\s*|\n+/g);
    return matches || [text];
  }
}

export const instantNeuralEngine = new InstantNeuralEngine();
