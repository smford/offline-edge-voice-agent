/**
 * orb.js
 * Hypnotic 3D Voice-Reactive Ambient Orb.
 * Renders a volumetric morphing particle sphere with neural energy arcs,
 * fluid noise displacement, chromatic shimmer, and 4 dynamic conversation states:
 * - IDLE: Gentle breathing pulse with ambient chromatic shimmer
 * - LISTENING: Expands and pulses rhythmically to live microphone FFT input
 * - THINKING: Swirling high-speed vortex with neural synaptic energy arcs
 * - SPEAKING: Harmonically vibrating sound-wave displacement matching TTS speech output
 */

export class VoiceOrb {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Conversation State: 'idle' | 'listening' | 'thinking' | 'speaking'
    this.state = 'idle';
    this.targetState = 'idle';

    // Particle Sphere Geometry
    this.particleCount = 1400;
    this.particles = [];
    this.baseRadius = 130;
    this.currentRadius = 130;
    this.targetRadius = 130;

    // 3D Rotation Angles & Velocities
    this.rotX = 0;
    this.rotY = 0;
    this.rotZ = 0;
    this.targetRotSpeedX = 0.003;
    this.targetRotSpeedY = 0.005;
    this.currentRotSpeedX = 0.003;
    this.currentRotSpeedY = 0.005;

    // Interactive mouse / touch tracking
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.tiltX = 0;
    this.tiltY = 0;

    // Audio & State Reactivity
    this.audioLevel = 0;
    this.targetAudioLevel = 0;
    this.audioBass = 0;
    this.audioMid = 0;
    this.audioTreble = 0;
    this.speakingPhase = 0;

    // Energy Arcs / Synaptic Neural Sparks
    this.arcs = [];
    this.maxArcs = 16;

    // Animation Time
    this.time = 0;
    this.isRunning = false;

