# 🎯 ADS Real estilo COD Mobile — Documentação Técnica

> Sistema de mira (Aim Down Sights) em 1ª pessoa de verdade, com transição TPP → FPP,
> target point anchoring (o alvo não pula), corpo/retícula ocultos e mira pela geometria da arma.

**Commits:** `c97946e` (estabilidade da mira) → `5599be2` (ADS 1ª pessoa real)

---

## 1. O que foi resolvido (histórico do problema)

### Problema 1 — "A mira pula ao atirar" (vídeo 00:03 / 00:06)
O dolly antigo (`adsDolly: 0.5`) aproximava a câmera de 3,6 m → 1,8 m **mantendo o ombro
lateral de 1,8 m fixo**. Isso muda o ângulo câmera→foco (26° → 45°) e gera **paralaxe lateral**:
o centro da tela não muda, mas a cena periférica "gira" — o personagem e objetos próximos
deslocam visivelmente, parecendo que o alvo fugiu para baixo/direita.

**Correção (`c97946e`):**
- `adsDolly: 0` — a câmera **não se move mais** por dolly; o zoom de mira é 100% FOV (62° → 45°).
- **Hard-lock do retículo** no CSS: `#crosshair { left:50%; top:50%; transform:translate(-50%,-50%) }`,
  sem `transition` de `left/top`, sem a regra `.recoil{scale(1.28)}`.
- Removida a chamada `camera.addRecoil()` do tiro a pé (coice de câmera zerado).

### Problema 2 — "Continua em 3ª pessoa atrás do boneco" (comparação com o CoD)
O jogo apenas aproximava o ombro e trocava a cor da retícula 2D — não era 1ª pessoa.

**Correção (`5599be2`):** transição **TPP → FPP real** com **target point anchoring** (abaixo).

---

## 2. Arquitetura da solução final

### 2.1 `src/config.js` — parâmetros novos/alterados

```js
adsFov: 45,                // FOV do ADS (zoom óptico) — 62° → 45°
adsSpeed: 9,               // damp da transição (~200 ms)
adsEyeHeight: 0.22,        // [CODM-FPP] olhos: focus(1.48 m) + 0.22 = 1.70 m
adsEyeForward: 0.18,       // [CODM-FPP] câmera um pouco à frente do centro do corpo (olhos)
adsDolly: 0,               // [CODM-FPP] desativado — a translação virou o blend 1ª pessoa
```

### 2.2 `src/camera.js` — o coração do sistema

**Estado (constructor):**
```js
this._anchor = new THREE.Vector3();  // ponto 3D mirado (NUNCA usar null como flag de Vector3)
this._anchorAtivo = false;           // flag booleana separada
this._anchorYaw = 0;
this._anchorPitch = 0;
```

**Bloco no `update` (modo foot), substituindo o `lookAt` simples:**

```js
const adsAmt = this.ads;
if (adsAmt > 0.001) {
  if (!this._anchorAtivo) {
    // 1) ANCORA o ponto mirado ANTES do zoom: raycast do centro da tela
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    this.aimRay(o, d, 0, 0);
    const h = this.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 2000);
    if (h) this._anchor.copy(o).addScaledVector(d, h.t);
    else   this._anchor.copy(o).addScaledVector(d, 2000);
    this._anchorAtivo = true;
    this._anchorYaw = this.yaw;
    this._anchorPitch = this.pitch;
  } else {
    // solta a ancora se o jogador girar > 0.06 rad (~3.4°) — a mira volta a seguir o olhar
    const dy = Math.abs(this.yaw - this._anchorYaw);
    const dp = Math.abs(this.pitch - this._anchorPitch);
    if (dy + dp > 0.06) this._anchorAtivo = false;
  }
  // 2) POSIÇÃO: desliza do ombro (TPP) para os OLHOS (FPP)
  const olhos = new THREE.Vector3(
    this._smoothFocus.x + dir.x * CAMERA.adsEyeForward,
    this._smoothFocus.y + CAMERA.adsEyeHeight,
    this._smoothFocus.z + dir.z * CAMERA.adsEyeForward,
  );
  this.cam.position.lerpVectors(this.cam.position, olhos, adsAmt);
} else {
  this._anchorAtivo = false;
}

// 3) DIREÇÃO: travado no alvo ancorado (a mira NÃO pula) ou no olhar do jogador
if (this._anchorAtivo) {
  this.cam.lookAt(this._anchor);
} else {
  this._look.copy(this.cam.position).addScaledVector(dir, 40);
  this._look.y += lift + dist * this.frameLift;
  this.cam.lookAt(this._look);
}
```

**A matemática do anchoring:**
```
W   = P_TPP + dir * t        (raycast do centro ANTES do zoom — o alvo real)
P(t) = lerp(P_TPP, P_FPP, ads)   (posição desliza do ombro para os olhos)
direção = lookAt(W)              (a câmera ROTACIONA para manter W no centro)
tiro    = aimRay(0, 0)           (unproject NDC 0,0,0.5) → passa por W → acerta o alvo
```
Assim, qualquer que seja a posição da câmera durante a transição, o ponto 3D mirado
**permanece no centro da tela** — o alvo nunca sai da mira.

