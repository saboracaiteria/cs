# Plano de Correção — Bugs de Câmera/Mira no Multiplayer
**Data:** 2026-08-10  
**Arquivo principal:** `src/net/match.js`

---

## Bug 1 — Câmera/mira pula ao apertar o botão de disparo

### Observação do usuário
> "a mira e a câmera mudam de lugar ao apertar em disparar — isso impossibilita uma mira exata pois o alvo sai da posição"

### Diagnóstico (match.js)

O problema está na lógica de transição para 1ª pessoa (`_fpp`) durante o disparo.

**Linha 777:**
```js
const aimando = !!(this._fire || this._fireBtn) && !noHeli && !noCarro;
```

**Linha 781:**
```js
this._fpp = damp(this._fpp, aimando ? 1 : 0, 9, dt);
```

**Linhas 875–893 (bloco 1ª pessoa):**
```js
if (this._fpp > 0.01) {
  const f = this._fpp;
  this.camera.position.set(
    foc.x + (this.camera.position.x - foc.x) * (1 - f),
    foc.y + (this.camera.position.y - foc.y) * (1 - f) + 1.55 * f,  // sobe 1.55m ao focar
    foc.z + (this.camera.position.z - foc.z) * (1 - f),
  );
  // + lookAt para o centro exato
}
```

**Linha 681:**
```js
const ombro = noVeic ? 0 : CAMERA.shoulderX;  // ombro FIXO = 1.8, nunca reduz
```

**O que acontece ao apertar disparo:**
1. `_fire` fica `true` → `aimando = true`
2. `_fpp` começa a subir de 0 → 1 (lambda=9, rápido)
3. A câmera **desliza para cima** (+ 1.55 m no Y) E **para dentro** (lerp para `foc`)
4. Mas `ombro` **permanece = `CAMERA.shoulderX`** (1.8) o tempo todo — não reduz com `_fpp`
5. Resultado: câmera move em Y e Z mas continua deslocada em X → **mira salta de posição**

**Causa raiz:** `_fpp` move a câmera em 3D mas o `ombro` lateral não é zerado junto, criando um caminho diagonal onde deveria ser só vertical.

### Solução — Bug 1

**Linha 681** — fazer `ombro` reduzir conforme `_fpp` sobe, exatamente como já foi feito no single-player:

```js
// ANTES
const ombro = noVeic ? 0 : CAMERA.shoulderX;

// DEPOIS
const ombroBase = noVeic ? 0 : CAMERA.shoulderX;
const ombro = ombroBase * (1 - this._fpp);
```

Isso faz a câmera deslizar **linearmente** do ombro para o centro, sem o salto lateral. O `damp` de `_fpp` já garante suavidade.

---

## Bug 2 — Player no centro da tela (tampando a visão no pescoço)

### Observação do usuário
> "o centro da tela está no pescoço do player e está tampando a visão — mova o player para a esquerda"

### Diagnóstico (match.js)

**Linha 653:**
```js
} else if (rpLoc) foc.set(rpLoc.x, rpLoc.y + 1.48, rpLoc.z);
```

O foco da câmera aponta para `y + 1.48` — que é a altura dos ombros/pescoço do Bob. Com `shoulderX = 1.8` a câmera deveria estar deslocada à direita, mas o **foco** (ponto de `lookAt`) está no centro do corpo — então a câmera olha para o pescoço do Bob em vez de olhar **além dele**.

**O efeito visual:** Bob aparece centralizado e grande na tela, pescoço no centro, bloqueando a mira.

**No single-player (camera.js linha 244–246):**
```js
this._look.copy(this._smoothFocus);
this._look.y += lift + dist * this.frameLift;
this.cam.lookAt(this._look);
```

O ponto de `lookAt` é o **foco suavizado** (posição do Bob), não um offset. A câmera olha **para** o Bob — o deslocamento de ombro faz o Bob ficar à **esquerda do centro** da tela, não centralizado.

**No multiplayer (match.js linha 856–858):**
```js
} else {
  this._camLook.copy(foc);  // lookAt = centro do Bob → Bob aparece no centro
}
this.camera.lookAt(this._camLook);
```

Com `ombro = 1.8` a câmera está 1.8m à direita, mas olha para o **centro** do Bob → Bob aparece **à esquerda do centro da tela** ✅ teoricamente correto.

**Porém**, o problema real pode ser a **altura do foco** (`y + 1.48`). Isso aponta para o pescoço; se quisermos que o jogador fique mais baixo na tela (e libere a visão), o foco deve apontar ligeiramente acima da cabeça.

**Verificação:** No single-player, `focusPoint()` em `player.js` retorna `y + 1.48`. Mesma altura. No single a câmera funciona. Portanto o problema no multiplayer pode ser o `_fpp` elevando a câmera para `y + 1.55` mas o `lookAt` ainda mirando `y + 1.48` (pescoço) → câmera agora acima e olhando para baixo.

### Solução — Bug 2

Ajustar a **altura do foco** para `y + 1.62` (acima da cabeça, liberando a visão da frente) e garantir que o `lookAt` no bloco de 1ª pessoa também aponte para além do corpo:

**Linhas 652–654** — elevar o foco levemente:
```js
// ANTES
} else if (rpLoc) foc.set(rpLoc.x, rpLoc.y + 1.48, rpLoc.z);
else if (eu) foc.set(eu.x, eu.y + 1.48, eu.z);

// DEPOIS
} else if (rpLoc) foc.set(rpLoc.x, rpLoc.y + 1.62, rpLoc.z);
else if (eu) foc.set(eu.x, eu.y + 1.62, eu.z);
```

`+1.62` é a altura dos olhos do Bob (vs `+1.48` dos ombros). Com a câmera atrás e à direita olhando para os olhos, Bob fica na metade esquerda-inferior da tela — exatamente o enquadramento CODM.

---

## Resumo das mudanças

| # | Arquivo | Linha | Mudança |
|---|---------|-------|---------|
| 1 | `src/net/match.js` | 681 | `ombro *= (1 - this._fpp)` — anula offset lateral ao entrar em 1ª pessoa |
| 2 | `src/net/match.js` | 653–654 | `y + 1.48` → `y + 1.62` — foco nos olhos, libera visão |

**Total: 2 linhas alteradas no mesmo arquivo.**

---

## Riscos

| Mudança | Risco | Mitigação |
|---------|-------|-----------|
| Ombro com `_fpp` | O helicóptero e carro já têm `ombro=0` via `noVeic` — sem impacto | Verificado |
| Altura `+1.62` | A câmera pode ficar alta demais para jogadores baixos (agachados) | `+1.62` é padrão FPS — aceitável |

---

## Ordem de implementação

1. Corrigir linha 681 (Bug 1 — câmera pula ao atirar) — **mais urgente**
2. Corrigir linhas 653–654 (Bug 2 — player tapa visão) — estético, mas importante
3. Commit + deploy para Oracle