    this.initParticles();
    this.initArcs();
    this.initEvents();
    this.handleResize();
  }

  initParticles() {
    this.particles = [];
    const goldenRatio = (1 + Math.sqrt(5)) / 2;

    for (let i = 0; i < this.particleCount; i++) {
      // Fibonacci sphere distribution for uniform 3D spherical coverage
      const theta = 2 * Math.PI * i / goldenRatio;
      const phi = Math.acos(1 - 2 * (i + 0.5) / this.particleCount);

      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);

      this.particles.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        x: x,
        y: y,
        z: z,
        size: Math.random() * 1.8 + 1.2,
        speedOffset: Math.random() * Math.PI * 2,
        colorHue: Math.random() > 0.4 ? 170 : 275, // Cyan (170) or Violet (275)
        pulseFactor: Math.random() * 0.6 + 0.4
      });
    }
  }

  initArcs() {
    this.arcs = [];
    for (let i = 0; i < this.maxArcs; i++) {
      this.arcs.push({
        startIdx: Math.floor(Math.random() * this.particleCount),
        endIdx: Math.floor(Math.random() * this.particleCount),
        life: Math.random(),
        speed: 0.02 + Math.random() * 0.03,
        hue: Math.random() > 0.5 ? 175 : 290
      });
    }
  }

  initEvents() {
    window.addEventListener('resize', () => this.handleResize());

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      this.targetTiltY = x * 0.8;
      this.targetTiltX = -y * 0.8;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.targetTiltX = 0;
      this.targetTiltY = 0;
    });
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || 420;
    const height = rect.height || 420;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);

    this.displayWidth = width;
    this.displayHeight = height;
    this.baseRadius = Math.min(width, height) * 0.32;
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
    }
  }

  /**
   * Updates audio frequency levels from voice pipeline
   */
  updateAudio(audioData) {
    if (!audioData) return;
    this.targetAudioLevel = audioData.volume || 0;
    this.audioBass = audioData.bass || 0;
    this.audioMid = audioData.mid || 0;
    this.audioTreble = audioData.treble || 0;
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      requestAnimationFrame((t) => this.renderLoop(t));
    }
  }

  stop() {
    this.isRunning = false;
  }

  renderLoop(timestamp) {
    if (!this.isRunning) return;

    const delta = Math.min(40, timestamp - (this.lastFrameTime || timestamp));
    this.lastFrameTime = timestamp;
    this.time += delta * 0.001;

    this.update(delta);
    this.draw();

    requestAnimationFrame((t) => this.renderLoop(t));
  }

  update(delta) {
    const dt = delta * 0.001;

    // Smooth audio level dampening
    this.audioLevel += (this.targetAudioLevel - this.audioLevel) * 0.25;

    // Smooth mouse tilt
    this.tiltX += (this.targetTiltX - this.tiltX) * 0.08;
    this.tiltY += (this.targetTiltY - this.tiltY) * 0.08;

    // State-specific behavior parameters
    switch (this.state) {
      case 'idle':
        this.targetRadius = this.baseRadius * (1 + Math.sin(this.time * 1.5) * 0.04);
        this.targetRotSpeedX = 0.003;
        this.targetRotSpeedY = 0.006;
        break;

      case 'listening':
        // Reactively expands with microphone volume & bass frequencies
        const micBoost = this.audioLevel * 1.6 + this.audioBass * 0.8;
        this.targetRadius = this.baseRadius * (1.05 + micBoost * 0.35);
        this.targetRotSpeedX = 0.008 + this.audioLevel * 0.02;
        this.targetRotSpeedY = 0.012 + this.audioLevel * 0.03;
        break;

      case 'thinking':
        // High-speed vortex rotation and neural acceleration
        this.targetRadius = this.baseRadius * (0.92 + Math.sin(this.time * 6.0) * 0.08);
        this.targetRotSpeedX = 0.035;
        this.targetRotSpeedY = 0.055;
        break;

      case 'speaking':
        // Harmonic sound-wave displacement matching TTS speech output
        this.speakingPhase += dt * 8.0;
        const synthVibe = Math.sin(this.speakingPhase) * 0.12 + Math.cos(this.speakingPhase * 2.3) * 0.08;
        this.targetRadius = this.baseRadius * (1.1 + synthVibe);
        this.targetRotSpeedX = 0.012;
        this.targetRotSpeedY = 0.018;
        break;
    }

    // Smooth radius and rotation speeds
    this.currentRadius += (this.targetRadius - this.currentRadius) * 0.15;
    this.currentRotSpeedX += (this.targetRotSpeedX - this.currentRotSpeedX) * 0.1;
    this.currentRotSpeedY += (this.targetRotSpeedY - this.currentRotSpeedY) * 0.1;

    this.rotX += this.currentRotSpeedX;
    this.rotY += this.currentRotSpeedY;

    // Update Neural Energy Arcs
    for (const arc of this.arcs) {
      arc.life += arc.speed * (this.state === 'thinking' ? 2.5 : 1.0);
      if (arc.life >= 1.0) {
        arc.life = 0;
        arc.startIdx = Math.floor(Math.random() * this.particleCount);
        arc.endIdx = Math.floor(Math.random() * this.particleCount);
        arc.hue = Math.random() > 0.5 ? 175 : 290;
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;
    const cx = w / 2;
    const cy = h / 2;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Ambient Core Glow
    this.drawCoreGlow(ctx, cx, cy);

    // 2. Project and sort particles in 3D
    const projected = [];
    const cosX = Math.cos(this.rotX + this.tiltX);
    const sinX = Math.sin(this.rotX + this.tiltX);
    const cosY = Math.cos(this.rotY + this.tiltY);
    const sinY = Math.sin(this.rotY + this.tiltY);

    const fov = 380;
    const radius = this.currentRadius;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Procedural surface noise displacement
      let displacement = 1.0;

      if (this.state === 'listening') {
        const freqDisplacement = Math.sin(p.speedOffset + this.time * 5.0) * (this.audioLevel * 0.45);
        displacement += freqDisplacement;
      } else if (this.state === 'thinking') {
        const swirl = Math.sin(p.baseY * 6 + this.time * 8.0) * 0.22;
        displacement += swirl;
      } else if (this.state === 'speaking') {
        const wave = Math.sin(p.baseX * 5 + this.speakingPhase) * 0.18 + Math.cos(p.baseZ * 4 + this.speakingPhase) * 0.12;
        displacement += wave;
      } else {
        // Idle breathing shimmer
        displacement += Math.sin(p.speedOffset + this.time * 2.0) * 0.05;
      }

      const curR = radius * displacement;
      const ox = p.baseX * curR;
      const oy = p.baseY * curR;
      const oz = p.baseZ * curR;

      // 3D Rotation Matrix
      // Rotate around Y
      const x1 = ox * cosY + oz * sinY;
      const z1 = -ox * sinY + oz * cosY;

      // Rotate around X
      const y2 = oy * cosX - z1 * sinX;
      const z2 = oy * sinX + z1 * cosX;

      // Perspective Projection
      const depth = fov / (fov + z2);
      const projX = cx + x1 * depth;
      const projY = cy + y2 * depth;

      projected.push({
        x: projX,
        y: projY,
        z: z2,
        depth: depth,
        size: p.size * depth,
        hue: p.colorHue,
        origIdx: i
      });
    }

    // Depth sorting (Back-to-Front)
    projected.sort((a, b) => b.z - a.z);

    // 3. Draw Synaptic Arcs (only in thinking or listening states)
    if (this.state === 'thinking' || this.state === 'listening') {
      this.drawSynapticArcs(ctx, projected);
    }

    // 4. Draw Particles
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      const alpha = Math.max(0.1, Math.min(1.0, (p.depth - 0.4) * 1.5));

      let hue = p.hue;
      let lightness = 55;

      if (this.state === 'thinking') {
        lightness = 70;
        hue = (hue + this.time * 50) % 360;
      } else if (this.state === 'listening' && this.audioLevel > 0.05) {
        lightness = 55 + Math.min(35, this.audioLevel * 40);
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.7, p.size), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 95%, ${lightness}%, ${alpha * 0.85})`;
      ctx.fill();
    }

    // 5. Draw Equatorial Resonance Sound Rings when Speaking
    if (this.state === 'speaking') {
      this.drawSpeakingRings(ctx, cx, cy);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  drawCoreGlow(ctx, cx, cy) {
    const rad = this.currentRadius * 1.35;
    const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);

    let innerColor, midColor, outerColor;

    switch (this.state) {
      case 'listening':
        const greenCyan = `rgba(0, 245, 212, ${0.4 + this.audioLevel * 0.35})`;
        innerColor = greenCyan;
        midColor = 'rgba(121, 40, 202, 0.22)';
        outerColor = 'rgba(0, 0, 0, 0)';
        break;
      case 'thinking':
        innerColor = 'rgba(157, 78, 221, 0.55)';
        midColor = 'rgba(247, 37, 133, 0.25)';
        outerColor = 'rgba(0, 0, 0, 0)';
        break;
      case 'speaking':
        innerColor = 'rgba(0, 245, 212, 0.45)';
        midColor = 'rgba(76, 201, 240, 0.25)';
        outerColor = 'rgba(0, 0, 0, 0)';
        break;
      default: // idle
        innerColor = 'rgba(0, 245, 212, 0.25)';
        midColor = 'rgba(121, 40, 202, 0.15)';
        outerColor = 'rgba(0, 0, 0, 0)';
    }

    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(0.5, midColor);
    gradient.addColorStop(1, outerColor);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSynapticArcs(ctx, projected) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const arc of this.arcs) {
      const p1 = projected[arc.startIdx % projected.length];
      const p2 = projected[arc.endIdx % projected.length];
      if (!p1 || !p2) continue;

      const alpha = Math.sin(arc.life * Math.PI) * 0.45;
      if (alpha <= 0.01) continue;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);

      // Mid-point deflection for electrical spark curve
      const midX = (p1.x + p2.x) / 2 + Math.sin(this.time * 12 + arc.life * 10) * 15;
      const midY = (p1.y + p2.y) / 2 + Math.cos(this.time * 12 + arc.life * 10) * 15;

      ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
      ctx.strokeStyle = `hsla(${arc.hue}, 90%, 65%, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawSpeakingRings(ctx, cx, cy) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      const offset = (this.speakingPhase + i * (Math.PI / 1.5)) % (Math.PI * 2);
      const ringRadius = this.currentRadius * (0.8 + (offset / (Math.PI * 2)) * 0.7);
      const ringAlpha = Math.max(0, 1 - (offset / (Math.PI * 2))) * 0.35;

      ctx.beginPath();
      ctx.ellipse(cx, cy, ringRadius, ringRadius * 0.45, this.rotY * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 245, 212, ${ringAlpha})`;
      ctx.lineWidth = 2.0;
      ctx.stroke();
    }

    ctx.restore();
  }
}
