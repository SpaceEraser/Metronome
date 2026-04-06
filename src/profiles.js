/**
 * Profile management using localStorage.
 *
 * Each profile stores: id, name, bpm, beatsPerBar, beatStates, lastUsed timestamp.
 */

const STORAGE_KEY = "metronome_profiles";
const FIRST_LOAD_KEY = "metronome_initialized";

/**
 * @typedef {Object} Profile
 * @property {string} id
 * @property {string} name
 * @property {number} bpm
 * @property {number} beatsPerBar
 * @property {Array<'off'|'low'|'high'>} beatStates
 * @property {number} lastUsed - Unix timestamp ms
 */

/**
 * Generate a simple unique ID.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Get all profiles from localStorage.
 * @returns {Profile[]}
 */
export function listProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save the profiles array to localStorage.
 * @param {Profile[]} profiles
 */
function saveAll(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

/**
 * Save a new profile (or update existing one by id).
 * @param {Omit<Profile, 'id' | 'lastUsed'> & { id?: string }} data
 * @returns {Profile}
 */
export function saveProfile(data) {
  const profiles = listProfiles();
  const now = Date.now();

  if (data.id) {
    // Update existing
    const index = profiles.findIndex((p) => p.id === data.id);
    if (index !== -1) {
      profiles[index] = { ...profiles[index], ...data, lastUsed: now };
      saveAll(profiles);
      return profiles[index];
    }
  }

  // Create new
  const profile = {
    id: generateId(),
    name: data.name || `Preset ${profiles.length + 1}`,
    bpm: data.bpm,
    beatsPerBar: data.beatsPerBar,
    beatStates: [...data.beatStates],
    lastUsed: now,
  };
  profiles.push(profile);
  saveAll(profiles);
  return profile;
}

/**
 * Load a profile by ID and update its lastUsed timestamp.
 * @param {string} id
 * @returns {Profile|null}
 */
export function loadProfile(id) {
  const profiles = listProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return null;

  profile.lastUsed = Date.now();
  saveAll(profiles);
  return profile;
}

/**
 * Delete a profile by ID.
 * @param {string} id
 */
export function deleteProfile(id) {
  const profiles = listProfiles().filter((p) => p.id !== id);
  saveAll(profiles);
}

/**
 * Rename a profile.
 * @param {string} id
 * @param {string} name
 * @returns {Profile|null}
 */
export function renameProfile(id, name) {
  const profiles = listProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return null;

  profile.name = name;
  saveAll(profiles);
  return profile;
}

/**
 * Get the most recently used profile, or null if none exist.
 * @returns {Profile|null}
 */
export function getLastUsed() {
  const profiles = listProfiles();
  if (profiles.length === 0) return null;

  return profiles.reduce((latest, p) =>
    p.lastUsed > latest.lastUsed ? p : latest
  );
}

/**
 * Check if this is the first time the app is loaded.
 * If so, create the default preset and mark as initialized.
 * @returns {Profile} The profile to load on startup
 */
export function getStartupProfile() {
  const initialized = localStorage.getItem(FIRST_LOAD_KEY);

  if (!initialized) {
    // First load — create default preset
    const defaultProfile = saveProfile({
      name: "Default",
      bpm: 60,
      beatsPerBar: 4,
      beatStates: ["high", "low", "low", "low"],
    });
    localStorage.setItem(FIRST_LOAD_KEY, "1");
    return defaultProfile;
  }

  // Returning user — load last used or create default if somehow empty
  const lastUsed = getLastUsed();
  if (lastUsed) return lastUsed;

  return saveProfile({
    name: "Default",
    bpm: 60,
    beatsPerBar: 4,
    beatStates: ["high", "low", "low", "low"],
  });
}

/**
 * Update the "last used" state by saving current settings to the most recent profile.
 * This is called when settings change so the app restores the latest state on reload.
 * @param {Object} settings
 * @param {number} settings.bpm
 * @param {number} settings.beatsPerBar
 * @param {Array<'off'|'low'|'high'>} settings.beatStates
 */
export function updateLastUsedSettings(settings) {
  const lastUsed = getLastUsed();
  if (lastUsed) {
    saveProfile({
      id: lastUsed.id,
      name: lastUsed.name,
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      beatStates: settings.beatStates,
    });
  }
}
