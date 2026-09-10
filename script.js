/**
 * ChronoPro — High Precision Interactive Stopwatch Engine
 * Features:
 * - 60fps requestAnimationFrame loop with performance.now() delta tracking (zero drift)
 * - Dynamic SVG dial with continuous seconds and milliseconds sweep
 * - Real-time Lap tracking, fastest/slowest lap detection, and average statistics
 * - Built-in Web Audio API sound synthesizer (no external audio files needed)
 * - Keyboard shortcuts (Space, L, R, M, ?)
 * - Export to CSV & Copy formatted table to clipboard
 * - Multi-theme switcher with persistent user preferences
 */

class StopwatchApp {
  constructor() {
    // Timing state
    this.state = 'STOPPED'; // 'STOPPED' | 'RUNNING' | 'PAUSED'
    this.startTime = 0;
    this.elapsedTime = 0;
    this.animationFrameId = null;

    // Lap tracking
    this.laps = [];
    this.lastLapCumulativeTime = 0;

    // Sound settings
    this.soundEnabled = localStorage.getItem('chronopro_sound') !== 'false';
    this.audioCtx = null;

    // Theme settings
    this.currentTheme = localStorage.getItem('chronopro_theme') || 'cyan';

    // SVG Dial Constants
    this.OUTER_RADIUS = 142;
    this.INNER_RADIUS = 126;
    this.OUTER_CIRCUMFERENCE = 2 * Math.PI * this.OUTER_RADIUS; // ~892.21
    this.INNER_CIRCUMFERENCE = 2 * Math.PI * this.INNER_RADIUS; // ~791.68

    this.initElements();
    this.initDialTicks();
    this.applyTheme(this.currentTheme);
    this.updateSoundIcon();
    this.bindEvents();
    this.updateDisplay(0);
  }

  /* --------------------------------------------------------------------------
     DOM Element Caching
     -------------------------------------------------------------------------- */
  initElements() {
    // Displays
    this.hoursPart = document.getElementById('hoursPart');
    this.minutesPart = document.getElementById('minutesPart');
    this.secondsPart = document.getElementById('secondsPart');
    this.msPart = document.getElementById('msPart');
    this.statusBadge = document.getElementById('statusBadge');
    this.currentLapIndicator = document.getElementById('currentLapIndicator');
    this.currentLapTimeDisplay = document.getElementById('currentLapTimeDisplay');
    this.dialContainer = document.getElementById('dialContainer');
    this.progressSecondsRing = document.getElementById('progressSecondsRing');
    this.progressMsRing = document.getElementById('progressMsRing');
    this.dialTicksGroup = document.getElementById('dialTicks');

    // Controls
    this.startPauseBtn = document.getElementById('startPauseBtn');
    this.startPauseLabel = document.getElementById('startPauseLabel');
    this.iconPlay = this.startPauseBtn.querySelector('.icon-play');
    this.iconPause = this.startPauseBtn.querySelector('.icon-pause');
    this.lapBtn = document.getElementById('lapBtn');
    this.resetBtn = document.getElementById('resetBtn');

    // Lap list & statistics
    this.lapListBody = document.getElementById('lapListBody');
    this.emptyLapsState = document.getElementById('emptyLapsState');
    this.statFastest = document.getElementById('statFastest');
    this.statFastestLapNo = document.getElementById('statFastestLapNo');
    this.statAverage = document.getElementById('statAverage');
    this.statTotalLaps = document.getElementById('statTotalLaps');
    this.statSlowest = document.getElementById('statSlowest');
    this.statSlowestLapNo = document.getElementById('statSlowestLapNo');
    this.copyLapsBtn = document.getElementById('copyLapsBtn');
    this.exportCsvBtn = document.getElementById('exportCsvBtn');

    // Header controls & Modals
    this.soundToggleBtn = document.getElementById('soundToggleBtn');
    this.soundOnIcon = this.soundToggleBtn.querySelector('.sound-on-icon');
    this.soundOffIcon = this.soundToggleBtn.querySelector('.sound-off-icon');
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeMenu = document.getElementById('themeMenu');
    this.themeOptions = document.querySelectorAll('.theme-option');
    this.shortcutsModalBtn = document.getElementById('shortcutsModalBtn');
    this.shortcutsModal = document.getElementById('shortcutsModal');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.toastNotification = document.getElementById('toastNotification');

    // Configure initial SVG stroke dashes
    this.progressSecondsRing.style.strokeDasharray = `${this.OUTER_CIRCUMFERENCE} ${this.OUTER_CIRCUMFERENCE}`;
    this.progressSecondsRing.style.strokeDashoffset = `${this.OUTER_CIRCUMFERENCE}`;
    this.progressMsRing.style.strokeDasharray = `${this.INNER_CIRCUMFERENCE} ${this.INNER_CIRCUMFERENCE}`;
    this.progressMsRing.style.strokeDashoffset = `${this.INNER_CIRCUMFERENCE}`;
  }

