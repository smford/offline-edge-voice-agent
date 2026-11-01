/**
 * telemetry.js
 * Real-time performance telemetry, WebGPU hardware inspection,
 * token throughput tracker (tokens/sec, TTFT), and system diagnostics.
 */

class TelemetryManager {
  constructor() {
    this.sessionTokens = 0;
    this.totalTurns = 0;
    this.lastTtftMs = 0;
    this.lastTokensPerSec = 0;
    this.peakTokensPerSec = 0;
    this.averageTtftMs = 0;
    this.totalTtftAccum = 0;

    this.gpuDetails = {
      supported: false,
      vendor: 'Unavailable',
      architecture: 'N/A',
      device: 'N/A',
      maxBufferSize: 'N/A',
      maxComputeWorkgroupStorageSize: 'N/A'
    };

    this.turnHistory = [];
    this.listeners = new Set();

    this.initHardwareInspection();
  }

  async initHardwareInspection() {
    if (typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          this.gpuDetails.supported = true;
          if (adapter.info) {
            this.gpuDetails.vendor = adapter.info.vendor || 'Generic GPU';
            this.gpuDetails.architecture = adapter.info.architecture || 'Direct3D / Metal / Vulkan';
            this.gpuDetails.device = adapter.info.device || 'Direct Compute Device';
            this.gpuDetails.description = adapter.info.description || '';
          } else {
            this.gpuDetails.vendor = 'WebGPU Compatible Adapter';
            this.gpuDetails.device = 'Hardware Accelerated GPU';
          }

          if (adapter.limits) {
            this.gpuDetails.maxBufferSize = (adapter.limits.maxBufferSize / (1024 * 1024)).toFixed(0) + ' MB';
            this.gpuDetails.maxComputeWorkgroupStorageSize = (adapter.limits.maxComputeWorkgroupStorageSize / 1024).toFixed(0) + ' KB';
          }
        }
      } catch (err) {
        console.warn('WebGPU inspection warning:', err);
      }
    }

    this.notify({ event: 'hardware_inspected', gpu: this.gpuDetails });
  }

  recordInferenceTurn({ tokenCount, ttftMs, totalDurationMs, tokensPerSec, modelName }) {
    this.totalTurns++;
    this.sessionTokens += (tokenCount || 0);
    this.lastTtftMs = ttftMs || 0;
    this.totalTtftAccum += this.lastTtftMs;
    this.averageTtftMs = Math.round(this.totalTtftAccum / this.totalTurns);

    const tps = parseFloat(tokensPerSec) || 0;
    this.lastTokensPerSec = tps;
    if (tps > this.peakTokensPerSec) {
      this.peakTokensPerSec = tps;
    }

    const turnRecord = {
      turn: this.totalTurns,
      timestamp: new Date().toLocaleTimeString(),
      tokenCount,
      ttftMs,
      totalDurationMs,
      tokensPerSec: tps,
      modelName: modelName || 'Instant Neural'
    };

    this.turnHistory.push(turnRecord);
    if (this.turnHistory.length > 50) {
      this.turnHistory.shift();
    }

    this.notify({ event: 'turn_recorded', record: turnRecord, stats: this.getSummary() });
  }

  getMemoryInfo() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSizeMB: (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1),
        totalJSHeapSizeMB: (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(1),
        jsHeapLimitMB: (performance.memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1)
      };
    }
    return {
      usedJSHeapSizeMB: 'N/A',
      totalJSHeapSizeMB: 'N/A',
      jsHeapLimitMB: 'N/A'
    };
  }

  getSummary() {
    return {
      sessionTokens: this.sessionTokens,
      totalTurns: this.totalTurns,
      lastTtftMs: this.lastTtftMs,
      averageTtftMs: this.averageTtftMs,
      lastTokensPerSec: this.lastTokensPerSec,
      peakTokensPerSec: this.peakTokensPerSec,
      gpu: this.gpuDetails,
      memory: this.getMemoryInfo()
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(data) {
    for (const listener of this.listeners) {
      try {
        listener(data, this.getSummary());
      } catch (e) {
        console.error('Telemetry listener error:', e);
      }
    }
  }
}

export const telemetry = new TelemetryManager();
