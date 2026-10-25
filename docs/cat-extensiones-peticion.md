# Petición de extensiones CAT para uSDX Plus Orange

**Proyecto solicitante:** usdxcontrol (cliente de control de escritorio/web para el uSDX).
**Firmware de referencia:** usdx_plus_orange v2.1.0 (leído únicamente; el repo no se modifica).
**Fecha:** octubre de 2026.

Este documento especifica los comandos CAT que el cliente necesita y que hoy el firmware de producción no implementa (`cat.h` responde `?;` o devuelve eco sin efecto real en el estado). Cada extensión describe motivación, formato propuesto, semántica, impacto estimado en el firmware y prueba sugerida para `tests/fw_sim/cat_sim.cpp`. El orden es por prioridad y cada extensión es independiente: puede adoptarse cualquiera sin adoptar el resto.

Restricción de presupuesto conocida (ROADMAP/AGENTS): flash al 95 %; esto condiciona P2/P3.

## P0 — bloqueantes para un control razonable

### P0-1. Estado de transmisión legible (`TX0;` / `TX1;`)

**Motivación.** El cliente no puede saber si la radio está realmente transmitiendo: el PTT frontal, la paleta, el VOX o el propio CAT pueden cambiar el estado. Hoy `Command_TX` no responde nada (`cat.h:147`), así que el cliente debe trabajar con un estado optimista que se rompe en cuanto VOX o el keyer entran en TX.

**Propuesta.**
- Cuando el firmware entra en TX (por `TX;` CAT, PTT físico, paleta, VOX o práctica), emite `TX1;`; al volver a RX emite `TX0;`.
- Solo mientras `cat_active = 1` (la radio no hablara por serie si nunca hubo CAT).
- `RX;` sigue respondiendo `RX0;` como ya lo hace hoy.

**Semántica.** El estado TX pasa a ser legible y se convierte en fuente de verdad; el cliente elimina su modelo optimista de TX.

**Impacto firmware.** Bajo: un hook en `switch_rxtx`, sin bloquear el loop.

**Prueba sugerida.**
- C13: tras `TX;` la salida es `TX1;`; tras `RX;`, `RX0;`.
- C14: emisión espontánea de `TX0;` al abandonar TX por PTT físico con `cat_active=1`; ninguna emisión con `cat_active=0`.

### P0-2. S-meter por serie (`SM;`)

**Motivación.** La pantalla de control exige instrumentos (S y dBm para la falta de potencia/SWR). El firmware ya calcula S-meter para la LCD, y con `cat_active=1` lo deja de refrescar para no interferir con el CAT (`cat.h:208-211`).

**Propuesta.**
- `SM;` → `SMnnn;` con 000–255 (la misma escala interna que usa el S-margin de la LCD).
- El cálculo del S-meter no debe interrumpir el del CAT: mantener el cálculo aunque `cat_active=1`; si el coste lo exige, se calculará solo cuando el cliente haya pedido `SM;` alguna vez (modo bajo demanda).

**Impacto firmware.** Medio: lectura del valor ya existente + respuesta poll-independiente.

**Prueba sugerida.**
- C15: `SM;` → `SM0nn;` con valores límite 0/255 y el valor S9 que ya produce la escala actual.

## P1 — control de estación completo

### P1-1. VFO B (`FB;`)

**Motivación.** Operación split y conmutación A/B desde el cliente. Hoy solo existe FA; el estado de VFO B (`vfo[2]`, `vfosel`) ya existe en el firmware.

**Propuesta.**
- `FB;` → `FB<11 dígitos>;` (idéntico formato FA).
- `FB<11d>;` → escribe en el VFO no activo; no conmuta el VFO activo.
- La conmutación A/B ya existe en el menú del firmware; no se pide comando nuevo para ello si el presupuesto no lo permite.

**Impacto firmware.** Bajo: espejo de FA sobre el VFO no activo.

**Prueba sugerida.**
- C16: `FB` lee y escribe el VFO no activo sin que `FA` se vea alterado ni se produzca CSite change.

### P1-2. RIT con offset ajustable (`RT±nnnn;`)

**Motivación.** El CAT actual solo limpia RIT (`RC;`); el desplazamiento de RX solo se mueve con el dial físico. Con un RIT ajustable por serie el cliente permite separar RX/TX con precisión desde la pantalla (común en estaciones de control tipo Flex/SmartSDR con "guardado del offset").

**Propuesta.**
- `RT;` → `RTrnnnn;` con el offset actual y signo (por ejemplo `RT+0250;`).
- `RT<±4dígitos>;` → fija el offset en hercios (±9999 Hz, como el dial del firmware), aplicando el mismo ciclo de RIT del firmware (si RIT estaba apagado, encenderlo).
- `RC;` sigue limpiando el RIT (offset 0).

**Impacto firmware.** Bajo: escritura de `rit` + `si5351.freq_calc_fast(rit)` ya existente en `cat_apply`.

