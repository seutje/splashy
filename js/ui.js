import { PRESETS } from './presets.js';

export class UI {
    constructor(audioController, visualizer) {
        this.audioController = audioController;
        this.visualizer = visualizer;

        this.uiLayer = document.getElementById('ui-layer');
        this.playlistDrawer = document.getElementById('playlist-drawer');
        this.playlistItems = document.getElementById('playlist-items');
        this.fileUpload = document.getElementById('file-upload');
        this.progressBar = document.getElementById('progress-bar');
        this.progressBarWrapper = document.getElementById('progress-bar-wrapper');
        this.currentTimeEl = document.getElementById('current-time');
        this.totalTimeEl = document.getElementById('total-time');
        this.trackTitle = document.getElementById('track-title');
        this.trackArtist = document.getElementById('track-artist');

        // Buttons
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.playIcon = document.getElementById('play-icon');
        this.pauseIcon = document.getElementById('pause-icon');
        this.uploadBtn = document.getElementById('upload-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.shuffleBtn = document.getElementById('shuffle-btn');
        this.repeatBtn = document.getElementById('repeat-btn');
        this.playlistToggleBtn = document.getElementById('playlist-toggle-btn');
        this.closeDrawerBtn = document.getElementById('close-drawer-btn');
        this.clearPlaylistBtn = document.getElementById('clear-playlist-btn');

        // Settings
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsPanel = document.getElementById('settings-panel');
        this.closeSettingsBtn = document.getElementById('close-settings');
        this.presetContainer = document.getElementById('preset-buttons');

        this.sliders = {
            DENSITY_DISSIPATION: document.getElementById('density-dissipation'),
            VELOCITY_DISSIPATION: document.getElementById('velocity-dissipation'),
            PRESSURE_DISSIPATION: document.getElementById('pressure-dissipation'),
            CURL: document.getElementById('curl'),
            SPLAT_RADIUS: document.getElementById('splat-radius'),
            SPLAT_FORCE: document.getElementById('splat-force')
        };

        this.inactivityTimer = null;

        this.initEventListeners();
        this.setupAudioListeners();
        this.initSettings();
        this.resetInactivityTimer();
    }

    initEventListeners() {
        // Mouse movement for auto-hide
        document.addEventListener('mousemove', () => this.resetInactivityTimer());
        document.addEventListener('click', () => this.resetInactivityTimer());

        // File Upload
        this.fileUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const newTracks = this.audioController.addToPlaylist(e.target.files);
                this.renderPlaylist(newTracks);
            }
        });

        this.uploadBtn.addEventListener('click', () => {
            this.fileUpload.click();
        });

        // Settings Toggle
        this.settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.settingsPanel.classList.remove('hidden');
        });

        this.closeSettingsBtn.addEventListener('click', () => {
            this.settingsPanel.classList.add('hidden');
        });

        // Close settings when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.settingsPanel.contains(e.target) && e.target !== this.settingsBtn && !this.settingsBtn.contains(e.target)) {
                this.settingsPanel.classList.add('hidden');
            }
        });

        // Controls
        this.playPauseBtn.addEventListener('click', () => this.audioController.togglePlay());
        this.nextBtn.addEventListener('click', () => this.audioController.next());
        this.prevBtn.addEventListener('click', () => this.audioController.prev());

        this.shuffleBtn.addEventListener('click', () => {
            const isShuffle = this.audioController.toggleShuffle();
            this.shuffleBtn.classList.toggle('active', isShuffle);
        });

        this.repeatBtn.addEventListener('click', () => {
            const mode = this.audioController.toggleRepeat();
            this.repeatBtn.classList.remove('active');
            if (mode !== 'none') this.repeatBtn.classList.add('active');
            // Could add icon change for 'one' vs 'all'
        });

        this.playlistToggleBtn.addEventListener('click', () => {
            this.playlistDrawer.classList.toggle('hidden');
        });

        this.closeDrawerBtn.addEventListener('click', () => {
            this.playlistDrawer.classList.add('hidden');
        });

        this.clearPlaylistBtn.addEventListener('click', () => {
            this.audioController.playlist = [];
            this.audioController.currentIndex = -1;
            this.audioController.pause();
            this.playlistItems.innerHTML = '';
            this.trackTitle.textContent = "No Track Selected";
        });

        // Progress Bar
        this.progressBarWrapper.addEventListener('click', (e) => {
            const rect = this.progressBarWrapper.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.audioController.seek(percent);
        });
    }

    initSettings() {
        // Generate Preset Buttons
        Object.keys(PRESETS).forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'preset-btn';
            btn.textContent = name;
            btn.addEventListener('click', () => this.applyPreset(name));
            this.presetContainer.appendChild(btn);
        });

        // Slider Listeners
        Object.entries(this.sliders).forEach(([key, slider]) => {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.visualizer.updateConfig({ [key]: value });
            });
        });
    }

    applyPreset(name) {
        const preset = PRESETS[name];
        if (!preset) return;

        // Update Visualizer
        this.visualizer.updateConfig(preset);

        // Update Sliders
        Object.entries(preset).forEach(([key, value]) => {
            if (this.sliders[key]) {
                this.sliders[key].value = value;
            }
        });
    }

    setupAudioListeners() {
        this.audioController.onPlayStateChange = (isPlaying) => {
            if (isPlaying) {
                this.playIcon.classList.add('hidden');
                this.pauseIcon.classList.remove('hidden');
            } else {
                this.playIcon.classList.remove('hidden');
                this.pauseIcon.classList.add('hidden');
            }
        };

        this.audioController.onTrackChange = (track) => {
            this.trackTitle.textContent = track.name;
            this.updateActivePlaylistItem();
        };

        this.audioController.onTimeUpdate = (current, total) => {
            const percent = (current / total) * 100;
            this.progressBar.style.width = `${percent}%`;
            this.currentTimeEl.textContent = this.formatTime(current);
            this.totalTimeEl.textContent = this.formatTime(total);
        };
    }

    renderPlaylist(newTracks) {
        newTracks.forEach(track => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            li.innerHTML = `
                <span class="playlist-item-title">${track.name}</span>
            `;
            li.addEventListener('click', () => {
                const index = this.audioController.playlist.indexOf(track);
                this.audioController.loadTrack(index);
            });
            this.playlistItems.appendChild(li);
        });
        this.updateActivePlaylistItem();
    }

    updateActivePlaylistItem() {
        const items = this.playlistItems.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
            if (i === this.audioController.currentIndex) {
                items[i].classList.add('active');
            }
        }
    }

    resetInactivityTimer() {
        this.uiLayer.classList.remove('inactive');
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            if (!this.audioController.isPlaying) return; // Don't hide if paused
            this.uiLayer.classList.add('inactive');
        }, 3000);
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    update() {
        // Called every frame if needed
    }
}
