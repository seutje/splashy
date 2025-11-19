export class FluidVisualizer {
    constructor(canvas, audioController) {
        this.canvas = canvas;
        this.audioController = audioController;
        this.gl = canvas.getContext('webgl2', { alpha: false });

        if (!this.gl) {
            console.error("WebGL2 not supported");
            return;
        }

        this.config = {
            SIM_RESOLUTION: 512,
            DENSITY_DISSIPATION: 0.98,
            VELOCITY_DISSIPATION: 0.99,
            PRESSURE_DISSIPATION: 0.8,
            PRESSURE_ITERATIONS: 20,
            CURL: 30,
            SPLAT_RADIUS: 0.005,
            SPLAT_FORCE: 6000,
            COLORS: ['#FFD700', '#8B0000', '#006400'] // Default to King Tubby colors
        };

        this.pointers = [];
        this.splatStack = [];

        // Check extensions
        this.ext = this.gl.getExtension('EXT_color_buffer_float');
        this.linear = this.gl.getExtension('OES_texture_float_linear');

        this.initShaders();
        this.initMesh();
        this.initFramebuffers();
        this.resize();

        window.addEventListener('resize', () => this.resize());

        // Interaction for testing/fun
        this.canvas.addEventListener('mousemove', (e) => {
            this.pointers.push({
                x: e.offsetX / this.canvas.width,
                y: 1.0 - e.offsetY / this.canvas.height,
                dx: e.movementX * 5.0,
                dy: -e.movementY * 5.0,
                color: { r: 1.0, g: 1.0, b: 1.0 }
            });
        });

        this.canvas.addEventListener('click', (e) => {
            this.splatStack.push({
                x: e.offsetX / this.canvas.width,
                y: 1.0 - e.offsetY / this.canvas.height,
                dx: (Math.random() - 0.5) * 2000,
                dy: (Math.random() - 0.5) * 2000,
                color: { r: Math.random(), g: Math.random(), b: Math.random() }
            });
        });
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.initFramebuffers();
    }

    initMesh() {
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        const positions = [
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        // We assume location 0 for aPosition in all shaders
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
    }

    initShaders() {
        const baseVertexShader = `#version 300 es
            layout(location = 0) in vec2 aPosition;
            out vec2 vUv;
            out vec2 vL;
            out vec2 vR;
            out vec2 vT;
            out vec2 vB;
            uniform vec2 texelSize;

            void main () {
                vUv = aPosition * 0.5 + 0.5;
                vL = vUv - vec2(texelSize.x, 0.0);
                vR = vUv + vec2(texelSize.x, 0.0);
                vT = vUv + vec2(0.0, texelSize.y);
                vB = vUv - vec2(0.0, texelSize.y);
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        const copyShader = `#version 300 es
            precision mediump float;
            precision mediump sampler2D;
            in vec2 vUv;
            out vec4 outColor;
            uniform sampler2D uTexture;
            void main () {
                outColor = texture(uTexture, vUv);
            }
        `;

        const splatShader = `#version 300 es
            precision highp float;
            precision highp sampler2D;
            in vec2 vUv;
            out vec4 outColor;
            uniform sampler2D uTarget;
            uniform float aspectRatio;
            uniform vec3 color;
            uniform vec2 point;
            uniform float radius;

            void main () {
                vec2 p = vUv - point.xy;
                p.x *= aspectRatio;
                vec3 splat = exp(-dot(p, p) / radius) * color;
                vec3 base = texture(uTarget, vUv).xyz;
                outColor = vec4(base + splat, 1.0);
            }
        `;

        const advectionShader = `#version 300 es
            precision highp float;
            precision highp sampler2D;
            in vec2 vUv;
            out vec4 outColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uSource;
            uniform vec2 texelSize;
            uniform vec2 dyeTexelSize;
            uniform float dt;
            uniform float dissipation;

            void main () {
                vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
                vec4 result = texture(uSource, coord);
                float decay = 1.0 + dissipation * dt;
                outColor = result / decay;
            }
        `;

        const divergenceShader = `#version 300 es
            precision mediump float;
            precision mediump sampler2D;
            in vec2 vUv;
            in vec2 vL;
            in vec2 vR;
            in vec2 vT;
            in vec2 vB;
            out float outColor;
            uniform sampler2D uVelocity;

            void main () {
                float L = texture(uVelocity, vL).x;
                float R = texture(uVelocity, vR).x;
                float T = texture(uVelocity, vT).y;
                float B = texture(uVelocity, vB).y;
                vec2 C = texture(uVelocity, vUv).xy;
                if (vL.x < 0.0) { L = -C.x; }
                if (vR.x > 1.0) { R = -C.x; }
                if (vT.y > 1.0) { T = -C.y; }
                if (vB.y < 0.0) { B = -C.y; }
                float div = 0.5 * (R - L + T - B);
                outColor = div;
            }
        `;

        const curlShader = `#version 300 es
            precision mediump float;
            precision mediump sampler2D;
            in vec2 vUv;
            in vec2 vL;
            in vec2 vR;
            in vec2 vT;
            in vec2 vB;
            out float outColor;
            uniform sampler2D uVelocity;

            void main () {
                float L = texture(uVelocity, vL).y;
                float R = texture(uVelocity, vR).y;
                float T = texture(uVelocity, vT).x;
                float B = texture(uVelocity, vB).x;
                float vorticity = R - L - T + B;
                outColor = vorticity;
            }
        `;

        const vorticityShader = `#version 300 es
            precision highp float;
            precision highp sampler2D;
            in vec2 vUv;
            in vec2 vL;
            in vec2 vR;
            in vec2 vT;
            in vec2 vB;
            out vec4 outColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uCurl;
            uniform float curl;
            uniform float dt;

            void main () {
                float L = texture(uCurl, vL).x;
                float R = texture(uCurl, vR).x;
                float T = texture(uCurl, vT).x;
                float B = texture(uCurl, vB).x;
                float C = texture(uCurl, vUv).x;
                vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
                force /= length(force) + 0.0001;
                force *= curl * C;
                force.y *= -1.0;
                vec2 vel = texture(uVelocity, vUv).xy;
                outColor = vec4(vel + force * dt, 0.0, 1.0);
            }
        `;

        const pressureShader = `#version 300 es
            precision mediump float;
            precision mediump sampler2D;
            in vec2 vUv;
            in vec2 vL;
            in vec2 vR;
            in vec2 vT;
            in vec2 vB;
            out float outColor;
            uniform sampler2D uPressure;
            uniform sampler2D uDivergence;

            void main () {
                float L = texture(uPressure, vL).x;
                float R = texture(uPressure, vR).x;
                float T = texture(uPressure, vT).x;
                float B = texture(uPressure, vB).x;
                float C = texture(uPressure, vUv).x;
                float divergence = texture(uDivergence, vUv).x;
                float pressure = (L + R + B + T - divergence) * 0.25;
                outColor = pressure;
            }
        `;

        const gradientSubtractShader = `#version 300 es
            precision mediump float;
            precision mediump sampler2D;
            in vec2 vUv;
            in vec2 vL;
            in vec2 vR;
            in vec2 vT;
            in vec2 vB;
            out vec4 outColor;
            uniform sampler2D uPressure;
            uniform sampler2D uVelocity;

            void main () {
                float L = texture(uPressure, vL).x;
                float R = texture(uPressure, vR).x;
                float T = texture(uPressure, vT).x;
                float B = texture(uPressure, vB).x;
                vec2 velocity = texture(uVelocity, vUv).xy;
                velocity.xy -= vec2(R - L, T - B);
                outColor = vec4(velocity, 0.0, 1.0);
            }
        `;

        this.programs = {
            copy: new GLProgram(this.gl, baseVertexShader, copyShader),
            splat: new GLProgram(this.gl, baseVertexShader, splatShader),
            advection: new GLProgram(this.gl, baseVertexShader, advectionShader),
            divergence: new GLProgram(this.gl, baseVertexShader, divergenceShader),
            curl: new GLProgram(this.gl, baseVertexShader, curlShader),
            vorticity: new GLProgram(this.gl, baseVertexShader, vorticityShader),
            pressure: new GLProgram(this.gl, baseVertexShader, pressureShader),
            gradientSubtract: new GLProgram(this.gl, baseVertexShader, gradientSubtractShader),
        };
    }

    initFramebuffers() {
        let simRes = this.getResolution(this.config.SIM_RESOLUTION);
        let dyeRes = this.getResolution(this.config.SIM_RESOLUTION);

        // Robust format selection
        let type, internalFormatRGBA, internalFormatRG, formatRGBA, formatRG;

        if (this.ext) {
            // High quality float textures
            type = this.gl.HALF_FLOAT;
            internalFormatRGBA = this.gl.RGBA16F;
            internalFormatRG = this.gl.RG16F;
            formatRGBA = this.gl.RGBA;
            formatRG = this.gl.RG;
        } else {
            // Fallback to 8-bit
            console.warn("Float textures not supported, falling back to 8-bit");
            type = this.gl.UNSIGNED_BYTE;
            internalFormatRGBA = this.gl.RGBA8;
            internalFormatRG = this.gl.RG8;
            formatRGBA = this.gl.RGBA;
            formatRG = this.gl.RG;
        }

        const createDoubleFBO = (w, h, internalFormat, format, type, param) => {
            let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
            let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);
            return {
                read: fbo1,
                write: fbo2,
                swap: function () {
                    let temp = this.read;
                    this.read = this.write;
                    this.write = temp;
                }
            };
        };

        const filtering = this.linear ? this.gl.LINEAR : this.gl.NEAREST;

        this.velocity = createDoubleFBO(simRes.width, simRes.height, internalFormatRG, formatRG, type, filtering);
        this.density = createDoubleFBO(dyeRes.width, dyeRes.height, internalFormatRGBA, formatRGBA, type, filtering);
        this.divergence = this.createFBO(simRes.width, simRes.height, internalFormatRG, formatRG, type, this.gl.NEAREST);
        this.curl = this.createFBO(simRes.width, simRes.height, internalFormatRG, formatRG, type, this.gl.NEAREST);
        this.pressure = createDoubleFBO(simRes.width, simRes.height, internalFormatRG, formatRG, type, this.gl.NEAREST);
    }

    createFBO(w, h, internalFormat, format, type, param) {
        this.gl.activeTexture(this.gl.TEXTURE0);
        let texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, param);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, param);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

        let fbo = this.gl.createFramebuffer();
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);
        this.gl.viewport(0, 0, w, h);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        return {
            texture,
            fbo,
            width: w,
            height: h,
            attach: (id) => {
                this.gl.activeTexture(this.gl.TEXTURE0 + id);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                return id;
            }
        };
    }

    getResolution(resolution) {
        let aspectRatio = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
        if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

        let min = Math.round(resolution);
        let max = Math.round(resolution * aspectRatio);

        if (this.gl.drawingBufferWidth > this.gl.drawingBufferHeight)
            return { width: max, height: min };
        else
            return { width: min, height: max };
    }

    update() {
        const dt = 0.016; // Fixed time step approx

        // 0. Process Mouse Pointers
        this.pointers.forEach(p => {
            this.applySplat(p.x, p.y, p.dx, p.dy, p.color);
        });
        this.pointers = [];

        // 1. Audio Input to Splats
        const freqData = this.audioController.getFrequencyData();
        // Analyze bass (approx 20-100Hz)
        let bassSum = 0;
        let bassCount = 0;
        for (let i = 1; i < 10; i++) {
            bassSum += freqData[i];
            bassCount++;
        }
        const bassLevel = (bassSum / bassCount) / 255.0;

        // Analyze low-mids for secondary color
        let midSum = 0;
        for (let i = 10; i < 40; i++) {
            midSum += freqData[i];
        }
        const midLevel = (midSum / 30) / 255.0;

        if (bassLevel > 0.4) {
            // Random position for bass hits, or center? Let's do somewhat random around center
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 0.2;
            const x = 0.5 + Math.cos(angle) * radius;
            const y = 0.5 + Math.sin(angle) * radius;

            // Pick a random color from the palette
            const colorHex = this.config.COLORS[Math.floor(Math.random() * this.config.COLORS.length)];
            const baseColor = this.hexToRgb(colorHex);

            // Modulate intensity based on bass level
            const intensity = bassLevel * 10.0;

            this.splatStack.push({
                x: x,
                y: y,
                dx: (Math.random() - 0.5) * 1000 * bassLevel, // Explosive velocity
                dy: (Math.random() - 0.5) * 1000 * bassLevel,
                color: {
                    r: baseColor.r * intensity,
                    g: baseColor.g * intensity,
                    b: baseColor.b * intensity
                }
            });
        }

        // 2. Process Splats
        for (let i = 0; i < this.splatStack.length; i++) {
            const splat = this.splatStack[i];
            this.applySplat(splat.x, splat.y, splat.dx, splat.dy, splat.color);
        }
        this.splatStack = [];

        // 3. Fluid Simulation Steps

        // Curl
        this.programs.curl.bind();
        this.gl.uniform2f(this.programs.curl.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.curl.uniforms.uVelocity, this.velocity.read.attach(0));
        this.blit(this.curl);

        // Vorticity
        this.programs.vorticity.bind();
        this.gl.uniform2f(this.programs.vorticity.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.vorticity.uniforms.uVelocity, this.velocity.read.attach(0));
        this.gl.uniform1i(this.programs.vorticity.uniforms.uCurl, this.curl.attach(1));
        this.gl.uniform1f(this.programs.vorticity.uniforms.curl, this.config.CURL);
        this.gl.uniform1f(this.programs.vorticity.uniforms.dt, dt);
        this.blit(this.velocity.write);
        this.velocity.swap();

        // Divergence
        this.programs.divergence.bind();
        this.gl.uniform2f(this.programs.divergence.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.divergence.uniforms.uVelocity, this.velocity.read.attach(0));
        this.blit(this.divergence);

        // Clear Pressure
        this.programs.copy.bind();
        this.gl.uniform1i(this.programs.copy.uniforms.uTexture, this.pressure.read.attach(0));
        this.blit(this.pressure.write);
        this.pressure.swap();

        // Pressure (Jacobi)
        this.programs.pressure.bind();
        this.gl.uniform2f(this.programs.pressure.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.pressure.uniforms.uDivergence, this.divergence.attach(0));
        for (let i = 0; i < this.config.PRESSURE_ITERATIONS; i++) {
            this.gl.uniform1i(this.programs.pressure.uniforms.uPressure, this.pressure.read.attach(1));
            this.blit(this.pressure.write);
            this.pressure.swap();
        }

        // Gradient Subtract
        this.programs.gradientSubtract.bind();
        this.gl.uniform2f(this.programs.gradientSubtract.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.gradientSubtract.uniforms.uPressure, this.pressure.read.attach(0));
        this.gl.uniform1i(this.programs.gradientSubtract.uniforms.uVelocity, this.velocity.read.attach(1));
        this.blit(this.velocity.write);
        this.velocity.swap();

        // Advection (Velocity)
        this.programs.advection.bind();
        this.gl.uniform2f(this.programs.advection.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform2f(this.programs.advection.uniforms.dyeTexelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform1i(this.programs.advection.uniforms.uVelocity, this.velocity.read.attach(0));
        this.gl.uniform1i(this.programs.advection.uniforms.uSource, this.velocity.read.attach(0));
        this.gl.uniform1f(this.programs.advection.uniforms.dt, dt);
        this.gl.uniform1f(this.programs.advection.uniforms.dissipation, this.config.VELOCITY_DISSIPATION);
        this.blit(this.velocity.write);
        this.velocity.swap();

        // Advection (Density)
        this.programs.advection.bind();
        this.gl.uniform2f(this.programs.advection.uniforms.texelSize, 1.0 / this.velocity.read.width, 1.0 / this.velocity.read.height);
        this.gl.uniform2f(this.programs.advection.uniforms.dyeTexelSize, 1.0 / this.density.read.width, 1.0 / this.density.read.height);
        this.gl.uniform1i(this.programs.advection.uniforms.uVelocity, this.velocity.read.attach(0));
        this.gl.uniform1i(this.programs.advection.uniforms.uSource, this.density.read.attach(1));
        this.gl.uniform1f(this.programs.advection.uniforms.dt, dt);
        this.gl.uniform1f(this.programs.advection.uniforms.dissipation, this.config.DENSITY_DISSIPATION);
        this.blit(this.density.write);
        this.density.swap();
    }

    render() {
        this.gl.bindVertexArray(this.vao);
        this.programs.copy.bind();
        this.gl.uniform1i(this.programs.copy.uniforms.uTexture, this.density.read.attach(0));
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null); // Screen
        this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    applySplat(x, y, dx, dy, color) {
        this.programs.splat.bind();
        this.gl.uniform1i(this.programs.splat.uniforms.uTarget, this.velocity.read.attach(0));
        this.gl.uniform1f(this.programs.splat.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
        this.gl.uniform2f(this.programs.splat.uniforms.point, x, y);
        this.gl.uniform3f(this.programs.splat.uniforms.color, dx, dy, 0.0);
        this.gl.uniform1f(this.programs.splat.uniforms.radius, this.config.SPLAT_RADIUS);
        this.blit(this.velocity.write);
        this.velocity.swap();

        this.programs.splat.bind();
        this.gl.uniform1i(this.programs.splat.uniforms.uTarget, this.density.read.attach(0));
        this.gl.uniform1f(this.programs.splat.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
        this.gl.uniform2f(this.programs.splat.uniforms.point, x, y);
        this.gl.uniform3f(this.programs.splat.uniforms.color, color.r, color.g, color.b);
        this.gl.uniform1f(this.programs.splat.uniforms.radius, this.config.SPLAT_RADIUS);
        this.blit(this.density.write);
        this.density.swap();
    }

    blit(target) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.fbo);
        this.gl.viewport(0, 0, target.width, target.height);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 1, b: 1 };
    }

    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}

class GLProgram {
    constructor(gl, vertexSource, fragmentSource) {
        this.gl = gl;
        this.uniforms = {};
        this.program = gl.createProgram();

        const vs = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fs = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(this.program));
        }

        const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
        }
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    bind() {
        this.gl.useProgram(this.program);
    }
}