### 2.3 `src/ent/viewmodel.js` — a arma 3D (iron sight)

```js
const POS_ADS = new THREE.Vector3(0, -0.08, -0.45);   // alça de mira no CENTRO da tela
```
- Antes: `(0.22, -0.12, -0.44)` — arma deslocada para a direita.
- Agora: cano/alça centralizados no centro da tela (1ª pessoa de verdade).
- `setTransicao(t)` — a arma entra de baixo conforme a câmera chega aos olhos.

### 2.4 `src/game.js` — solo (a pé)

```js
// a retícula 2D some quando a câmera chega perto dos olhos (a mira vira a arma)
this.hud.setCrosshairVisible(this.camera.ads < 0.6);

// o corpo do jogador some na 1ª pessoa
this.player.human.root.visible = this.camera.ads < 0.45;

// o viewmodel (arma 3D) assume
if (this.viewmodel) {
  this.viewmodel.visible = this.camera.ads > 0.6;
  if (this.viewmodel.visible) {
    this.viewmodel.setAds(true);
    this.viewmodel.setTransicao(this.camera.ads);
  }
}
```

### 2.5 `src/net/match.js` — multiplayer (mesmo fluxo)

> ⚠️ **LIÇÃO**: o bloco de câmera do MP **replica manualmente** o `camera.update` do solo
> (o `GameCamera` não roda no MP) — toda mudança de câmera precisa ser replicada nos dois lugares.

```js
// constructor
this._anchorFpp = new THREE.Vector3();
this._anchorFppAtivo = false;
this._anchorFppYaw = 0;
this._anchorFppPitch = 0;

// corpo local some na 1ª pessoa
if (rp.local)
  rp.human.root.visible = rp.vivo && !this._emCarro && !this._emHeli && this._fpp < 0.45;

// viewmodel assume no FPP
vm.visible = this._fpp > 0.6;
if (vm.visible) { vm.setAds(true); vm.setTransicao(fpp); vm.update(dt, ...); }

// retícula 2D some
this.game.hud.setCrosshairVisible(fpp < 0.6);

// bloco de câmera: mesma âncora + lerp para os olhos (foc + adsEye) + lookAt(W)
```

### 2.6 `css/style.css` — retículo hard-locked

```css
#crosshair{
  position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%);
  /* sem transition de left/top; sem scale .recoil — o retículo NUNCA desloca */
}
#crosshair.center{left:50%; top:50%}        /* redundante, garantia */
#crosshair.ads .ch-dot{fill:#ffd778}         /* só muda a COR (feedback dourado) */
```
- Nenhum JS altera `left`/`top`/`transform` do retículo (só `opacity` e `classList`).

### 2.7 `deploy/teste-mira.mjs` — verificação automatizada (5/5)

```js
// colisão simulada: um prédio/árvore a 25 m na direção da mira
const col = {
  raycast: (x, y, z, dx, dy, dz, dist) => {
    if (dz < -0.1 && dy > -0.6 && dy < 0.6) return { t: 25 };
    return null;
  },
  groundHeightAt: () => 0,
};
```
- **Bloco [1] — métrica NDC**: o ponto mirado em TPP é projetado na câmera ADS;
  o desvio do centro deve ser `pulo < 0.03` (resultado real: **0.0000** nas 3 direções).
- Demais blocos: campo de tiro (com/sem ADS ≤ 6 px), disparo reto, recoil 0,0 cm, impacto no alvo 3D.

---

## 3. Fluxo visual ao segurar ATIRAR (celular)

1. **Toca ATIRAR** → 1 tiro sai do centro (`aimRay 0,0`).
2. **Segura** → ADS inicia (~200 ms):
   - a câmera desliza do **ombro** para os **olhos** (1,48 m → 1,70 m);
   - o FOV fecha **62° → 45°** (zoom óptico);
   - o **ponto mirado fica travado no centro** (anchoring — a mira não pula);
   - o **corpo some** (ads > 0,45) e a **retícula 2D some** (ads > 0,6);
   - a **arma 3D** (viewmodel) entra de baixo com a **alça de mira no centro**.
3. **Atira no FPP** → o projétil sai do centro da tela → acerta exatamente onde a alça aponta.
4. **Gira > 3,4°** → a trava solta e a mira passa a seguir o olhar normalmente.

---

## 4. Como validar

```bash
# teste automatizado de mira (5/5)
node deploy/teste-mira.mjs

# integridade após deploy (local = duck = pages)
for f in src/camera.js src/config.js src/ent/viewmodel.js src/game.js src/net/match.js; do
  a=$(md5sum "$f" | cut -d' ' -f1)
  b=$(curl -sk "https://tiroteio.duckdns.org/$f" | md5sum | cut -d' ' -f1)
  c=$(curl -sk "https://saboracaiteria.github.io/cs/$f" | md5sum | cut -d' ' -f1)
  [ "$a" = "$b" ] && [ "$b" = "$c" ] && echo "OK  $f" || echo "DIVERGENTE  $f"
done
```

Manual: abrir o jogo, mirar num ponto fixo (prédio/árvore), segurar ATIRAR —
o ponto permanece no centro da tela enquanto a câmera entra na 1ª pessoa;
a retícula e o corpo somem e a alça da arma assume o centro.
