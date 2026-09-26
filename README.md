# Ecógrafo Virtual · Punción ecoguiada de FAV

Simulador de ecografía que funciona **en el navegador**, pensado para aprender la **punción ecoguiada de accesos vasculares para hemodiálisis**, sobre todo fístulas arteriovenosas (FAV). Es un primer contacto de bajo coste, previo a los simuladores físicos comerciales. Sirve para practicar:

- la **posición del transductor**, del **paciente** y de la **pantalla**;
- la relación entre lo que muestra la pantalla y la **realidad física** que se explora: anatomía 3D con el plano de corte y la sección anatómica real;
- la **técnica de punción** en eje corto (fuera de plano, con posicionamiento dinámico de la punta) y en eje largo (en plano);
- la **valoración de la FAV**: diámetro, profundidad, flujo (Qa) y criterios Doppler de estenosis.

> ⚠️ **Herramienta educativa.** No sirve para diagnosticar ni para decidir tratamientos, y no sustituye la formación práctica supervisada. Los fundamentos y las referencias están en [`docs/FUNDAMENTOS.md`](docs/FUNDAMENTOS.md). La propuesta de itinerario formativo y la rúbrica de evaluación están en [`docs/GUIA_DOCENTE.md`](docs/GUIA_DOCENTE.md).

## Funciones

### Simulación ecográfica física (GPU, WebGL2)

La imagen no es una textura pregrabada. Se calcula en cada fotograma a partir del modelo anatómico, con un método de convolución basado en la física (tipo Bamber–Dickinson / Gao, COLE), en ocho pasos:

1. **Speckle.** Dispersores complejos fijos al tejido. El speckle se mueve con la anatomía y se descorrelaciona al desplazar la sonda fuera del plano.
2. **Propiedades acústicas por tejido** (impedancia, atenuación, retrodispersión):
   - piel, grasa con septos, fascia;
   - músculo con patrón en «cielo estrellado»;
   - tendón anisótropo, nervio en panal, hueso;
   - pared vascular íntima-media, sangre, trombo, hematoma, prótesis de PTFE, calcificación.
3. **Reflexión especular en interfaces** según el ángulo de incidencia. Produce pérdidas de transmisión, **sombra acústica**, **refuerzo posterior** y **sombra de borde**.
4. **PSF axial y lateral** dependiente de la frecuencia y del **foco**, y **grosor de corte (elevación)** dependiente de la profundidad. Así aparece el volumen parcial y el error de tomar el cuerpo de la aguja por la punta.
5. **Cadena de proceso:**
   - envolvente, ganancia, **TGC** de 8 bandas, rango dinámico y compresión logarítmica;
   - persistencia, reducción de speckle y mapas de grises;
   - ruido electrónico.
6. **Contacto sonda-piel:** gel, falta de contacto (aire) en los bordes y **compresión** del tejido. Las venas colapsan según su presión intraluminal; las arterias no.
7. **Aguja analítica:**
   - reflexión especular que depende del ángulo de inserción;
   - **reverberaciones** («cola de cometa» y líneas paralelas), sombra y realce de la punta;
   - **signo de la tienda** de la pared antes del «pop».
8. **Doppler:**
   - **color y power**: velocidad por continuidad Q/A, perfil de flujo, remolino en aneurismas, turbulencia, **aliasing**, filtro de pared, prioridad y angulación ±20°;
   - **Doppler pulsado** con espectrograma, corrección de ángulo, medidas automáticas (VPS, VFD, IR, IP, TAMV, **Qa**) y **audio Doppler estéreo**.

### Realidad física en 3D

- **Brazo y mano:**
  - malla generada a partir de la misma geometría que usa el simulador;
  - piel con micro-relieve y transparencia regulable;
  - vasos, nervios, tendones, huesos y músculo;
  - **partículas de flujo** para ver la dirección y la velocidad de la sangre.
- **Plano de exploración** dentro del brazo, con la ecografía o la anatomía proyectadas (vista de «realidad aumentada», como en los simuladores de gama alta).
- **Sección anatómica real** del plano de corte, con nombres, junto a la pantalla del ecógrafo. Hay un control de **fusión** para superponerla a la ecografía.
- **Sala de hemodiálisis:**
  - sillón y paciente con fototipo de piel seleccionable;
  - ecógrafo sobre carro con el **monitor mostrando la imagen en vivo**;
  - monitor de hemodiálisis;
  - operador con brazos que siguen la sonda y la aguja;
  - **vista en primera persona del operador**.

### Casos clínicos (dificultades habituales)

| Caso | Dificultad |
|---|---|
| Brazo sin FAV: anatomía normal y mapeo prequirúrgico | Básico |
| FAV radiocefálica madura: caso de referencia | Básico |
| FAV humerocefálica **profunda** en paciente obeso | Intermedio |
| FAV **tortuosa** | Intermedio |
| **Estenosis yuxtaanastomótica** (aliasing, VPS > 400 cm/s) | Intermedio |
| **Aneurisma con trombo mural** y flujo en remolino | Avanzado |
| FAV **inmadura** con vena accesoria competidora | Intermedio |
| **Venas colaterales** y desdoblamiento | Intermedio |
| FAV **humerobasílica transpuesta** (arteria humeral y nervio mediano cercanos) | Avanzado |
| **Prótesis de PTFE** en asa (doble pared, 45°, sin compresor) | Intermedio |
| **Hematoma** tras punción fallida | Avanzado |
| Paciente diabético con **arterias calcificadas** (sombras) | Intermedio |

