/**
 * model-engine.js
 * Manages local edge model execution via Transformers.js (WebGPU / WASM)
 * and seamless fallback to the built-in Instant Neural Engine.
 * Handles model weight downloading, OPFS/Cache Storage caching, and streaming token generation.
 */

import { instantNeuralEngine } from './instant-neural.js';

export const MODEL_REGISTRY = {
  'instant': {
    id: 'instant',
    name: 'Instant Neural Engine (Zero Download)',
    size: '0 MB',
    type: 'instant',
    description: 'Runs immediately inside memory. Multi-turn reasoning, voice reactive, zero wait time.',
    recommendedDevice: 'CPU / In-Memory'
  },
  'HuggingFaceTB/SmolLM-135M-Instruct': {
    id: 'HuggingFaceTB/SmolLM-135M-Instruct',
    name: 'SmolLM-135M-Instruct (Quantized ONNX)',
    size: '~80 MB',
    type: 'transformers',
    description: 'Ultra-compact transformer optimized for high-speed edge devices and phones.',
    dtype: 'q4',
    recommendedDevice: 'WebGPU / WASM'
  },
  'onnx-community/Qwen2.5-0.5B-Instruct': {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    name: 'Qwen2.5-0.5B-Instruct (Quantized ONNX)',
    size: '~350 MB',
    type: 'transformers',
    description: 'High-capability small language model with strong instruction following and logic.',
    dtype: 'q4',
    recommendedDevice: 'WebGPU'
  }
};

class ModelEngine {
  constructor() {
    this.currentModelId = 'instant';
    this.transformers = null;
    this.generator = null;
    this.isLoading = false;
    this.isLoaded = true; // instant engine is loaded by default
    this.isGenerating = false;
    this.device = 'cpu'; // 'webgpu', 'wasm', or 'cpu'
    this.listeners = new Set();
    this.abortController = null;

    this.checkHardwareCapabilities();
  }

