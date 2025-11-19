import { AudioController } from './audio.js';
import { FluidVisualizer } from './visualizer.js';
import { UI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const audioController = new AudioController();
    const visualizer = new FluidVisualizer(document.getElementById('visualizer'), audioController);
    const ui = new UI(audioController, visualizer);

    // Start the loop
    function animate() {
        visualizer.update();
        visualizer.render();
        ui.update();
        requestAnimationFrame(animate);
    }

    animate();
});