Todos los casos se pueden usar con el brazo izquierdo o el derecho.

### Punción y evaluación

- Agujas **arterial y venosa** de 14–17G, de 25 o 32 mm. Tres formas de colocarlas: fuera de plano, en plano o con un clic sobre la piel.
- Control del ángulo, del rumbo y del avance.
- **Eventos clínicos:**
  - punción cutánea, signo de la tienda, pérdida de resistencia;
  - **reflujo** (pulsátil, rojo brillante si la punción es arterial);
  - contacto con la pared posterior, **transfixión** con **hematoma que crece**;
  - punción arterial, **parestesia** por contacto nervioso, contacto óseo.
- **Métricas.** Se inspiran en NeedleTrainer, PerkTutor y Sites et al. 2007:
  - tiempo total y tiempo de piel a reflujo;
  - punciones cutáneas y redirecciones;
  - **% del avance con la punta visible**;
  - veces que se tomó el cuerpo por la punta;
  - movimiento de la sonda mientras avanza la aguja;
  - colapso del vaso;
  - recorrido de la aguja en el tejido.
- **Evaluación final según las guías** (KDOQI 2019, GEMAV 2017):
  - punta en la luz del acceso y centrada;
  - recorrido intraluminal y alineación con el vaso;
  - ≥ 3 cm de la anastomosis y ≥ 5 cm entre agujas;
  - aguja venosa anterógrada;
  - fuera de zonas a evitar (aneurisma, estenosis, hematoma);
  - uso correcto del compresor.
- **Informe** imprimible y exportable (JSON y CSV), con historial guardado en el navegador.

### Ergonomía (sala)

- Arrastra el ecógrafo y al operador. Ajusta el brazo del paciente (abducción, descenso, rotación) y el monitor (giro, inclinación, altura).
- El simulador evalúa:
  - la **alineación de la mirada** entre el sitio de punción y la pantalla;
  - el desplazamiento total de la mirada;
  - la distancia y la altura de la pantalla, y su orientación;
  - el alcance del operador;
  - la **coherencia entre el marcador de la sonda y la pantalla**.

### Aprendizaje

Ocho lecciones guiadas con **comprobación automática** de cada paso:

1. Orientación.
2. Optimización de la imagen.
3. Arteria frente a vena.
4. Regla de los 6.
5. Punción en eje corto con posicionamiento dinámico de la punta (DNTP).
6. Punción en eje largo.
7. Artefactos.
8. Doppler en la FAV.

## Uso

Necesita un navegador reciente con **WebGL2** (Chrome, Edge, Firefox o Safari) y, a ser posible, una tarjeta gráfica dedicada. Si va lento, baja la calidad en la barra superior.

```bash
npm install
npm run dev          # servidor de desarrollo en http://localhost:5173
npm run build        # sitio estático en dist/ (p. ej. GitHub Pages)
npm run build:single # un único HTML autocontenido en dist-single/ (abre sin servidor)
npm run typecheck
npm test             # pruebas unitarias (hemodinámica, modelo, aguja, métricas)
```

El flujo de trabajo `.github/workflows/deploy.yml` publica el sitio en **GitHub Pages** en cada push a `main`. Antes hay que activar Pages en *Settings → Pages → Source: GitHub Actions*.

Parámetros de URL útiles:

| Parámetro | Valores |
|---|---|
| `?caso=` | `rc_madura`, `bc_obeso`, `rc_estenosis`… |
| `?modo=` | `explore`, `cannulate`, `room`, `learn` |
| `?calidad=` | `alta`, `media`, `baja` |
| `?camara=` | vista inicial de la cámara |
| `?max=` | `3d`, `us`, `anat` (panel maximizado) |

### Controles principales

| Acción | Teclado / ratón |
|---|---|
| Deslizar la sonda | `W` `S` (a lo largo del brazo), `A` `D` (alrededor); o arrastrar la sonda en 3D |
| Rotar / inclinar / balancear | `Q` `E` / `R` `F` / `T` `G` |
| Presión | `Z` `X` |
| Vista transversal / longitudinal del vaso | `1` / `2` |
| Colocar, avanzar y confirmar la aguja | `N`, `↑` `↓` (o rueda sobre la imagen), `Intro` |
| Ángulo / rumbo de la aguja | `RePág` `AvPág` / `←` `→` |
| Profundidad / ganancia | `+` `−` / `[` `]` |
| Color / PW / modo B / congelar | `C` / `P` / `B` / `Espacio` |
| Medir / etiquetas / invertir I-D / compresor | `M` / `L` / `I` / `K` |
| Vistas de cámara / ayuda | `V` / `H` |

## Arquitectura

```
src/
  anatomy/     forma del brazo (SDF elíptica), estructuras tubulares, hemodinámica, tejidos, casos
  sim/         motor ecográfico en GPU (shaders por pases), Doppler pulsado y audio
  scene/       escena 3D: piel (surface nets), anatomía, sonda, aguja, sala, cámaras
  interaction/ pose de la sonda (maniobras PART) y física de la aguja
  training/    métricas, ergonomía y lecciones
  ui/          monitor, consola, paneles e informe
  app/App.ts   orquestación y bucle principal
```

La misma descripción anatómica alimenta:

- la simulación ecográfica (evaluación por segmentos en la GPU);
- las mallas 3D;
- las consultas en la CPU (física de la aguja, Doppler pulsado, etiquetas).

Por eso la pantalla y la «realidad» coinciden siempre.

## Licencia

MIT. Se agradecen contribuciones clínicas y técnicas: casos nuevos, validación de valores y traducciones.
