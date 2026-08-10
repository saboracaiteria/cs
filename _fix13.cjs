const fs = require('fs');
let falhas = 0;
function edita(arquivo, pares) {
  let s = fs.readFileSync(arquivo, 'utf8');
  for (const [de, para] of pares) {
    const i = s.indexOf(de);
    if (i === -1) { console.log('FALHOU em ' + arquivo + ': ' + de.slice(0, 70).replace(/\n/g, '\\n')); falhas++; continue; }
    s = s.slice(0, i) + para + s.slice(i + de.length);
  }
  fs.writeFileSync(arquivo, s);
  console.log('OK: ' + arquivo + ' (' + pares.length + ' replaces)');
}

// ============ FASE 1 + 2: MATCH.JS ============
edita('src/net/match.js', [
  // construtor: estado novo
  [
    "    this._heliYaw = 0;           // Q/R: girar o aparelho no ar\n",
    "    this._heliYaw = 0;           // Q/R: girar o aparelho no ar\n    this._carSteer = 0;          // [carro] ◀ ▶ do toque: esterça o carro (moveX)\n    this._fpp = 0;               // [CODM] transição ombro -> 1ª pessoa ao atirar\n    this._fppAdsAntes = null;    // [CODM] último estado do retículo 1ª pessoa\n"
  ],
  // ligaBtn giros: também esterçam o carro
  [
    "    ligaBtn('mp-girar-esq', () => { this._heliYaw = 1; }, () => { this._heliYaw = 0; });\n    ligaBtn('mp-girar-dir', () => { this._heliYaw = -1; }, () => { this._heliYaw = 0; });\n",
    "    ligaBtn('mp-girar-esq', () => { this._heliYaw = 1; this._carSteer = -1; }, () => { this._heliYaw = 0; this._carSteer = 0; });\n    ligaBtn('mp-girar-dir', () => { this._heliYaw = -1; this._carSteer = 1; }, () => { this._heliYaw = 0; this._carSteer = 0; });\n"
  ],
  // teclas q/r
  [
    "      if (k === 'q') this._heliYaw = 1;\n      if (k === 'r') this._heliYaw = -1;\n",
    "      if (k === 'q') { this._heliYaw = 1; this._carSteer = -1; }\n      if (k === 'r') { this._heliYaw = -1; this._carSteer = 1; }\n"
  ],
  [
    "      if (k === 'q') this._heliYaw = 0;\n      if (k === 'r') this._heliYaw = 0;\n",
    "      if (k === 'q' || k === 'r') { this._heliYaw = 0; this._carSteer = 0; }\n"
  ],
  // corpo local: some em 1ª pessoa
  [
    "      if (rp.local) rp.human.root.visible = rp.vivo && !this._emCarro && !this._emHeli;\n",
    "      if (rp.local) rp.human.root.visible = rp.vivo && !this._emCarro && !this._emHeli && !(this._fpp > 0.5);\n"
  ],
  // mira central em 1ª pessoa (CODM)
  [
    "    this._vNdc.set(0.24, 0.2, 0.5).unproject(this.camera);\n",
    "    // [CODM] em 1ª pessoa a mira vai para o CENTRO da tela (igual COD Mobile)\n    if (this._fpp > 0.5) this._vNdc.set(0, 0, 0.5);\n    else this._vNdc.set(0.24, 0.2, 0.5);\n    this._vNdc.unproject(this.camera);\n"
  ],
  // envio moveX: esterça no carro
  [
    "        moveX: this.inp.mx,\n        moveZ: this.inp.mz,\n        run: this.inp.run,\n        jump: this.inp.jump,\n        fire: !!(this._fire || this._dragOn || this._fireBtn),\n",
    "        moveX: this._emCarro ? clamp(this.inp.mx + this._carSteer, -1, 1) : this.inp.mx,\n        moveZ: this.inp.mz,\n        run: this.inp.run,\n        jump: this.inp.jump,\n        fire: !!(this._fire || this._dragOn || this._fireBtn),\n"
  ],
  // coice do viewmodel no disparo
  [
    "        this.game.bullets?.fire(oT, this._vT2.set(dxT, dyT, dzT));\n        if (this.game && this.game.audio) this.game.audio.tiro();\n",
    "        this.game.bullets?.fire(oT, this._vT2.set(dxT, dyT, dzT));\n        if (this.game && this.game.audio) this.game.audio.tiro();\n        if (this.game && this.game.viewmodel) this.game.viewmodel.darCoice();\n"
  ],
  // estado FPP + viewmodel (após _adsAmt)
  [
    "    this._adsAmt = damp(this._adsAmt, aimando ? 1 : 0, CAMERA.adsSpeed, dt);\n",
    "    this._adsAmt = damp(this._adsAmt, aimando ? 1 : 0, CAMERA.adsSpeed, dt);\n\n    // [CODM] ao atirar a pé: câmera desliza para 1ª pessoa (braço + arma na tela)\n    this._fpp = damp(this._fpp, aimando ? 1 : 0, 9, dt);\n    const fpp = this._fpp;\n    if (this.game && this.game.viewmodel) {\n      const vm = this.game.viewmodel;\n      vm.visible = fpp > 0.02;\n      if (vm.visible) {\n        vm.setAds(fpp > 0.5);\n        vm.update(dt, this.inp && this.inp.run ? 6 : 0);\n      }\n    }\n    if (this.game && this.game.hud) {\n      const fppAds = fpp > 0.5;\n      if (fppAds !== this._fppAdsAntes) {\n        this._fppAdsAntes = fppAds;\n        this.game.hud.setAds(fppAds);\n        this.game.hud.setCrosshairCenter(fppAds);\n      }\n    }\n"
  ],
  // câmera em 1ª pessoa (após o cockpit, antes do shake)
  [
    "      this.camera.lookAt(this._camLook);\n    }\n\n    if (this._shake > 0.001) {\n",
    "      this.camera.lookAt(this._camLook);\n    }\n\n    // [CODM] em 1ª pessoa: câmera na CABEÇA olhando na direção da mira\n    if (this._fpp > 0.01) {\n      const f = this._fpp;\n      this.camera.position.set(\n        foc.x + (this.camera.position.x - foc.x) * (1 - f),\n        foc.y + (this.camera.position.y - foc.y) * (1 - f) + 1.55 * f,\n        foc.z + (this.camera.position.z - foc.z) * (1 - f),\n      );\n      const cpf = Math.cos(pitchE);\n      const ax = foc.x + Math.sin(yawE) * cpf * 10;\n      const ay = foc.y + Math.sin(pitchE) * 10;\n      const az = foc.z + Math.cos(yawE) * cpf * 10;\n      this._camLook.set(\n        this._camLook.x + (ax - this._camLook.x) * f,\n        this._camLook.y + (ay - this._camLook.y) * f,\n        this._camLook.z + (az - this._camLook.z) * f,\n      );\n      this.camera.lookAt(this._camLook);\n    }\n\n    if (this._shake > 0.001) {\n"
  ],
  // giros visíveis também no carro
  [
    "    const giroEsqEl = document.getElementById('mp-girar-esq');\n    if (giroEsqEl) giroEsqEl.classList.toggle('hidden', !this._emHeli);\n    const giroDirEl = document.getElementById('mp-girar-dir');\n    if (giroDirEl) giroDirEl.classList.toggle('hidden', !this._emHeli);\n",
    "    const giroEsqEl = document.getElementById('mp-girar-esq');\n    if (giroEsqEl) giroEsqEl.classList.toggle('hidden', !this._emHeli && !this._emCarro);\n    const giroDirEl = document.getElementById('mp-girar-dir');\n    if (giroDirEl) giroDirEl.classList.toggle('hidden', !this._emHeli && !this._emCarro);\n"
  ],
]);

