# Plano de Performance para Jogo 3D

## Resposta direta: dá para rodar a 120 FPS? **Sim, mas hoje o jogo se auto-limita a ~75 FPS**

**Por quê:**
1. O loop usa `requestAnimationFrame` — em um celular com tela de 120 Hz, o navegador já chama o loop a 120 vezes/segundo. O **motor** aguenta; o problema é o **orçamento de frame da GPU** (precisa renderizar em < 8,3 ms).
2. O escalonador dinâmico do renderer.js mira **13,5–15,5 ms** (~64–74 FPS). Ou seja: o jogo **reduz a resolução de propósito para ficar em ~70 FPS** — ele nunca vai sozinho para 120.
3. Com Bloom ligado (MÉDIA/ALTA) e pixelRatio até 2 (numa tela 2400×1080 com dpr 3 = buffer de ~3600×1620), 120 FPS é impossível em celular médio. **Só a preset BAIXA** (sem bloom, sem SMAA, sem sombra, renderScale 0,55) chega perto — e mesmo assim precisa de um aparelho topo de linha (SD 8 Gen 2+).

**Conclusão:** dá para rodar a 120 FPS, mas exige **um modo novo** (orçamento de 7 ms + piso de resolução mais baixo + bloom/SMAA off) e **otimizações de custo fixo** (listadas abaixo).

---

## O que pesa hoje (achados no código)

| # | Ponto | Onde | Impacto |
|---|-------|------|---------|
| 1 | **UnrealBloomPass + EffectComposer** sempre ativos em MÉDIA/ALTA | renderer.js | ⚠️ O maior custo de GPU — várias passadas fullscreen |
| 2 | **Escalonador mira ~70 FPS** (13,5–15,5 ms) e nunca pede 120 | renderer.js `setDynamicScale` | ⚠️ Bloqueia 120 por design |
| 3 | **pixelRatio = min(dpr,2) × renderScale** → buffer gigante em telas modernas | renderer.js | ⚠️ 4× mais pixels que o necessário |
| 4 | **13+ `backdrop-filter`/blur no CSS** recompositados a cada frame por cima do WebGL animado | css/style.css | ⚠️ Custo de composição alto no Android |
| 5 | **HUD escreve no DOM todo frame** (`setScore`, `setClock` → `formatClock` monta string) | game.js:2409-2411, hud.js | 🟡 layout/string churn |
| 6 | **`new THREE.Vector3()` por ped por frame** | pedestrian.js | 🟡 GC pressure com 46–140 peds |
| 7 | **Alocações por frame no FX** (`Matrix4/Quaternion/Euler/Vector3` a cada update) | fx.js (debris) | 🟡 GC |
| 8 | **PMREM do céu recalculado a cada 3–12 s** → hitch periódico de ~10–30 ms | sky.js | 🟡 trava visível, pior a 120 Hz |
| 9 | **Anisotropia 8 em todas as texturas** | textures.js | 🟡 banda de memória |
| 10 | Sombra PCFSoft alternada a cada 2 frames — ok, mas dá para 3 | renderer.js | 🟢 menor |

Pontos **já bons**: cidade com geometria mesclada por material (16 meshes, não milhares), props com `InstancedMesh`, minimapa a 20 FPS, partículas com pool fixo, texturas procedurais (zero download).

---

## Plano de otimização em 4 fases

### Fase 1 — Novo modo "120 FPS" (o passo decisivo) 🎯
**Onde:** `config.js` (PRESETS) + `renderer.js` (alvos do escalonador) + `game.js` (applyPreset)

1. Adicionar 4ª preset **"120 FPS"** (ou toggle "taxa de quadros alvo: 60/120"):
   - `renderScale: 0.45–0.55`, `pixelRatioCap: 1.25` (em vez de 2)
   - bloom OFF, SMAA OFF, OutputPass removido
   - sombras: `PCFBasicShadowMap` (mais barato que PCFSoft) atualizada a cada **3º frame** (`_shadowTick % 3`)
   - `anisotropy: 4`, dynamicLights desligados
2. Tornar o alvo do escalonador configurável: no modo 120, `_targetMs ≈ 7–8 ms` com **piso de resolução 0.45** (hoje o piso impede cair o bastante). Isso faz o jogo **baixar resolução sozinho** até manter 120 em vez de travar em 70.
3. Aplicar no **solo e no MP** (match.js usa o mesmo renderer — basta a preset; cuidado com as DUAS cópias de look no match.js, conforme memória do projeto).

**Ganho:** é o único caminho real para 120 FPS. Em aparelho topo de linha, 120 sustentado; em médio, fica fluido (~90–120 com queda dinâmica de resolução).

### Fase 2 — Cortar custo fixo de GPU (beneficia TODOS os modos)
4. **Bloom mais barato na MÉDIA:** manter, mas com `bloomScale` menor (0,35) e blur half-res — ou trocar UnrealBloomPass por um bloom custom de 1 passada só.
5. **Remover `backdrop-filter` em touch:** media query `@media (hover: none)` no style.css desligando os 13 blurs — deixa o HUD com fundo sólido semi-transparente. **Ganho imediato de composição no Android, sem mudar visual no desktop.**
6. **PMREM por evento:** recalcular o env map só quando a **hora mudar** (evento do sky) em vez de intervalo fixo → elimina os hitches periódicos.
7. **Anisotropia 8 → 4** em BAIXA/120 (mantém 8 na ALTA).

### Fase 3 — CPU/GC (frame pacing estável a 120 Hz)
8. **Pool de vetores no pedestrian.js:** 1 `Vector3` reutilizado (módulo-level) em vez de `new` por ped por frame. Com 140 peds a 120 Hz = 16.800 alocações/seg eliminadas.
9. **Reusar temps no fx.js** (Matrix4/Quaternion/Euler fora do update).
10. **HUD só quando muda:** cache de último valor em `setScore`/`setDeliveries`/`setClock`; `formatClock` só recalcula quando o minuto muda. (Na prática 1 texto por segundo em vez de 120.)
11. **LOD de animação:** peds a mais de ~60 m do jogador atualizam a 30 Hz (congela a animação de braços); perto, 120 Hz. Carros idem.

### Fase 4 — Aproveitar o display de 120 Hz
12. **Tela cheia ajuda:** no Android, Chrome frequentemente limita a 60 Hz em janela/letterbox — `requestFullscreen()` destrava a taxa maior. Sugerir "modo tela cheia" no menu.
13. **Bateria:** com economia de bateria ativa o Android Chrome trava em 60 Hz — nada a fazer além de avisar no menu (texto "ative 120 Hz nas configurações do celular").
14. **Confirmar `dt` clamp:** já existe (máx 0,05) — física estável a 120 Hz. Sem mudança necessária.

---

## Ordem recomendada de implementação
1. **Fase 1 (modo 120 FPS)** → ganho maior e imediato (é o que responde sua pergunta).
2. **Fase 2 itens 5 e 6** → baratos, ajudam todo mundo.
3. Fases 3–4 → polish de estabilidade.

Estimativa de ganho realista no modo 120 FPS: **~8–12 ms de GPU por frame liberados** (Bloom + pixelRatio 2→1.25 + sombra PCFSoft→PCFBasic já respondem por ~70% disso).