  async checkHardwareCapabilities() {
    this.hasWebGPU = false;
    this.gpuInfo = null;

    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          this.hasWebGPU = true;
          this.device = 'webgpu';
          if (adapter.info) {
            this.gpuInfo = {
              vendor: adapter.info.vendor || 'Generic',
              architecture: adapter.info.architecture || 'Unknown',
              device: adapter.info.device || 'WebGPU Device',
              description: adapter.info.description || ''
            };
          } else {
            this.gpuInfo = { device: 'WebGPU Compatible Hardware' };
          }
        }
      } catch (e) {
        console.warn('WebGPU adapter query failed, falling back to WASM:', e);
        this.device = 'wasm';
      }
    } else {
      this.device = 'wasm';
    }

    this.notify({ event: 'hardware_checked', device: this.device, hasWebGPU: this.hasWebGPU, gpuInfo: this.gpuInfo });
  }

  async switchModel(modelId, onProgress) {
    if (this.currentModelId === modelId && this.isLoaded) {
      return true;
    }

    this.abortCurrentGeneration();

    if (modelId === 'instant') {
      this.currentModelId = 'instant';
      this.isLoaded = true;
      this.isLoading = false;
      this.notify({ event: 'model_ready', modelId: 'instant' });
      return true;
    }

    const modelConfig = MODEL_REGISTRY[modelId] || {
      id: modelId,
      name: modelId,
      dtype: 'q4',
      type: 'transformers'
    };

    this.isLoading = true;
    this.currentModelId = modelId;
    this.notify({ event: 'model_loading_start', modelId: modelId });

    try {
      // Lazy load Transformers.js
      if (!this.transformers) {
        onProgress && onProgress({ status: 'init_library', progress: 5, text: 'Loading Transformers.js WebGPU runtime...' });
        this.transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
        this.transformers.env.allowLocalModels = false;
        this.transformers.env.useBrowserCache = true;
      }

      const { pipeline } = this.transformers;

      const targetDevice = this.hasWebGPU ? 'webgpu' : 'wasm';

      onProgress && onProgress({ status: 'fetching_weights', progress: 15, text: `Initializing ${modelConfig.name} on ${targetDevice.toUpperCase()}...` });

      const progressCallback = (p) => {
        let percent = 0;
        let infoText = 'Downloading model files...';

        if (p.status === 'progress') {
          percent = Math.round(p.progress || (p.loaded && p.total ? (p.loaded / p.total) * 100 : 0));
          const mbLoaded = p.loaded ? (p.loaded / (1024 * 1024)).toFixed(1) : '0';
          const mbTotal = p.total ? (p.total / (1024 * 1024)).toFixed(1) : '?';
          infoText = `Downloading ${p.file || 'weights'}: ${mbLoaded}MB / ${mbTotal}MB (${percent}%)`;
        } else if (p.status === 'initiate') {
          infoText = `Starting retrieval of ${p.file || 'model components'}...`;
        } else if (p.status === 'done') {
          infoText = `Cached ${p.file || 'component'} locally.`;
          percent = 100;
        }

        if (onProgress) {
          onProgress({ status: p.status, progress: percent, text: infoText, detail: p });
        }
        this.notify({ event: 'model_download_progress', progress: percent, text: infoText });
      };

      this.generator = await pipeline('text-generation', modelId, {
        device: targetDevice,
        dtype: modelConfig.dtype || 'q4',
        progress_callback: progressCallback
      });

      this.device = targetDevice;
      this.isLoaded = true;
      this.isLoading = false;
      this.notify({ event: 'model_ready', modelId: modelId, device: targetDevice });
      return true;
    } catch (err) {
      console.error('Failed to load edge model:', err);
      this.isLoading = false;
      this.notify({ event: 'model_load_error', error: err.message, modelId: modelId });
      throw err;
    }
  }

  abortCurrentGeneration() {
    if (this.isGenerating) {
      if (this.abortController) {
        this.abortController.abort();
      }
      instantNeuralEngine.abort();
      this.isGenerating = false;
      this.notify({ event: 'generation_aborted' });
    }
  }

  /**
   * Generates a streamed response using either the instant neural engine or the loaded local SLM.
   */
  async generateStream(prompt, onTokenCallback, options = {}) {
    this.isGenerating = true;
    this.abortController = new AbortController();

    const startTime = performance.now();
    let ttftTime = null;
    let tokenCount = 0;

    const wrappedOnToken = (token, fullText, isFinished) => {
      if (!ttftTime) {
        ttftTime = performance.now() - startTime;
      }
      tokenCount++;
      if (onTokenCallback) {
        onTokenCallback(token, fullText, isFinished, {
          tokenCount,
          elapsedMs: performance.now() - startTime,
          ttftMs: ttftTime
        });
      }
    };

    try {
      if (this.currentModelId === 'instant' || !this.generator) {
        const fullText = await instantNeuralEngine.generateResponse(prompt, wrappedOnToken, options);
        const totalDuration = performance.now() - startTime;
        this.isGenerating = false;
        return {
          text: fullText,
          tokenCount,
          ttftMs: Math.round(ttftTime || 30),
          totalDurationMs: Math.round(totalDuration),
          tokensPerSec: tokenCount > 0 ? ((tokenCount / (totalDuration / 1000))).toFixed(1) : 0,
          model: 'Instant Neural Engine'
        };
      }

      // Execute via Transformers.js pipeline
      const { TextStreamer } = this.transformers;
      let accumulatedText = '';

      const customStreamer = new TextStreamer(this.generator.tokenizer, {
        skip_prompt: true,
        callback_function: (tokenText) => {
          accumulatedText += tokenText;
          wrappedOnToken(tokenText, accumulatedText, false);
        }
      });

      const messages = [
        { role: 'system', content: options.systemPrompt || 'You are an intelligent, concise edge AI voice assistant.' },
        { role: 'user', content: prompt }
      ];

      const output = await this.generator(messages, {
        max_new_tokens: options.maxTokens || 128,
        temperature: options.temperature || 0.7,
        top_p: 0.9,
        streamer: customStreamer
      });

      const totalDuration = performance.now() - startTime;
      const finalText = output && output[0] && output[0].generated_text
        ? (typeof output[0].generated_text === 'string'
            ? output[0].generated_text
            : (output[0].generated_text.slice(-1)[0]?.content || accumulatedText))
        : accumulatedText;

      wrappedOnToken('', finalText, true);
      this.isGenerating = false;

      return {
        text: finalText,
        tokenCount,
        ttftMs: Math.round(ttftTime || 50),
        totalDurationMs: Math.round(totalDuration),
        tokensPerSec: tokenCount > 0 ? ((tokenCount / (totalDuration / 1000))).toFixed(1) : 0,
        model: this.currentModelId
      };
    } catch (err) {
      this.isGenerating = false;
      throw err;
    }
  }

  /**
   * Inspects Cache Storage and calculates total cached model weights.
   */
  async getCacheStats() {
    const stats = {
      totalBytes: 0,
      totalFiles: 0,
      cachesFound: []
    };

    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await window.caches.keys();
        for (const name of cacheNames) {
          const cache = await window.caches.open(name);
          const requests = await cache.keys();
          stats.cachesFound.push({ name, fileCount: requests.length });
          stats.totalFiles += requests.length;

          for (const req of requests) {
            try {
              const res = await cache.match(req);
              if (res) {
                const blob = await res.clone().blob();
                stats.totalBytes += blob.size;
              }
            } catch (e) {
              // ignore single asset read error
            }
          }
        }
      } catch (err) {
        console.warn('Could not read cache storage:', err);
      }
    }

    return {
      ...stats,
      formattedSize: (stats.totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
    };
  }

  async clearModelCache() {
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheNames = await window.caches.keys();
        for (const name of cacheNames) {
          await window.caches.delete(name);
        }
        this.notify({ event: 'cache_cleared' });
        return true;
      } catch (e) {
        console.error('Error clearing model cache:', e);
        return false;
      }
    }
    return false;
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
        console.error('ModelEngine listener error:', e);
      }
    }
  }
}

export const modelEngine = new ModelEngine();
