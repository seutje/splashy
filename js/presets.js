export const PRESETS = {
    "King Tubby": {
        DENSITY_DISSIPATION: 0.96,
        VELOCITY_DISSIPATION: 0.99,
        PRESSURE_DISSIPATION: 0.8,
        CURL: 45,
        SPLAT_RADIUS: 0.01,
        SPLAT_FORCE: 6000,
        COLORS: ['#FFD700', '#8B0000', '#006400'] // Gold, Deep Red, Dark Green
    },
    "Deep Roots": {
        DENSITY_DISSIPATION: 0.99, // Lingers longer
        VELOCITY_DISSIPATION: 0.99,
        PRESSURE_DISSIPATION: 0.7,
        CURL: 10, // Less swirl, more flow
        SPLAT_RADIUS: 0.02, // Bigger, softer hits
        SPLAT_FORCE: 4000,
        COLORS: ['#8B4513', '#D2691E', '#556B2F'] // Saddle Brown, Chocolate, Dark Olive Green
    },
    "Steppers": {
        DENSITY_DISSIPATION: 0.90, // Fades fast
        VELOCITY_DISSIPATION: 0.95, // Stops fast
        PRESSURE_DISSIPATION: 0.9,
        CURL: 50, // Lots of detail
        SPLAT_RADIUS: 0.003, // Sharp hits
        SPLAT_FORCE: 8000,
        COLORS: ['#FF0000', '#FFFF00', '#C0C0C0'] // Red, Yellow, Silver
    },
    "Smoke": {
        DENSITY_DISSIPATION: 0.995, // Very slow fade
        VELOCITY_DISSIPATION: 0.98,
        PRESSURE_DISSIPATION: 0.5,
        CURL: 60, // Very swirly
        SPLAT_RADIUS: 0.008,
        SPLAT_FORCE: 3000,
        COLORS: ['#696969', '#708090', '#F5F5F5'] // Dim Gray, Slate Gray, White Smoke
    },
    "Sound System": {
        DENSITY_DISSIPATION: 0.97,
        VELOCITY_DISSIPATION: 0.98,
        PRESSURE_DISSIPATION: 0.8,
        CURL: 35,
        SPLAT_RADIUS: 0.015,
        SPLAT_FORCE: 10000, // Huge impact
        COLORS: ['#39FF14', '#BF00FF', '#00FFFF'] // Neon Green, Electric Purple, Cyan
    }
};