// ============ FASE 1: CSS (botões grandes como o ATIRAR) ============
edita('css/style.css', [
  [
    ".tc-girar-esq{right:198px; bottom:88px}\n.tc-girar-dir{right:254px; bottom:88px}\n",
    ".tc-girar-esq{right:16px; bottom:180px; width:94px; height:94px; font-size:13px}\n.tc-girar-dir{right:118px; bottom:180px; width:94px; height:94px; font-size:13px}\n"
  ],
]);

// ============ FASE 1: HTML (botões ◀▶ no HUD do SOLO) ============
edita('index.html', [
  [
    "    <button type=\"button\" class=\"tc-btn tc-sec tc-missil hidden\" id=\"tc-missil\" data-acao=\"missil\">🚀</button>\n",
    "    <button type=\"button\" class=\"tc-btn tc-sec tc-missil hidden\" id=\"tc-missil\" data-acao=\"missil\">🚀</button>\n    <button type=\"button\" class=\"tc-btn tc-sec tc-girar-esq hidden\" id=\"tc-girar-esq\" data-segura=\"girarEsq\" title=\"Girar esquerda\">◀</button>\n    <button type=\"button\" class=\"tc-btn tc-sec tc-girar-dir hidden\" id=\"tc-girar-dir\" data-segura=\"girarDir\" title=\"Girar direita\">▶</button>\n"
  ],
]);

// ============ FASE 1: touch.js (solo mostra os giros em veículo) ============
edita('src/ui/touch.js', [
  [
    "    this._mostrar('tc-visao', noVeiculo);          // [25] só há visão interna em veículo\n    this._mostrar('tc-missil', !!emFase);          // o teleguiado só existe em fase\n",
    "    this._mostrar('tc-visao', noVeiculo);          // [25] só há visão interna em veículo\n    this._mostrar('tc-missil', !!emFase);          // o teleguiado só existe em fase\n    this._mostrar('tc-girar-esq', noVeiculo);      // [carro] ◀ ▶ direcionam o veículo\n    this._mostrar('tc-girar-dir', noVeiculo);\n"
  ],
]);

// ============ FASE 1: game.js (solo vira o carro com ◀ ▶) ============
edita('src/game.js', [
  [
    "    let steer = -ax.strafe;                            // manual: D vira à direita\n",
    "    let steer = -ax.strafe + (this.toque.girarEsq - this.toque.girarDir);  // [carro] ◀ ▶ também viram\n"
  ],
]);

console.log(falhas === 0 ? '=== TUDO APLICADO SEM FALHAS ===' : '=== ' + falhas + ' REPLACES FALHARAM ===');
process.exit(falhas === 0 ? 0 : 1);
