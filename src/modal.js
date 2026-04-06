/**
 * Profile management modal UI.
 */

import {
  listProfiles,
  saveProfile,
  loadProfile,
  deleteProfile,
  renameProfile,
} from "./profiles.js";

export class ProfileModal {
  /**
   * @param {Object} callbacks
   * @param {() => {bpm: number, beatsPerBar: number, beatStates: string[]}} callbacks.getCurrentSettings
   * @param {(profile: Object) => void} callbacks.onLoadProfile
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.overlay = document.getElementById("modal-overlay");
    this.modal = document.getElementById("modal");
    this.profileList = document.getElementById("profile-list");
    this.profileEmpty = document.getElementById("profile-empty");
    this._pendingDeleteId = null;

    this._bindEvents();
  }

  _bindEvents() {
    document
      .getElementById("btn-profiles")
      .addEventListener("click", () => this.open());
    document
      .getElementById("btn-modal-close")
      .addEventListener("click", () => this.close());
    document
      .getElementById("btn-save-current")
      .addEventListener("click", () => this._saveCurrent());

    // Close on overlay click (outside modal)
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.overlay.hidden) this.close();
    });
  }

  open() {
    this.overlay.hidden = false;
    // Force reflow before adding active class for transition
    this.overlay.offsetHeight;
    this.overlay.classList.add("active");
    this._render();
    document.body.style.overflow = "hidden";
  }

  close() {
    this.overlay.classList.remove("active");
    document.body.style.overflow = "";

    // Wait for transition to finish before hiding
    setTimeout(() => {
      this.overlay.hidden = true;
      this._pendingDeleteId = null;
    }, 350);
  }

  _saveCurrent() {
    const settings = this.callbacks.getCurrentSettings();
    const name = `Preset – ${settings.bpm} BPM`;
    saveProfile({
      name,
      bpm: settings.bpm,
      beatsPerBar: settings.beatsPerBar,
      beatStates: [...settings.beatStates],
    });
    this._render();
  }

  _render() {
    const profiles = listProfiles();

    if (profiles.length === 0) {
      this.profileList.innerHTML = "";
      this.profileEmpty.hidden = false;
      return;
    }

    this.profileEmpty.hidden = true;

    // Sort by lastUsed descending
    profiles.sort((a, b) => b.lastUsed - a.lastUsed);

    this.profileList.innerHTML = profiles
      .map((p) => this._renderProfileItem(p))
      .join("");

    // Bind item events
    this.profileList.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = btn.dataset.action;
        const id = btn.closest("[data-profile-id]").dataset.profileId;
        this._handleAction(action, id);
      });
    });

    // Bind rename inputs
    this.profileList
      .querySelectorAll(".profile-name-input")
      .forEach((input) => {
        const id = input.closest("[data-profile-id]").dataset.profileId;
        const commitRename = () => {
          const newName = input.value.trim();
          if (newName) {
            renameProfile(id, newName);
          }
          this._render();
        };
        input.addEventListener("blur", commitRename);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitRename();
          }
          if (e.key === "Escape") {
            this._render();
          }
        });
      });
  }

  /**
   * @param {Object} profile
   * @returns {string}
   */
  _renderProfileItem(profile) {
    const isDeleting = this._pendingDeleteId === profile.id;
    const beatsInfo = profile.beatStates
      .map((s) => (s === "high" ? "●" : s === "low" ? "○" : "·"))
      .join(" ");

    if (isDeleting) {
      return `
        <div class="delete-confirm" data-profile-id="${profile.id}">
          <span>Delete "${this._escapeHtml(profile.name)}"?</span>
          <button class="btn-confirm-delete" data-action="confirm-delete">Delete</button>
          <button class="btn-cancel-delete" data-action="cancel-delete">Cancel</button>
        </div>
      `;
    }

    return `
      <div class="profile-item" data-profile-id="${profile.id}">
        <div class="profile-info">
          <div class="profile-name">${this._escapeHtml(profile.name)}</div>
          <div class="profile-meta">${profile.bpm} BPM · ${profile.beatsPerBar} beats · ${beatsInfo}</div>
        </div>
        <div class="profile-actions">
          <button class="btn-load" data-action="load" title="Load" aria-label="Load profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="5 12 12 19 19 12"/><line x1="12" y1="19" x2="12" y2="5"/>
            </svg>
          </button>
          <button data-action="rename" title="Rename" aria-label="Rename profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-delete" data-action="delete" title="Delete" aria-label="Delete profile">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * @param {string} action
   * @param {string} id
   */
  _handleAction(action, id) {
    switch (action) {
      case "load": {
        const profile = loadProfile(id);
        if (profile) {
          this.callbacks.onLoadProfile(profile);
          this.close();
        }
        break;
      }
      case "rename": {
        const item = this.profileList.querySelector(
          `[data-profile-id="${id}"] .profile-name`
        );
        if (item) {
          const currentName = item.textContent;
          item.outerHTML = `<input class="profile-name-input" value="${this._escapeHtml(currentName)}" autofocus />`;
          const input = this.profileList.querySelector(
            `[data-profile-id="${id}"] .profile-name-input`
          );
          if (input) {
            input.focus();
            input.select();
            // Re-bind events for this input
            const commitRename = () => {
              const newName = input.value.trim();
              if (newName) {
                renameProfile(id, newName);
              }
              this._render();
            };
            input.addEventListener("blur", commitRename);
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                this._render();
              }
            });
          }
        }
        break;
      }
      case "delete":
        this._pendingDeleteId = id;
        this._render();
        break;
      case "confirm-delete":
        deleteProfile(id);
        this._pendingDeleteId = null;
        this._render();
        break;
      case "cancel-delete":
        this._pendingDeleteId = null;
        this._render();
        break;
    }
  }

  /**
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}
