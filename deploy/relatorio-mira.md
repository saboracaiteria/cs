# RELATÓRIO — CALIBRAÇÃO DA MIRA (3ª pessoa ↔ ADS)
**Data:** 10/08/2026 · **Arquivos:** `src/camera.js` (correção) · `deploy/teste-mira.mjs` (teste headless)

---

## 1. Sintoma relatado
> "Jogando em 3ª pessoa, ao apertar a mira (ADS) a mira **sobe para a direita**, tirando totalmente a mira do alvo."

## 2. Causa raiz (era a CÂMERA, não a arma)
O tiro no jogo sai do **centro da tela** (`camera.aimRay(0,0)` — o crosshair), e a arma (viewmodel) é só visual. O desvio era causado por **dois defeitos na câmera** no modo `foot` (`GameCamera.update`):

| # | Defeito | Linha | Efeito |
|---|---------|-------|--------|
| 1 | `ombro = ombroBase * (1 - ads)` | 224 | Ao mirar, a câmera **deslizava 1,8 m** do ombro para o centro → o raio do crosshair deslocava **paralelo** → a mira saía do alvo **lateralmente, em qualquer distância** |
| 2 | `_look.y += ... + ads * 1.5` | 254 | Ao mirar, o ponto de mira **subia 1,5 m** → a mira "subia" |
| 3 | `_look = smoothFocus + dir*10` | 253 | Em 3ª pessoa o centro da tela **não coincidia** com a linha de tiro (desvio ~7° do ombro) |

## 3. Correção aplicada (`src/camera.js`)
```js
// linha 224 — ombro FIXO no ADS: a câmera não desliza, a mira permanece no alvo
const ombro = ombroBase;

// linha 253 — centro da tela = linha de tiro (yaw/pitch do jogador)
this._look.copy(this._pos).addScaledVector(dir, 40);

// linha 254 — removido o ads*1.5: a mira não sobe no ADS
this._look.y += lift + dist * this.frameLift;
```
O ADS agora é um **zoom over-shoulder estável** (FOV 62→46/31 + arma erguida): a posição da câmera não muda, então o crosshair **nunca** desloca.

## 4. Teste headless (node + three.js real, `deploy/teste-mira.mjs`)
Alvo do campo de tiro a 25 m, Bob em (0, 1.48, 0), 3 direções + apontando para o alvo:

### ANTES da correção
| Direção | Pulo do crosshair ao mirar |
|---------|----------------------------|
| Frente (yaw 0, pitch -0.05) | **3,126 m** ❌ |
| Direita (yaw 0.60) | **3,126 m** ❌ |
| Acima (pitch +0.25) | **2,981 m** ❌ |

### DEPOIS da correção
| Direção | Pulo | Crosshair no alvo (dx/dy) |
|---------|------|---------------------------|
| Frente | **0,000 m** ✅ | dx 4px · dy 5px ✅ (≤1% da tela) |
| Direita | **0,000 m** ✅ | — |
| Acima | **0,000 m** ✅ | — |
| Apontando p/ alvo | **0,0000 m** ✅ | dx 4px · dy 5px → dentro do círculo central |

> Nota: com o ombro deslocado, o crosshair fica 1,8 m à direita do **eixo do corpo** — o jogador compensa girando o yaw (padrão over-shoulder, como Gears/PUBG). O teste "apontando para o alvo" confirma que, ao mirar com o crosshair, o **tiro acerta exatamente onde o crosshair aponta** nos dois modos.

## 5. Conclusão
- ✅ A mira **nunca muda de posição** ao alternar 3ª pessoa ↔ ADS (pulo medido: 0,000 m).
- ✅ O crosshair coincide com a **linha de tiro** em ambos os modos (tiro = centro da tela).
- ✅ Válido para **Multiplayer e BR** (mesmo `GameCamera`/`aimRay` em todos os modos de jogo).
- 🔧 O campo de tiro (`?range=1` / preview 8085) agora mostra `dx/dy` ≈ 0 ao mirar no alvo, confirmando o alinhamento.