  /* --------------------------------------------------------------------------
     Dynamic SVG Dial Ticks Generation (60 ticks around the watch face)
     -------------------------------------------------------------------------- */
  initDialTicks() {
    const cx = 160;
    const cy = 160;
    const rOuter = 135;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 60; i++) {
      const angle = (i * 6) * (Math.PI / 180);
      const isMajor = i % 5 === 0;
      const tickLength = isMajor ? 8 : 4;
      const rInner = rOuter - tickLength;

      const x1 = cx + rOuter * Math.cos(angle);
      const y1 = cy + rOuter * Math.sin(angle);
      const x2 = cx + rInner * Math.cos(angle);
      const y2 = cy + rInner * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('class', `dial-tick ${isMajor ? 'major' : ''}`);
      fragment.appendChild(line);
    }

    this.dialTicksGroup.appendChild(fragment);
  }

  /* --------------------------------------------------------------------------
     Event Listeners Binding
     -------------------------------------------------------------------------- */
  bindEvents() {
    // Stopwatch button clicks
    this.startPauseBtn.addEventListener('click', () => this.toggleStartPause());
    this.lapBtn.addEventListener('click', () => this.recordLap());
    this.resetBtn.addEventListener('click', () => this.reset());

    // Header actions
    this.soundToggleBtn.addEventListener('click', () => this.toggleSound());
    this.shortcutsModalBtn.addEventListener('click', () => this.openModal());
    this.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.shortcutsModal.addEventListener('click', (e) => {
      if (e.target === this.shortcutsModal) this.closeModal();
    });

    // Theme dropdown
    this.themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.themeMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!this.themeToggleBtn.contains(e.target) && !this.themeMenu.contains(e.target)) {
        this.themeMenu.classList.remove('open');
      }
    });

    this.themeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const theme = option.getAttribute('data-theme');
        this.applyTheme(theme);
        this.themeMenu.classList.remove('open');
      });
    });

    // Laps Export
    this.copyLapsBtn.addEventListener('click', () => this.copyLapsToClipboard());
    this.exportCsvBtn.addEventListener('click', () => this.exportLapsToCsv());

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /* --------------------------------------------------------------------------
     Keyboard Shortcuts Handler
     -------------------------------------------------------------------------- */
  handleKeyboardShortcuts(e) {
    // Ignore keys if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.toggleStartPause();
    } else if (e.code === 'KeyL') {
      if (this.state === 'RUNNING') {
        e.preventDefault();
        this.recordLap();
      }
    } else if (e.code === 'KeyR') {
      if (this.state !== 'STOPPED') {
        e.preventDefault();
        this.reset();
      }
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      this.toggleSound();
    } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      this.shortcutsModal.classList.contains('open') ? this.closeModal() : this.openModal();
    } else if (e.key === 'Escape') {
      this.closeModal();
      this.themeMenu.classList.remove('open');
    }
  }

  /* --------------------------------------------------------------------------
     Stopwatch Timing Engine Core
     -------------------------------------------------------------------------- */
  toggleStartPause() {
    if (this.state === 'RUNNING') {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.state === 'RUNNING') return;

    this.initAudioContext();
    this.state = 'RUNNING';
    this.startTime = performance.now() - this.elapsedTime;

    // Update UI Controls
    this.startPauseLabel.textContent = 'Pause';
    this.iconPlay.classList.add('hidden');
    this.iconPause.classList.remove('hidden');
    this.startPauseBtn.classList.add('paused');

    this.lapBtn.disabled = false;
    this.resetBtn.disabled = false;

    // Status & Glow
    this.statusBadge.textContent = 'RUNNING';
    this.statusBadge.className = 'badge-status running';
    this.dialContainer.classList.add('running');
    this.currentLapIndicator.classList.add('visible');

    this.playTone(620, 0.08, 'sine', 880);
    this.tick();
  }

  pause() {
    if (this.state !== 'RUNNING') return;

    this.state = 'PAUSED';
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.elapsedTime = performance.now() - this.startTime;

    // Update UI Controls
    this.startPauseLabel.textContent = 'Resume';
    this.iconPlay.classList.remove('hidden');
    this.iconPause.classList.add('hidden');
    this.startPauseBtn.classList.remove('paused');

    this.lapBtn.disabled = true; // Can't record lap while paused

    // Status & Glow
    this.statusBadge.textContent = 'PAUSED';
    this.statusBadge.className = 'badge-status paused';
    this.dialContainer.classList.remove('running');

    this.playTone(520, 0.1, 'sine');
  }

  reset() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.state = 'STOPPED';
    this.elapsedTime = 0;
    this.startTime = 0;
    this.lastLapCumulativeTime = 0;
    this.laps = [];

    // Reset controls
    this.startPauseLabel.textContent = 'Start';
    this.iconPlay.classList.remove('hidden');
    this.iconPause.classList.add('hidden');
    this.startPauseBtn.classList.remove('paused');

    this.lapBtn.disabled = true;
    this.resetBtn.disabled = true;
    this.copyLapsBtn.disabled = true;
    this.exportCsvBtn.disabled = true;

    // Reset Status & Glow
    this.statusBadge.textContent = 'READY';
    this.statusBadge.className = 'badge-status';
    this.dialContainer.classList.remove('running');
    this.currentLapIndicator.classList.remove('visible');

    // Reset displays
    this.updateDisplay(0);
    this.updateDialRings(0);
    this.renderLaps();
    this.updateLapStatistics();

    this.playTone(440, 0.15, 'triangle', 330);
    this.showToast('Stopwatch reset');
  }

  tick() {
    if (this.state !== 'RUNNING') return;

    const now = performance.now();
    const currentElapsed = now - this.startTime;

    this.updateDisplay(currentElapsed);
    this.updateDialRings(currentElapsed);

    // Update live current lap preview
    const currentLapTime = currentElapsed - this.lastLapCumulativeTime;
    this.currentLapTimeDisplay.textContent = this.formatShortTime(currentLapTime);

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  /* --------------------------------------------------------------------------
     Display Formatting & UI Rendering
     -------------------------------------------------------------------------- */
  updateDisplay(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    this.hoursPart.textContent = String(hours).padStart(2, '0');
    this.minutesPart.textContent = String(minutes).padStart(2, '0');
    this.secondsPart.textContent = String(seconds).padStart(2, '0');
    this.msPart.textContent = String(centiseconds).padStart(2, '0');
  }

  updateDialRings(ms) {
    // Seconds sweep: 0 to 60s
    const secondsFraction = ((ms % 60000) / 60000);
    const outerOffset = this.OUTER_CIRCUMFERENCE - (secondsFraction * this.OUTER_CIRCUMFERENCE);
    this.progressSecondsRing.style.strokeDashoffset = outerOffset.toFixed(2);

    // Milliseconds sweep: 0 to 1000ms loop
    const msFraction = ((ms % 1000) / 1000);
    const innerOffset = this.INNER_CIRCUMFERENCE - (msFraction * this.INNER_CIRCUMFERENCE);
    this.progressMsRing.style.strokeDashoffset = innerOffset.toFixed(2);
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  formatShortTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  formatDelta(deltaMs) {
    if (deltaMs === 0) return '±0.00';
    const sign = deltaMs > 0 ? '+' : '-';
    const absMs = Math.abs(deltaMs);
    const seconds = (absMs / 1000).toFixed(2);
    return `${sign}${seconds}s`;
  }

  /* --------------------------------------------------------------------------
     Lap Tracking & Statistics
     -------------------------------------------------------------------------- */
  recordLap() {
    if (this.state !== 'RUNNING') return;

    const currentTotal = performance.now() - this.startTime;
    const lapDuration = currentTotal - this.lastLapCumulativeTime;
    const lapIndex = this.laps.length + 1;

    // Calculate delta vs previous lap
    let delta = 0;
    if (this.laps.length > 0) {
      delta = lapDuration - this.laps[this.laps.length - 1].lapDuration;
    }

    const lapEntry = {
      lapNumber: lapIndex,
      lapDuration,
      cumulativeTime: currentTotal,
      delta
    };

    this.laps.push(lapEntry);
    this.lastLapCumulativeTime = currentTotal;

    this.copyLapsBtn.disabled = false;
    this.exportCsvBtn.disabled = false;

    this.renderLaps();
    this.updateLapStatistics();
    this.playTone(1046, 0.07, 'sine'); // High C6 crisp beep
  }

  renderLaps() {
    if (this.laps.length === 0) {
      this.emptyLapsState.classList.remove('hidden');
      // Remove any existing lap rows
      const existingRows = this.lapListBody.querySelectorAll('.lap-item');
      existingRows.forEach(row => row.remove());
      return;
    }

    this.emptyLapsState.classList.add('hidden');

    // Determine fastest & slowest laps (highlight only if >= 2 laps exist)
    let minTime = Infinity;
    let maxTime = -Infinity;
    let fastestLapNum = -1;
    let slowestLapNum = -1;

    if (this.laps.length >= 2) {
      this.laps.forEach(lap => {
        if (lap.lapDuration < minTime) {
          minTime = lap.lapDuration;
          fastestLapNum = lap.lapNumber;
        }
        if (lap.lapDuration > maxTime) {
          maxTime = lap.lapDuration;
          slowestLapNum = lap.lapNumber;
        }
      });
    }

    // Render list in reverse order (most recent lap first)
    const existingRows = this.lapListBody.querySelectorAll('.lap-item');
    existingRows.forEach(row => row.remove());

    const fragment = document.createDocumentFragment();
    const reversedLaps = [...this.laps].reverse();

    reversedLaps.forEach((lap, idx) => {
      const isFastest = lap.lapNumber === fastestLapNum;
      const isSlowest = lap.lapNumber === slowestLapNum;

      const row = document.createElement('div');
      let rowClasses = 'lap-item';
      if (isFastest) rowClasses += ' is-fastest';
      if (isSlowest) rowClasses += ' is-slowest';
      row.className = rowClasses;

      // Delta styling
      let deltaClass = 'lap-delta-cell';
      let deltaText = '--';
      if (lap.lapNumber > 1) {
        deltaText = this.formatDelta(lap.delta);
        if (lap.delta < 0) deltaClass += ' faster';
        else if (lap.delta > 0) deltaClass += ' slower';
      }

      // Fastest/Slowest tag badge
      let badgeHtml = '';
      if (isFastest) {
        badgeHtml = '<span class="badge-lap-tag fastest">Fastest</span>';
      } else if (isSlowest) {
        badgeHtml = '<span class="badge-lap-tag slowest">Slowest</span>';
      }

      row.innerHTML = `
        <div class="lap-badge-cell">
          <span class="lap-number">#${String(lap.lapNumber).padStart(2, '0')}</span>
          ${badgeHtml}
        </div>
        <div class="lap-time-cell">${this.formatTime(lap.lapDuration)}</div>
        <div class="${deltaClass}">${deltaText}</div>
        <div class="lap-split-cell">${this.formatTime(lap.cumulativeTime)}</div>
      `;

      fragment.appendChild(row);
    });

    this.lapListBody.appendChild(fragment);
  }

  updateLapStatistics() {
    if (this.laps.length === 0) {
      this.statFastest.textContent = '--:--.--';
      this.statFastestLapNo.textContent = 'Lap #--';
      this.statAverage.textContent = '--:--.--';
      this.statTotalLaps.textContent = '0 Laps total';
      this.statSlowest.textContent = '--:--.--';
      this.statSlowestLapNo.textContent = 'Lap #--';
      return;
    }

    let minLap = this.laps[0];
    let maxLap = this.laps[0];
    let totalLapDuration = 0;

    this.laps.forEach(lap => {
      totalLapDuration += lap.lapDuration;
      if (lap.lapDuration < minLap.lapDuration) minLap = lap;
      if (lap.lapDuration > maxLap.lapDuration) maxLap = lap;
    });

    const avgDuration = totalLapDuration / this.laps.length;

    this.statFastest.textContent = this.formatTime(minLap.lapDuration);
    this.statFastestLapNo.textContent = `Lap #${String(minLap.lapNumber).padStart(2, '0')}`;

    this.statAverage.textContent = this.formatTime(avgDuration);
    this.statTotalLaps.textContent = `${this.laps.length} Lap${this.laps.length === 1 ? '' : 's'} total`;

    this.statSlowest.textContent = this.formatTime(maxLap.lapDuration);
    this.statSlowestLapNo.textContent = `Lap #${String(maxLap.lapNumber).padStart(2, '0')}`;
  }

  /* --------------------------------------------------------------------------
     Export & Copy Actions
     -------------------------------------------------------------------------- */
  copyLapsToClipboard() {
    if (this.laps.length === 0) return;

    let text = `ChronoPro Stopwatch Lap Times\n`;
    text += `Date: ${new Date().toLocaleString()}\n`;
    text += `Total Laps: ${this.laps.length}\n`;
    text += `--------------------------------------------------------\n`;
    text += `Lap #   | Lap Time     | Delta      | Overall Split\n`;
    text += `--------------------------------------------------------\n`;

    this.laps.forEach(lap => {
      const lapNum = `#${String(lap.lapNumber).padStart(2, '0')}`.padEnd(7);
      const lapTime = this.formatTime(lap.lapDuration).padEnd(12);
      const delta = (lap.lapNumber > 1 ? this.formatDelta(lap.delta) : '--').padEnd(10);
      const split = this.formatTime(lap.cumulativeTime);
      text += `${lapNum} | ${lapTime} | ${delta} | ${split}\n`;
    });

    text += `--------------------------------------------------------\n`;

    navigator.clipboard.writeText(text)
      .then(() => {
        this.showToast(`Copied ${this.laps.length} lap${this.laps.length === 1 ? '' : 's'} to clipboard!`);
        this.playTone(800, 0.08, 'sine');
      })
      .catch(err => {
        console.error('Clipboard copy failed:', err);
        this.showToast('Failed to copy to clipboard');
      });
  }

  exportLapsToCsv() {
    if (this.laps.length === 0) return;

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Lap Number,Lap Time (Formatted),Lap Duration (ms),Delta (s),Split Time (Formatted),Split Time (ms)\n';

    this.laps.forEach(lap => {
      const deltaSec = lap.lapNumber > 1 ? (lap.delta / 1000).toFixed(3) : '0';
      const row = [
        lap.lapNumber,
        `"${this.formatTime(lap.lapDuration)}"`,
        Math.round(lap.lapDuration),
        deltaSec,
        `"${this.formatTime(lap.cumulativeTime)}"`,
        Math.round(lap.cumulativeTime)
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.setAttribute('download', `chronopro-laps-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Laps exported as CSV');
    this.playTone(800, 0.08, 'sine');
  }

  /* --------------------------------------------------------------------------
     Synthesizer Audio Feedback (Web Audio API)
     -------------------------------------------------------------------------- */
  initAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playTone(freq, duration = 0.08, type = 'sine', slideToFreq = null) {
    if (!this.soundEnabled) return;
    this.initAudioContext();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      if (slideToFreq) {
        osc.frequency.exponentialRampToValueAtTime(slideToFreq, this.audioCtx.currentTime + duration);
      }

      // Smooth attack & decay envelope to avoid audible speaker pops
      gain.gain.setValueAtTime(0.001, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, this.audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration + 0.02);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('chronopro_sound', this.soundEnabled);
    this.updateSoundIcon();

    if (this.soundEnabled) {
      this.initAudioContext();
      this.playTone(880, 0.08, 'sine');
      this.showToast('Audio feedback enabled');
    } else {
      this.showToast('Audio feedback muted');
    }
  }

  updateSoundIcon() {
    if (this.soundEnabled) {
      this.soundOnIcon.classList.remove('hidden');
      this.soundOffIcon.classList.add('hidden');
      this.soundToggleBtn.classList.add('active');
    } else {
      this.soundOnIcon.classList.add('hidden');
      this.soundOffIcon.classList.remove('hidden');
      this.soundToggleBtn.classList.remove('active');
    }
  }

  /* --------------------------------------------------------------------------
     Theme Management
     -------------------------------------------------------------------------- */
  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chronopro_theme', theme);

    this.themeOptions.forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-theme') === theme);
    });
  }

  /* --------------------------------------------------------------------------
     Modals & Toast Notifications
     -------------------------------------------------------------------------- */
  openModal() {
    this.shortcutsModal.classList.add('open');
    this.shortcutsModal.setAttribute('aria-hidden', 'false');
  }

  closeModal() {
    this.shortcutsModal.classList.remove('open');
    this.shortcutsModal.setAttribute('aria-hidden', 'true');
  }

  showToast(message) {
    this.toastNotification.textContent = message;
    this.toastNotification.classList.add('show');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastNotification.classList.remove('show');
    }, 2400);
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.chronoApp = new StopwatchApp();
});
