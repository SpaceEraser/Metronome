/**
 * UI controller — handles DOM rendering, arc animation, beat pads, and tempo controls.
 */

const ARC_CIRCUMFERENCE = 2 * Math.PI * 105; // ~659.73, matches the SVG r=105

/**
 * Italian tempo markings.
 */
const TEMPO_NAMES = [
  [0, "Larghissimo"],
  [20, "Grave"],
  [40, "Largo"],
  [45, "Larghetto"],
  [55, "Adagio"],
  [66, "Adagietto"],
  [72, "Andante"],
  [80, "Andantino"],
  [96, "Moderato"],
  [112, "Allegretto"],
  [120, "Allegro"],
  [140, "Vivace"],
  [156, "Vivacissimo"],
  [168, "Presto"],
  [200, "Prestissimo"],
];

/**
 * Get tempo name for a given BPM.
 * @param {number} bpm
 * @returns {string}
 */
function getTempoName(bpm) {
  let name = TEMPO_NAMES[0][1];
  for (const [threshold, label] of TEMPO_NAMES) {
    if (bpm >= threshold) name = label;
    else break;
  }
  return name;
}

export class UI {
  /**
   * @param {import('./engine.js').MetronomeEngine} engine
   */
  constructor(engine) {
    this.engine = engine;

    // DOM refs
    this.arcProgress = document.getElementById("arc-progress");
    this.arcFlash = document.getElementById("arc-flash");
    this.arcContainer = document.getElementById("arc-container");
    this.bpmDisplay = document.getElementById("bpm-display");
    this.bpmInput = document.getElementById("bpm-input");
    this.tempoLabel = document.getElementById("tempo-label");
    this.beatPadsContainer = document.getElementById("beat-pads");
    this.beatsPerBarLabel = document.getElementById("beats-per-bar-label");
    this.beatsInput = document.getElementById("beats-input");
    this.tempoSlider = document.getElementById("tempo-slider");
    this.btnStartStop = document.getElementById("btn-start-stop");
    this.iconPlay = document.getElementById("icon-play");
    this.iconStop = document.getElementById("icon-stop");
    this.startStopLabel = document.getElementById("start-stop-label");

    // Animation state
    this._rafId = null;
    this._lastBeatTime = 0;
    this._lastBeatIndex = -1;
    this._lastBeatState = "off";

    // Long-press state
    this._longPressTimer = null;
    this._longPressRepeater = null;

    this._bindEvents();
  }

  /**
   * Initialize the UI with given settings.
   * @param {Object} settings
   */
  init(settings) {
    this.engine.setTempo(settings.bpm);
    this.engine.beatsPerBar = settings.beatsPerBar;
    this.engine.beatStates = [...settings.beatStates];
    this._updateDisplay();
    this._renderBeatPads();
  }

