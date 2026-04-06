/**
 * Metronome audio engine using Web Audio API for sample-accurate scheduling.
 *
 * Uses a lookahead scheduler pattern: a setTimeout loop runs every ~25ms and
 * schedules audio buffer playback ~100ms ahead using AudioContext.currentTime.
 * This avoids timing drift from setInterval while keeping the UI responsive.
 */

import clickHighUrl from "./assets/click-high.wav";
import clickLowUrl from "./assets/click-low.wav";

const SCHEDULE_AHEAD_TIME = 0.1; // seconds to schedule ahead
const LOOKAHEAD_INTERVAL = 25; // ms between scheduler runs

export class MetronomeEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioCtx = null;
    /** @type {AudioBuffer|null} */
    this.bufferHigh = null;
    /** @type {AudioBuffer|null} */
    this.bufferLow = null;

    this.bpm = 60;
    this.beatsPerBar = 4;
    /** @type {Array<'off'|'low'|'high'>} */
    this.beatStates = ["high", "low", "low", "low"];

    this.isPlaying = false;
    this.currentBeat = 0;
    this.nextNoteTime = 0;
    this._schedulerTimer = null;

    // Callbacks
    /** @type {((beat: number, time: number) => void)|null} */
    this.onBeat = null;
    /** @type {((playing: boolean) => void)|null} */
    this.onPlayStateChange = null;

    // Queue of scheduled beats for the UI to consume
    /** @type {Array<{beat: number, time: number}>} */
    this.scheduledBeats = [];
  }

  /**
   * Initialize the audio context and load samples.
   * Must be called from a user gesture (click/tap).
   */
  async init() {
    if (this.audioCtx) return;

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const [highBuf, lowBuf] = await Promise.all([
      this._loadSample(clickHighUrl),
      this._loadSample(clickLowUrl),
    ]);

    this.bufferHigh = highBuf;
    this.bufferLow = lowBuf;
  }

  /**
   * @param {string} url
   * @returns {Promise<AudioBuffer>}
   */
  async _loadSample(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return this.audioCtx.decodeAudioData(arrayBuffer);
  }

  /**
   * Start the metronome.
   */
  start() {
    if (this.isPlaying) return;
    if (!this.audioCtx) {
      console.error("Engine not initialized. Call init() first.");
      return;
    }

    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    this.isPlaying = true;
    this.currentBeat = 0;
    this.nextNoteTime = this.audioCtx.currentTime + 0.05; // small initial delay
    this.scheduledBeats = [];
    this._scheduler();
    this.onPlayStateChange?.(true);
  }

  /**
   * Stop the metronome.
   */
  stop() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    if (this._schedulerTimer !== null) {
      clearTimeout(this._schedulerTimer);
      this._schedulerTimer = null;
    }
    this.scheduledBeats = [];
    this.onPlayStateChange?.(false);
  }

  /**
   * Toggle play/stop.
   */
  toggle() {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Set tempo in BPM (1–900).
   * @param {number} bpm
   */
  setTempo(bpm) {
    this.bpm = Math.max(1, Math.min(900, Math.round(bpm)));

    // If playing, reschedule so the new tempo takes effect immediately
    if (this.isPlaying && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      const newInterval = this.secondsPerBeat;

      // If the next scheduled beat is further out than one new-interval,
      // pull it in so the tempo change is felt immediately
      if (this.nextNoteTime > now + newInterval) {
        this.nextNoteTime = now + newInterval;
      }

      // Discard any scheduled-but-not-yet-played beats that are now stale
      this.scheduledBeats = this.scheduledBeats.filter(
        (b) => b.time <= now + 0.05
      );
    }
  }

  /**
   * Set beats per bar (1–16). Adjusts beatStates array accordingly.
   * @param {number} count
   */
  setBeatsPerBar(count) {
    count = Math.max(1, Math.min(16, count));
    const oldCount = this.beatsPerBar;
    this.beatsPerBar = count;

    if (count > oldCount) {
      // Add new beats as "off"
      for (let i = oldCount; i < count; i++) {
        this.beatStates.push("off");
      }
    } else if (count < oldCount) {
      this.beatStates = this.beatStates.slice(0, count);
    }

    // Reset current beat if it's now out of range
    if (this.currentBeat >= count) {
      this.currentBeat = 0;
    }
  }

  /**
   * Set the state of a specific beat.
   * @param {number} index
   * @param {'off'|'low'|'high'} state
   */
  setBeatState(index, state) {
    if (index >= 0 && index < this.beatStates.length) {
      this.beatStates[index] = state;
    }
  }

  /**
   * Cycle beat state: off → low → high → off.
   * @param {number} index
   */
  cycleBeatState(index) {
    if (index < 0 || index >= this.beatStates.length) return;
    const current = this.beatStates[index];
    const next = current === "off" ? "low" : current === "low" ? "high" : "off";
    this.beatStates[index] = next;
    return next;
  }

  /**
   * Get the current seconds-per-beat interval.
   * @returns {number}
   */
  get secondsPerBeat() {
    return 60.0 / this.bpm;
  }

  /**
   * Internal scheduler — runs in a loop via setTimeout.
   */
  _scheduler() {
    while (
      this.isPlaying &&
      this.nextNoteTime < this.audioCtx.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      this._scheduleNote(this.currentBeat, this.nextNoteTime);
      this._advanceBeat();
    }

    if (this.isPlaying) {
      this._schedulerTimer = setTimeout(
        () => this._scheduler(),
        LOOKAHEAD_INTERVAL
      );
    }
  }

  /**
   * Schedule a single beat's audio playback.
   * @param {number} beatIndex
   * @param {number} time - AudioContext time to play at
   */
  _scheduleNote(beatIndex, time) {
    const state = this.beatStates[beatIndex] || "off";

    // Push to scheduled queue for UI
    this.scheduledBeats.push({ beat: beatIndex, time, state });

    if (state === "off") return;

    const buffer = state === "high" ? this.bufferHigh : this.bufferLow;
    if (!buffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioCtx.destination);
    source.start(time);
  }

  /**
   * Advance to the next beat and calculate next note time.
   */
  _advanceBeat() {
    this.nextNoteTime += this.secondsPerBeat;
    this.currentBeat = (this.currentBeat + 1) % this.beatsPerBar;
  }
}
