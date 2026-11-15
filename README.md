# Steel Ball Run — Bizarre Race

Juego de carreras multijugador en el navegador inspirado en la parte 7 de *JoJo's Bizarre Adventure*.
Una única carrera de San Diego a Nueva York dividida en 5 etapas (playa, desierto de Arizona,
Montañas Rocosas, Grandes Llanuras y Nueva York). Cada etapa reparte puntos y la final cuenta doble.
Recoge las 9 partes del **Cadáver Sagrado** para ganar puntos extra y recargar tu Stand.

## Personajes
| Jinete | Stand / habilidad (tecla E) |
|---|---|
| Johnny Joestar | Tusk: dispara uñas que ralentizan |
| Gyro Zeppeli | Steel Ball: bola teledirigida que aturde |
| Diego Brando | Scary Monsters: dinosaurio rápido que embiste |
| Funny Valentine | D4C: teletransporte + escudo |
| Hot Pants | Cream Starter: spray que ciega a los de atrás |
| Sandman | In a Silent Way: onda de sonido (corre a pie) |
| Pocoloco | Hey Ya!: efecto de suerte aleatorio |

## Controles
`W` galopar · `S` frenar · `A/D` girar · `Shift` esprintar (gasta estamina) · `Espacio` saltar ·
`E` Stand · `Q` Golden Spin · `C` cámara · `M` silencio · `V` voces · `Esc` pausa.
También funciona con mando (LB = Golden Spin) y en móvil (botones táctiles).

## Mecánicas de carrera
- **Estamina**: el esprint la gasta; si llega a cero el caballo se agota un rato.
- **Golden Spin** (`Q`): minijuego de ritmo de 3 pulsaciones. Pulsa cuando el anillo encaje en el círculo dorado.
  Cada acierto recupera estamina; con 3 perfectos haces un *GOLDEN SPIN* con turbo. Se recarga en 12 s.
- **Estado del caballo**: tropezar con obstáculos, recibir golpes, galopar fuera del camino o esprintar sin estamina
  lo desgastan y reduce su velocidad máxima. Se recupera con partes del Cadáver y con Golden Spin perfectos.
- **Rebufo**: ir pegado detrás de otro jinete da velocidad extra.
- **Salida perfecta**: pulsa `W` justo al decir GO (antes de tiempo = salida en falso).

## Jugar con amigos
1. Uno pulsa **Crear sala** y comparte el código (o el enlace con «Copiar enlace»).
2. Los demás escriben el código y pulsan **Unirse**.
3. El anfitrión elige bots y longitud y pulsa **¡Empezar!**

La conexión es P2P (PeerJS + WebRTC): no hace falta servidor propio. En algunas redes muy cerradas
(NAT simétrico, redes de empresa) la conexión puede fallar.

## Desarrollo
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

### Publicar en GitHub Pages
El workflow `.github/workflows/pages.yml` publica automáticamente al hacer push a `main`.
Activa *Settings → Pages → Source: GitHub Actions* en el repositorio.

### Modelos
Los modelos van en `public/models/` y se configuran en `public/models/manifest.json`
(archivo, altura, huesos de las piernas para la postura de montar, etc.).
`dev/riders.html` muestra todos los jinetes para ajustar posturas (`npm run dev` y abre `/dev/riders.html?cam=q&only=1`).

Créditos y licencias: ver [CREDITS.md](CREDITS.md).
