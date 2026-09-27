# Guía docente de EcoPunción FAV

Propuesta de itinerario formativo para personal de enfermería y medicina de unidades de hemodiálisis.
El simulador cubre la fase de **aprendizaje cognitivo y de coordinación ojo-mano-pantalla**, previa a:

1. los simuladores físicos (maniquíes y *phantoms*);
2. la punción supervisada en pacientes.

## Objetivos de aprendizaje

Al finalizar el itinerario, la persona participante será capaz de:

1. **Preparar la escena**:
   - brazo del paciente apoyado en una superficie firme y plana, a unos 45° del cuerpo, extendido y relajado;
   - operador sentado;
   - pantalla en su línea de visión, detrás del sitio de punción;
   - marcador de la sonda coherente con la pantalla.
2. **Optimizar la imagen**: preajuste, profundidad, foco, ganancia, TGC y frecuencia.
3. **Reconocer la anatomía** del antebrazo y del brazo:
   - diferenciar arteria de vena (compresión, pulsatilidad, Doppler);
   - identificar las venas satélites, los nervios mediano, cubital y radial, y los tendones.
4. **Valorar la FAV**:
   - diámetro, profundidad y trayecto;
   - flujo del acceso (Qa) medido en la arteria humeral;
   - criterios de maduración (KDOQI / GEMAV) y de estenosis significativa.
5. **Reconocer las dificultades habituales**: FAV profunda o tortuosa, estenosis, aneurisma con trombo, colaterales, vena transpuesta, prótesis y hematoma.
6. **Puncionar con guía ecográfica**, siguiendo los pasos del procedimiento (el simulador los marca en la pestaña *Punción*):
   - con técnica aséptica (piel desinfectada, funda y gel estériles);
   - con **abordaje longitudinal (en plano)**, el preferido en la mayoría de las unidades;
   - con **abordaje transversal (fuera de plano)**, siguiendo la punta con posicionamiento dinámico (DNTP);
   - con la punta visible durante todo el avance, sin perforar la pared posterior;
   - respetando las distancias (≥ 3 cm de la anastomosis, ≥ 5 cm entre agujas) y la dirección de la aguja venosa.

## Itinerario propuesto

Seis sesiones de unos 45 minutos cada una.

| Sesión | Contenido | Modo / casos | Evidencia de logro |
|---|---|---|---|
| 1 | Orientación y ergonomía | Lección 1; modo **Sala y ergonomía** | Ergonomía ≥ 80 puntos; orientación de la sonda coherente |
| 2 | Knobología y artefactos | Lecciones 2 y 7; casos *Obeso* y *Arterias calcificadas* | Vaso centrado, foco a su altura, identificación de 5 artefactos |
| 3 | Anatomía y Doppler | Lección 3; caso *Brazo sin FAV* | Distinguir arteria de vena en 3 localizaciones; onda trifásica frente a monofásica |
| 4 | Valoración de la FAV | Lecciones 4 y 8; casos *Inmadura* y *Estenosis* | Diámetro ± 0,5 mm; Qa ± 20 %; decidir si la FAV es apta |
| 5 | Abordaje longitudinal (en plano) | Lección 5; caso *FAV RC madura* | Puntuación ≥ 75; punta visible ≥ 80 % del avance; sin transfixión |
| 6 | Abordaje transversal (fuera de plano) y casos difíciles | Lección 6; casos *Tortuosa*, *Aneurisma*, *Humerobasílica*, *Prótesis* y *Hematoma* | Puntuación ≥ 75 en 3 casos difíciles |

## Rúbrica de la punción

La puntuación del simulador parte de 100 puntos y resta penalizaciones:

