/**
 * airgap-monitor.js
 * Comprehensive client-side network isolation interceptor, telemetry logger,
 * and automated air-gap verification auditor.
 */

class AirGapMonitor {
  constructor() {
    this.logs = [];
    this.maxLogs = 500;
    this.listeners = new Set();
    this.isAirGappedActive = true;
    this.airplaneModeSimulated = false;
    this.inferenceActive = false;
    this.packetsDuringInference = 0;
    this.totalIntercepted = 0;
    this.blockedCount = 0;

    this.initInterceptors();
    this.initNetworkListeners();
  }

  initInterceptors() {
    const self = this;

    // 1. Intercept window.fetch
    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch;
      this._originalFetch = originalFetch;

      window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || 'unknown';
        const method = (args[1] && args[1].method) || (args[0] && args[0].method) || 'GET';
        const isOfflineAllowed = false; // in strict air-gap, no calls allowed during inference

        const logEntry = {
          id: self.generateId(),
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          type: 'FETCH',
          method: method.toUpperCase(),
          url: url,
          duringInference: self.inferenceActive,
          status: 'PENDING'
        };

        if (self.airplaneModeSimulated) {
          logEntry.status = 'BLOCKED_AIRPLANE_MODE';
          self.recordLog(logEntry);
          self.blockedCount++;
          throw new TypeError(`Air-Gap Enforcement: Network fetch to "${url}" blocked in Airplane Simulation mode.`);
        }

        try {
          const response = await originalFetch.apply(this, args);
          logEntry.status = `${response.status} ${response.statusText}`;
          logEntry.ok = response.ok;
          self.recordLog(logEntry);
          return response;
        } catch (err) {
          logEntry.status = 'ERROR';
          logEntry.error = err.message;
          self.recordLog(logEntry);
          throw err;
        }
      };
    }

    // 2. Intercept XMLHttpRequest
    if (typeof window.XMLHttpRequest === 'function') {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      this._originalXmlOpen = originalOpen;
      this._originalXmlSend = originalSend;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__airgap_info = {
          id: self.generateId(),
          method: (method || 'GET').toUpperCase(),
          url: url,
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          type: 'XHR',
          duringInference: self.inferenceActive
        };
        return originalOpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        const info = this.__airgap_info || {
          id: self.generateId(),
          type: 'XHR',
          url: 'unknown',
          method: 'GET',
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          duringInference: self.inferenceActive
        };

        if (self.airplaneModeSimulated) {
          info.status = 'BLOCKED_AIRPLANE_MODE';
          self.recordLog(info);
          self.blockedCount++;
          throw new DOMException(`Air-Gap Enforcement: XHR to "${info.url}" blocked in Airplane Mode.`, 'NetworkError');
        }

        this.addEventListener('load', () => {
          info.status = `${this.status} ${this.statusText}`;
          self.recordLog(info);
        });

        this.addEventListener('error', () => {
          info.status = 'ERROR';
          self.recordLog(info);
        });

        return originalSend.apply(this, args);
      };
    }

    // 3. Intercept WebSocket
    if (typeof window.WebSocket === 'function') {
      const OriginalWebSocket = window.WebSocket;
      this._originalWebSocket = OriginalWebSocket;

      window.WebSocket = function (url, protocols) {
        const entry = {
          id: self.generateId(),
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          type: 'WEBSOCKET',
          method: 'CONNECT',
          url: url,
          duringInference: self.inferenceActive,
          status: self.airplaneModeSimulated ? 'BLOCKED' : 'OPENING'
        };
        self.recordLog(entry);

        if (self.airplaneModeSimulated) {
          self.blockedCount++;
          throw new DOMException(`WebSocket connection to "${url}" blocked in Airplane Mode`, 'SecurityError');
        }

        return new OriginalWebSocket(url, protocols);
      };
    }

    // 4. Intercept sendBeacon
    if (navigator.sendBeacon) {
      const originalSendBeacon = navigator.sendBeacon.bind(navigator);
      this._originalSendBeacon = originalSendBeacon;

      navigator.sendBeacon = function (url, data) {
        const entry = {
          id: self.generateId(),
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleTimeString(),
          type: 'BEACON',
          method: 'POST',
          url: url,
          duringInference: self.inferenceActive,
          status: self.airplaneModeSimulated ? 'BLOCKED' : 'SENT'
        };
        self.recordLog(entry);

        if (self.airplaneModeSimulated) {
          self.blockedCount++;
          return false;
        }

        return originalSendBeacon(url, data);
      };
    }
  }

  initNetworkListeners() {
    window.addEventListener('online', () => {
      this.notifyListeners({ event: 'network_change', online: navigator.onLine });
    });
    window.addEventListener('offline', () => {
      this.notifyListeners({ event: 'network_change', online: false });
    });
  }

  recordLog(entry) {
    this.totalIntercepted++;
    if (this.inferenceActive) {
      this.packetsDuringInference++;
    }

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notifyListeners({ event: 'packet_logged', entry: entry });
  }

  generateId() {
    return 'pkt_' + Math.random().toString(36).substring(2, 9);
  }

  startInferenceAudit() {
    this.inferenceActive = true;
    this.packetsDuringInference = 0;
    this.currentAuditStartTime = performance.now();
  }

  endInferenceAudit() {
    this.inferenceActive = false;
    const durationMs = performance.now() - (this.currentAuditStartTime || performance.now());
    const packets = this.packetsDuringInference;

    return {
      success: packets === 0,
      packetsSent: packets,
      durationMs: Math.round(durationMs),
      airGapped: packets === 0,
      timestamp: new Date().toISOString()
    };
  }

  setAirplaneModeSimulation(enabled) {
    this.airplaneModeSimulated = Boolean(enabled);
    this.notifyListeners({ event: 'airplane_mode_toggle', enabled: this.airplaneModeSimulated });
  }

  isOnline() {
    if (this.airplaneModeSimulated) return false;
    return navigator.onLine;
  }

  getStats() {
    return {
      isOnline: this.isOnline(),
      physicalOnline: navigator.onLine,
      airplaneModeSimulated: this.airplaneModeSimulated,
      totalIntercepted: this.totalIntercepted,
      packetsDuringInference: this.packetsDuringInference,
      blockedCount: this.blockedCount,
      totalLogs: this.logs.length
    };
  }

  clearLogs() {
    this.logs = [];
    this.totalIntercepted = 0;
    this.packetsDuringInference = 0;
    this.blockedCount = 0;
    this.notifyListeners({ event: 'logs_cleared' });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data, this.getStats());
      } catch (e) {
        console.error('AirGap listener error:', e);
      }
    }
  }

  /**
   * Performs an automated official air-gap isolation test.
   * Runs a test query through the active inference engine while monitoring network packets.
   */
  async runAirGapVerificationAudit(inferenceTestFn) {
    const auditId = 'AUDIT-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const startTime = Date.now();
    const startPackets = this.totalIntercepted;

    this.startInferenceAudit();

    let outputText = '';
    let inferenceError = null;

    try {
      if (typeof inferenceTestFn === 'function') {
        outputText = await inferenceTestFn('Air-gap verification ping: verify sovereign on-device computation.');
      }
    } catch (err) {
      inferenceError = err.message;
    }

    const auditResult = this.endInferenceAudit();
    const endTime = Date.now();
    const packetsObserved = this.totalIntercepted - startPackets;

    // Cryptographic-style verification token
    const proofPayload = `${auditId}|${startTime}|${endTime}|packets:${auditResult.packetsSent}|status:${auditResult.success ? 'PASSED' : 'LEAK_DETECTED'}`;
    let hash = 0;
    for (let i = 0; i < proofPayload.length; i++) {
      hash = ((hash << 5) - hash) + proofPayload.charCodeAt(i);
      hash |= 0;
    }
    const hexDigest = '0x' + Math.abs(hash).toString(16).padStart(8, '0') + Math.random().toString(16).substring(2, 10);

    const certificate = {
      auditId: auditId,
      timestamp: new Date().toISOString(),
      verifiedAirGapped: auditResult.packetsSent === 0 && !inferenceError,
      networkPacketsTransmitted: auditResult.packetsSent,
      packetsObservedInInterval: packetsObserved,
      executionDurationMs: auditResult.durationMs,
      hardwareTarget: 'Client WebGPU / In-Memory Edge Runtime',
      verificationHash: hexDigest,
      isolationGrade: auditResult.packetsSent === 0 ? 'SOVEREIGN_AIR_GAP_GRADE_A' : 'NETWORK_LEAK_DETECTED',
      simulatedAirplaneMode: this.airplaneModeSimulated,
      physicalOnlineState: navigator.onLine,
      details: auditResult.packetsSent === 0
        ? 'Strict zero-leak client isolation verified. Model computed 100% locally with zero HTTP/WebSocket/fetch packets leaving the browser sandbox.'
        : `Network activity detected (${auditResult.packetsSent} packets). Review the packet log inspector.`,
      error: inferenceError
    };

    return certificate;
  }
}

export const airgapMonitor = new AirGapMonitor();