  _bindEvents() {
    // Start/Stop
    this.btnStartStop.addEventListener("click", () => {
      this.engine.toggle();
    });

    // Engine callbacks
    this.engine.onPlayStateChange = (playing) => {
      this._updatePlayButton(playing);
      if (playing) {
        this._startAnimation();
      } else {
        this._stopAnimation();
      }
    };

    // Tempo slider
    this.tempoSlider.addEventListener("input", (e) => {
      this.engine.setTempo(parseInt(e.target.value, 10));
      this._updateDisplay();
      this._emitSettingsChange();
    });

    // BPM +/-  with long press
    const btnMinus = document.getElementById("btn-bpm-minus");
    const btnPlus = document.getElementById("btn-bpm-plus");

    this._setupLongPress(btnMinus, () => {
      this.engine.setTempo(this.engine.bpm - 1);
      this._updateDisplay();
      this._emitSettingsChange();
    });

    this._setupLongPress(btnPlus, () => {
      this.engine.setTempo(this.engine.bpm + 1);
      this._updateDisplay();
      this._emitSettingsChange();
    });

    // Beats per bar +/-
    document.getElementById("btn-beats-minus").addEventListener("click", () => {
      this.engine.setBeatsPerBar(this.engine.beatsPerBar - 1);
      this._renderBeatPads();
      this._updateDisplay();
      this._emitSettingsChange();
    });

    document.getElementById("btn-beats-plus").addEventListener("click", () => {
      this.engine.setBeatsPerBar(this.engine.beatsPerBar + 1);
      this._renderBeatPads();
      this._updateDisplay();
      this._emitSettingsChange();
    });

    // Inline BPM editing
    this.bpmDisplay.addEventListener("click", () => this._startBpmEdit());
    this.bpmDisplay.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._startBpmEdit();
      }
    });
    this.bpmInput.addEventListener("blur", () => this._commitBpmEdit());
    this.bpmInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._commitBpmEdit();
      }
      if (e.key === "Escape") {
        this._cancelBpmEdit();
      }
    });

    // Inline beats-per-bar editing
    this.beatsPerBarLabel.addEventListener("click", () => this._startBeatsEdit());
    this.beatsPerBarLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._startBeatsEdit();
      }
    });
    this.beatsInput.addEventListener("blur", () => this._commitBeatsEdit());
    this.beatsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._commitBeatsEdit();
      }
      if (e.key === "Escape") {
        this._cancelBeatsEdit();
      }
    });
  }

  /**
   * Set up long-press behavior on a button.
   * @param {HTMLElement} button
   * @param {() => void} action
   */
  _setupLongPress(button, action) {
    const startPress = (e) => {
      e.preventDefault();
      action();
      this._longPressTimer = setTimeout(() => {
        this._longPressRepeater = setInterval(action, 60);
      }, 400);
    };

    const stopPress = () => {
      if (this._longPressTimer) {
        clearTimeout(this._longPressTimer);
        this._longPressTimer = null;
      }
      if (this._longPressRepeater) {
        clearInterval(this._longPressRepeater);
        this._longPressRepeater = null;
      }
    };

    button.addEventListener("mousedown", startPress);
    button.addEventListener("touchstart", startPress, { passive: false });
    button.addEventListener("mouseup", stopPress);
    button.addEventListener("mouseleave", stopPress);
    button.addEventListener("touchend", stopPress);
    button.addEventListener("touchcancel", stopPress);
  }

  /**
   * Render beat pad circles.
   */
  _renderBeatPads() {
    const { beatsPerBar, beatStates } = this.engine;

    this.beatPadsContainer.innerHTML = "";

    for (let i = 0; i < beatsPerBar; i++) {
      const pad = document.createElement("button");
      pad.className = `beat-pad state-${beatStates[i]}`;
      pad.dataset.beat = i + 1;
      pad.dataset.index = i;
      pad.setAttribute("aria-label", `Beat ${i + 1}: ${beatStates[i]}`);
      pad.type = "button";

      // Label inside
      const stateChar =
        beatStates[i] === "high" ? "H" : beatStates[i] === "low" ? "L" : "–";
      pad.textContent = stateChar;

      pad.addEventListener("click", () => {
        const newState = this.engine.cycleBeatState(i);
        pad.className = `beat-pad state-${newState}`;
        pad.textContent =
          newState === "high" ? "H" : newState === "low" ? "L" : "–";
        pad.setAttribute("aria-label", `Beat ${i + 1}: ${newState}`);
        this._emitSettingsChange();
      });

      this.beatPadsContainer.appendChild(pad);
    }
  }

  /**
   * Update all display elements.
   */
  _updateDisplay() {
    const { bpm, beatsPerBar } = this.engine;
    this.bpmDisplay.textContent = bpm;
    this.tempoLabel.textContent = getTempoName(bpm);
    this.tempoSlider.value = bpm;
    this.beatsPerBarLabel.textContent = `${beatsPerBar} beat${beatsPerBar !== 1 ? "s" : ""}`;
  }

  /**
   * Update play/stop button state.
   * @param {boolean} playing
   */
  _updatePlayButton(playing) {
    if (playing) {
      this.btnStartStop.classList.add("playing");
      this.iconPlay.style.display = "none";
      this.iconStop.style.display = "block";
      this.startStopLabel.textContent = "STOP";
    } else {
      this.btnStartStop.classList.remove("playing");
      this.iconPlay.style.display = "block";
      this.iconStop.style.display = "none";
      this.startStopLabel.textContent = "START";
    }
  }

  /**
   * Start the animation loop.
   */
  _startAnimation() {
    this._lastBeatTime = 0;
    this._lastBeatIndex = -1;

    const animate = () => {
      if (!this.engine.isPlaying) return;

      const now = this.engine.audioCtx.currentTime;

      // Consume scheduled beats from the engine
      while (this.engine.scheduledBeats.length > 0) {
        const nextBeat = this.engine.scheduledBeats[0];
        if (nextBeat.time <= now + 0.02) {
          // This beat has arrived (or is about to)
          this.engine.scheduledBeats.shift();
          this._lastBeatTime = nextBeat.time;
          this._lastBeatIndex = nextBeat.beat;
          this._lastBeatState = nextBeat.state;
          this._triggerBeatFlash(nextBeat.state);
          this._highlightActivePad(nextBeat.beat);
        } else {
          break;
        }
      }

      // Update arc progress
      if (this._lastBeatTime > 0) {
        const elapsed = now - this._lastBeatTime;
        const interval = this.engine.secondsPerBeat;
        const progress = Math.min(elapsed / interval, 1);
        this._setArcProgress(progress);
      }

      this._rafId = requestAnimationFrame(animate);
    };

    this._rafId = requestAnimationFrame(animate);
  }

  /**
   * Stop the animation loop and reset visuals.
   */
  _stopAnimation() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._setArcProgress(0);
    this._clearActivePads();
    this.arcContainer.classList.remove("beat-high");
  }

  /**
   * Set the arc progress (0 to 1).
   * @param {number} progress
   */
  _setArcProgress(progress) {
    const offset = ARC_CIRCUMFERENCE * (1 - progress);
    this.arcProgress.style.strokeDashoffset = offset;
  }

  /**
   * Flash the arc ring on a beat.
   * @param {string} state
   */
  _triggerBeatFlash(state) {
    if (state === "high") {
      this.arcContainer.classList.add("beat-high");
    } else {
      this.arcContainer.classList.remove("beat-high");
    }

    // Restart flash animation
    this.arcFlash.classList.remove("arc-flash-active");
    // Force reflow
    this.arcFlash.offsetHeight;
    this.arcFlash.classList.add("arc-flash-active");
  }

  /**
   * Highlight the currently active beat pad.
   * @param {number} beatIndex
   */
  _highlightActivePad(beatIndex) {
    this._clearActivePads();
    const pad = this.beatPadsContainer.querySelector(
      `[data-index="${beatIndex}"]`
    );
    if (pad) {
      pad.classList.add("active-beat");
    }
  }

  /**
   * Clear all active beat highlights.
   */
  _clearActivePads() {
    this.beatPadsContainer
      .querySelectorAll(".active-beat")
      .forEach((el) => el.classList.remove("active-beat"));
  }

  /**
   * Start inline BPM editing.
   */
  _startBpmEdit() {
    this.bpmInput.value = this.engine.bpm;
    this.bpmDisplay.classList.add("editing");
    this.bpmInput.classList.add("editing");
    this.bpmInput.focus();
    this.bpmInput.select();
  }

  /**
   * Commit inline BPM edit.
   */
  _commitBpmEdit() {
    const val = parseInt(this.bpmInput.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 900) {
      this.engine.setTempo(val);
      this._emitSettingsChange();
    }
    this.bpmDisplay.classList.remove("editing");
    this.bpmInput.classList.remove("editing");
    this._updateDisplay();
  }

  /**
   * Cancel inline BPM edit.
   */
  _cancelBpmEdit() {
    this.bpmDisplay.classList.remove("editing");
    this.bpmInput.classList.remove("editing");
  }

  /**
   * Start inline beats-per-bar editing.
   */
  _startBeatsEdit() {
    this.beatsInput.value = this.engine.beatsPerBar;
    this.beatsPerBarLabel.classList.add("editing");
    this.beatsInput.classList.add("editing");
    this.beatsInput.focus();
    this.beatsInput.select();
  }

  /**
   * Commit inline beats-per-bar edit.
   */
  _commitBeatsEdit() {
    const val = parseInt(this.beatsInput.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 16) {
      this.engine.setBeatsPerBar(val);
      this._renderBeatPads();
      this._emitSettingsChange();
    }
    this.beatsPerBarLabel.classList.remove("editing");
    this.beatsInput.classList.remove("editing");
    this._updateDisplay();
  }

  /**
   * Cancel inline beats-per-bar edit.
   */
  _cancelBeatsEdit() {
    this.beatsPerBarLabel.classList.remove("editing");
    this.beatsInput.classList.remove("editing");
  }

  /**
   * Emit a settings change event (for profile auto-save).
   */
  _emitSettingsChange() {
    this._updateDisplay();
    if (this.onSettingsChange) {
      this.onSettingsChange({
        bpm: this.engine.bpm,
        beatsPerBar: this.engine.beatsPerBar,
        beatStates: [...this.engine.beatStates],
      });
    }
  }

  /**
   * Apply a loaded profile's settings.
   * @param {Object} profile
   */
  applyProfile(profile) {
    this.engine.setTempo(profile.bpm);
    this.engine.beatsPerBar = profile.beatsPerBar;
    this.engine.beatStates = [...profile.beatStates];

    // If playing, reset the current beat
    if (this.engine.isPlaying) {
      this.engine.stop();
      this._updateDisplay();
      this._renderBeatPads();
      this.engine.start();
    } else {
      this._updateDisplay();
      this._renderBeatPads();
    }
  }

  /** @type {((settings: {bpm: number, beatsPerBar: number, beatStates: string[]}) => void)|null} */
  onSettingsChange = null;
}
