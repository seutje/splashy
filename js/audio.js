export class AudioController {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        this.source = null;
        this.gainNode = this.audioContext.createGain();

        this.playlist = [];
        this.currentIndex = -1;
        this.isPlaying = false;
        this.isShuffle = false;
        this.repeatMode = 'none'; // 'none', 'one', 'all'

        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";

        // Connect audio element to context
        this.track = this.audioContext.createMediaElementSource(this.audioElement);
        this.track.connect(this.analyser);
        this.analyser.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);

        this.audioElement.addEventListener('ended', () => this.onTrackEnded());

        // Event listeners for UI updates
        this.onPlayStateChange = null;
        this.onTrackChange = null;
        this.onTimeUpdate = null;

        this.audioElement.addEventListener('timeupdate', () => {
            if (this.onTimeUpdate) this.onTimeUpdate(this.audioElement.currentTime, this.audioElement.duration);
        });
    }

    addToPlaylist(files) {
        const newTracks = Array.from(files).map(file => ({
            file: file,
            name: file.name.replace(/\.[^/.]+$/, ""),
            url: URL.createObjectURL(file)
        }));
        this.playlist.push(...newTracks);

        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.loadTrack(0);
        }

        return newTracks;
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentIndex = index;
        const track = this.playlist[index];
        this.audioElement.src = track.url;
        this.audioElement.load();

        if (this.onTrackChange) this.onTrackChange(track);

        if (this.isPlaying) {
            this.play();
        }
    }

    async play() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        try {
            await this.audioElement.play();
            this.isPlaying = true;
            if (this.onPlayStateChange) this.onPlayStateChange(true);
        } catch (e) {
            console.error("Playback failed:", e);
        }
    }

    pause() {
        this.audioElement.pause();
        this.isPlaying = false;
        if (this.onPlayStateChange) this.onPlayStateChange(false);
    }

    togglePlay() {
        if (this.isPlaying) this.pause();
        else this.play();
    }

    next() {
        if (this.playlist.length === 0) return;

        let nextIndex;
        if (this.isShuffle) {
            nextIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            nextIndex = (this.currentIndex + 1) % this.playlist.length;
        }
        this.loadTrack(nextIndex);
        this.play();
    }

    prev() {
        if (this.playlist.length === 0) return;

        if (this.audioElement.currentTime > 3) {
            this.audioElement.currentTime = 0;
            return;
        }

        let prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadTrack(prevIndex);
        this.play();
    }

    onTrackEnded() {
        if (this.repeatMode === 'one') {
            this.audioElement.currentTime = 0;
            this.play();
        } else if (this.repeatMode === 'all' || this.currentIndex < this.playlist.length - 1) {
            this.next();
        } else {
            this.isPlaying = false;
            if (this.onPlayStateChange) this.onPlayStateChange(false);
        }
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        return this.isShuffle;
    }

    toggleRepeat() {
        if (this.repeatMode === 'none') this.repeatMode = 'all';
        else if (this.repeatMode === 'all') this.repeatMode = 'one';
        else this.repeatMode = 'none';
        return this.repeatMode;
    }

    seek(percent) {
        if (this.audioElement.duration) {
            this.audioElement.currentTime = percent * this.audioElement.duration;
        }
    }

    getFrequencyData() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    getWaveformData() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }
}