**Prueba sugerida.**
- C17: `RT+0250;` desplaza la RX real 250 Hz; respuesta `RT+0250;`; `RC;` vuelve a `RT+0000;`.

## P2 — deseable (presupuesto medio)

### P2-1. Parámetros de menú desde CAT

**Motivación.** Volumen, AGC, NR/ATT, ancho de filtro, WPM del keyer, VOX… (35 ítems de `MENU[]`) quedan fuera de serie. Para una estación completa, el mínimo útil sería: volumen, ancho de filtro, AGC, keyer WPM y VOX on/off.

**Formato concreto propuesto (usdxcontrol).**
- Volumen: `VOnn;` (00–99, igual que el volumen del menú). Lectura y escritura: siempre responde `VOnn;` con el valor vigente.
- AGC: `AGd;` con `0=OFF, 1=AUTO, 2=FAST, 3=SLOW` (los tiempos del firmware actual). Responde `AGd;` con el nivel vigente.
- NR: `NRd;` con 0–4 (mismo rango/spin del menú NR). Responde `NRd;`.
- El valor de las escrituras se aprende del eco (el cliente envía `VO50;` y toma `VO50;` como acuse); no hay que leer antes de escribir.

**Descubrimiento de capacidad (requisito del cliente).**
- Al conectar, el cliente pregunta una vez con un getter (por ejemplo `VO;`).
- Si contesta `?;` o `E;` (comando no soportado), el cliente NO volverá a enviar `VO/AG/NR/SM` y mostrará esos controles deshabilitados con nota «requiere firmware ampliado». Comportamiento actual esperado con el firmware stock.
- Si contesta el eco, el cliente activa estos controles y empieza a sondear `SM;`.

**Impacto firmware.** Bajo en escritura (los setters de `MENU[]` ya existen: `volume_set`, `agcW`… se necesita el dispatcher). Lecturas sin coste extra salvo `SM;` (P0-2).

**Simulador de referencia.**
- El cliente ya implementa el comportamiento propuesto (eco de configuración + S-meter dinámico) en `src/features/radio/infrastructure/catSimulatorRadioLink.ts` para que el equipo de firmware pueda contrastar la semántica exacta frame a frame.

**Pruebas sugeridas.**
- C18: `VO50;` → `VO50;` y el volumen del menú cambia al reiniciar (persistencia igual que el dial del menú).
- C19: `AG2;` → `AG2;`; la cadencia del AGC en el DSP cambia conforme a la tabla; `AG;` lee el nivel actual.
- C20: `NR3;` → `NR3;`; `NR9;` se rechaza con `?;` (fuera de rango).
- C21: firmware stock: `VO;` → `?;`; el cliente no reenvía estos comandos en toda la sesión.

Los cinco piloto (volumen, AGC, NR, ancho de filtro y keyer) se valen del mismo dispatcher; el resto de parámetros se amplía por fases si el presupuesto de flash lo permite.

**Nota.** Existe una especificación de intérprete genérico completo que cubre los 35 parámetros de `MENU[]` con un único mecanismo mínimo-flash (comandos `PN…;`): ver `cat-generico-interprete-especificacion.md`. Si el equipo adopta el genérico, esta P2-1 queda subsumida; el cliente soporta ambos.

## P3 — solo si queda margen

### P3-1. Keying CW por serie (`KY...;`)

**Motivación.** Enviar texto CW desde el cliente (mensajes CQ, macros) sin paleta.

**Propuesta.** `KY` + texto + `;`, encolando en el keyer cuando `mode == CW` (TS-480 lo hace así), respetando `delayWithKeySense` (`cw.h:262-273`).

**Impacto firmware.** Alto: cola de símbolos coexistiendo con el keyer iambic.

## Fuera de alcance conocido (por si cambia el criterio)

- **Audio por serie (`UA1;`, `CAT_STREAMING`):** ya implementado en legacy (`usdx-legazy.ino:4359-4396`, 115200 baudios, 8-bit sin signo a ~7,8 kHz, tramas `USnnn…`). ROADMAP.md:119-120 lo descarta por CPU/flash en producción. Si algún día resulta viable como flag de compilación opcional, el cliente lo soportará: es la única vía de panadapter/cascada real sin hardware de audio extra.

---

## Notas de implementación

- Todas las respuestas siguen el patrón actual: comando y respuesta terminados en `;`, ASCII de dígitos.
- Las emisiones espontáneas (P0-1, P0-2) solo con `cat_active=1` y nunca en las ventanas donde la máquina no puede responder (`TX` largo, refresco LPF, menú).
- Compromiso del cliente: como máximo 1 comando en vuelo con separación ≥ 120 ms y sondeo de 500 ms; el firmware no debe suponer nada más.
- Retrocompatibilidad: los shims actuales (`AG0; XT1; RT1; FL0; VX;`) pueden seguir respondiendo eco; los comandos nuevos son aditivos y se piden explícitamente por el cliente.

---

*Este documento solicita cambios solo en el firmware uSDX y no toca el repositorio `usdx_plus_orange`, que se mantiene como referencia de solo lectura.*
