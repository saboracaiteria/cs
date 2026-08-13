const fs = require('fs');
let s = fs.readFileSync('src/gfx/renderer.js', 'utf8');

// 1) CONSTRUTOR
const a1 = `      stencil: false,
    });
    this.preset = PRESETS[DEFAULT_PRESET];`;
const r1 = `      stencil: false,
    });

    // [MOBILE-FIX] three.js r152+ cria EffectComposer/Bloom/SMAA com HalfFloatType
    // SEM fallback: em drivers sem render-to-half-float (WebGL1/WebView antigo,
    // ex.: Samsung Internet) o framebuffer corrompe -> tela VERDE piscando ao
    // iniciar a partida. Detectamos e degradamos para 8 bits.
    this._halfFloatOk = this._detectHalfFloat();

    this.preset = PRESETS[DEFAULT_PRESET];`;
if (!s.includes(a1)) { console.log('FALHOU a1'); process.exit(1); }
s = s.split(a1).join(r1);

// 2) METODO _detectHalfFloat
const a2 = `  _pixelRatioFor(preset) {`;
const r2 = `  /** true se o driver consegue renderizar em HalfFloatType (bloom/SMAA/composer). */
  _detectHalfFloat() {
    try {
      const gl = this.renderer.getContext();
      if (!gl || typeof gl.getExtension !== 'function') return false;
      if (this.renderer.capabilities && this.renderer.capabilities.isWebGL2) {
        return !!gl.getExtension('EXT_color_buffer_float');
      }
      return !!(gl.getExtension('OES_texture_half_float') &&
        (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('WEBGL_color_buffer_float')));
    } catch (e) {
      return false;
    }
  }

  _pixelRatioFor(preset) {`;
if (!s.includes(a2)) { console.log('FALHOU a2'); process.exit(1); }
s = s.split(a2).join(r2);

// 3) buildComposer: composer 8 bits sem half-float
const a3 = `    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this._pixelRatioFor(this.preset));
    composer.setSize(w, h);`;
const r3 = `    const pr = this._pixelRatioFor(this.preset);
    let composer;
    if (this._halfFloatOk) {
      composer = new EffectComposer(this.renderer);
    } else {
      // [MOBILE-FIX] sem render-to-half-float: composer em UnsignedByteType
      // (o default HalfFloatType do r152+ corrompe e fica verde)
      const rt = new THREE.WebGLRenderTarget(
        Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr)),
        { type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false },
      );
      composer = new EffectComposer(this.renderer, rt);
      console.warn('[gfx] driver sem half-float render target — bloom/SMAA desligados (fallback 8 bits)');
    }
    composer.setPixelRatio(pr);
    composer.setSize(w, h);`;
if (!s.includes(a3)) { console.log('FALHOU a3'); process.exit(1); }
s = s.split(a3).join(r3);

// 4) bloom: so com half-float
const a4 = `    if (this.preset.bloom) {`;
const r4 = `    if (this.preset.bloom && this._halfFloatOk) {`;
if (s.includes(r4)) { console.log('a4 ja aplicado'); } else if (!s.includes(a4)) { console.log('FALHOU a4'); process.exit(1); } else { s = s.split(a4).join(r4); }

// 5) bloom dimensoes pares
const a5 = `      const bs = this.preset.bloomScale ?? 0.5;
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.max(64, w * bs), Math.max(64, h * bs)),
        QUALITY.bloomStrength, QUALITY.bloomRadius, QUALITY.bloomThreshold,
      );`;
const r5 = `      const bs = this.preset.bloomScale ?? 0.5;
      // [MOBILE-FIX] dimensoes PARES: o bloom divide por 2 (5 mips) e dimensao
      // impar em half-float corrompe o framebuffer em alguns Adreno
      const bw = Math.max(64, Math.round((w * bs) / 2) * 2);
      const bh = Math.max(64, Math.round((h * bs) / 2) * 2);
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(bw, bh),
        QUALITY.bloomStrength, QUALITY.bloomRadius, QUALITY.bloomThreshold,
      );`;
if (!s.includes(a5)) { console.log('FALHOU a5'); process.exit(1); }
s = s.split(a5).join(r5);

// 6) SMAA: so com half-float
const a6 = `    if (this.preset.smaa) composer.addPass(new SMAAPass(w, h));`;
const r6 = `    if (this.preset.smaa && this._halfFloatOk) composer.addPass(new SMAAPass(w, h));`;
if (!s.includes(a6)) { console.log('FALHOU a6'); process.exit(1); }
s = s.split(a6).join(r6);

fs.writeFileSync('src/gfx/renderer.js', s);
console.log('renderer.js patcheado com sucesso');
