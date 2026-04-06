/**
 * Application entry point.
 *
 * Wires together the engine, UI, profile manager, and modal.
 */

import "./styles.css";
import { MetronomeEngine } from "./engine.js";
import { UI } from "./ui.js";
import { ProfileModal } from "./modal.js";
import {
  getStartupProfile,
  updateLastUsedSettings,
} from "./profiles.js";

// Initialize engine
const engine = new MetronomeEngine();

// Initialize UI
const ui = new UI(engine);

// Load startup profile and apply settings
const startupProfile = getStartupProfile();
ui.init({
  bpm: startupProfile.bpm,
  beatsPerBar: startupProfile.beatsPerBar,
  beatStates: startupProfile.beatStates,
});

// Auto-save settings changes (debounced)
let saveTimeout = null;
ui.onSettingsChange = (settings) => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    updateLastUsedSettings(settings);
  }, 500);
};

// Initialize profile modal
const modal = new ProfileModal({
  getCurrentSettings: () => ({
    bpm: engine.bpm,
    beatsPerBar: engine.beatsPerBar,
    beatStates: [...engine.beatStates],
  }),
  onLoadProfile: (profile) => {
    ui.applyProfile(profile);
  },
});

// Ensure AudioContext is initialized on first user interaction
let audioInitialized = false;
const initAudio = async () => {
  if (audioInitialized) return;
  audioInitialized = true;
  await engine.init();
};

// Initialize audio on any user interaction
document.addEventListener(
  "click",
  () => {
    initAudio();
  },
  { once: true }
);

document.addEventListener(
  "touchstart",
  () => {
    initAudio();
  },
  { once: true }
);

// Also ensure init before starting
const originalToggle = engine.toggle.bind(engine);
engine.toggle = async function () {
  await initAudio();
  originalToggle();
};