| Error | Penalización | Referencia |
|---|---|---|
| Punción cutánea adicional | −8 cada una | Eves 2021 |
| Redirección dentro del tejido (cambiar ángulo o rumbo más de 4° con la punta fuera de la luz; bajar el ángulo y alinear la aguja dentro de la luz no cuenta) | −3 cada una | |
| Contacto con la pared posterior | −6 | Blaivas 2009 |
| Transfixión (perforación de la pared posterior) | −18 | |
| Punción arterial no deseada | −30 | |
| Contacto con un nervio | −20 | |
| Infiltración de suero (lavar con la punta fuera de la luz) | −12 | |
| Tomar el cuerpo de la aguja por la punta (avanzar con el haz cortando el cuerpo) | −4 | |
| Avance con la punta visible < 80 % (en plano no cuenta el tramo en que la punta, alineada con el plano, aún no ha entrado en la imagen) | −0,4 por punto porcentual | NeedleTrainer; Sites 2007 |
| Movimiento de la sonda mientras avanza la aguja > 8 mm | hasta −8 | Sites 2007 |
| Colapso del vaso > 50 % por exceso de presión | −5 | |

Criterios finales (al pulsar *Confirmar punción*):

| Criterio | Penalización si no se cumple |
|---|---|
| Punta en la luz del acceso | −35 |
| Recorrido intraluminal ≥ 5 mm | −8 |
| Punta centrada | −5 |
| Aguja alineada con el vaso (≤ 25° entre la aguja y el eje del vaso, que puede diferir del ángulo con la piel) | −5 |
| ≥ 3 cm de la anastomosis | −10 |
| Dentro de la zona recomendada | −5 |
| Fuera de las zonas a evitar | −15 |
| Aguja venosa anterógrada | −10 |
| ≥ 5 cm entre las puntas | −10 |
| Técnica aséptica (piel desinfectada, funda y gel estériles) | −5 |
| Uso adecuado del compresor | −2 / −5 |

Niveles orientativos:

| Puntuación | Nivel |
|---|---|
| ≥ 90 | Excelente |
| 75–89 | Competente |
| 55–74 | Mejorable |
| < 55 | Insuficiente |

## Uso en grupo

- Cada participante lo abre en su ordenador desde <https://guithar.github.io/ecografo-virtual/>, sin instalar nada (navegador con WebGL2).
- Un enlace con parámetros abre directamente un caso y un modo, lo que resulta útil para repartir ejercicios. Por ejemplo, `https://guithar.github.io/ecografo-virtual/?caso=rc_estenosis&modo=cannulate`.
- Proyecta el simulador en el aula con el panel 3D maximizado (botón ⤢) para explicar la relación entre la sonda, el plano de corte y la imagen.
- Pide que cada punción se compruebe con un **lavado de suero** (J) antes de confirmarla. Con la punta en la luz se ven microburbujas recorriendo el vaso; si se lava con la punta en la pared (signo de la tienda, antes del «pop»), aparece la infiltración. Es un buen ejercicio para aprender a reconocerla.
- Empieza en **modo básico** (solo los controles de la punción) y sigue la lista de **pasos de la punción** de la pestaña *Punción*, que se marca sola. El botón **Más controles**, a la derecha de la consola, muestra el Doppler, el PW y los ajustes de imagen para las sesiones 2–4.
- Pide que lean en la pestaña *Caso* **por qué la punción ecoguiada está indicada** en cada caso (primeras punciones, FAV profunda, maduración escasa, estenosis, hematoma…).
- Activa **Fusión** (anatomía sobre ecografía) y **Etiquetas** para las primeras sesiones. Desactívalas, junto con las **Ayudas**, en las evaluaciones.
- El informe (botón **Informe**) se puede imprimir o exportar en JSON o CSV para el portafolio de cada participante. El historial se guarda en el navegador.

## Limitaciones

- El simulador no reproduce la sensación táctil (resistencia, «pop»), ni la palpación del *thrill*, ni la preparación aséptica real: la asepsia es un paso (botón *Asepsia*) y un criterio de la evaluación.
- La anatomía es un modelo idealizado de un adulto. La variabilidad real es mayor.
- La imagen se genera por convolución con un modelo físico simplificado, pensado para que el aprendizaje transfiera a la práctica, no para cuantificar como un equipo real.
- Las cifras del simulador (diámetros, flujos, velocidades) son valores didácticos coherentes con la bibliografía. No son valores de referencia normativos.
