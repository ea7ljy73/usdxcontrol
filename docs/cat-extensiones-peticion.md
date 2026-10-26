# CAT del uSDX Plus Orange — referencia de comandos (TS-480)

**Estado:** implementado en el firmware `usdx_plus_orange` **v2.2.0** (rama `dev`; referencia de origen: `CAT.md` del firmware), probado en host
(`tests/fw_sim/cat_sim`, 125 casos) y sobre el firmware real en un ATmega328P simulado
(`tests/avr_sim`, escenario `cat`: guion de 65 pasos por la UART a 38400 baudios, sondeo
continuo a 120 y 50 ms sin perder bytes ni muestras de RX, y persistencia tras reinicio).
**Pendiente:** validación en la radio (necesita la modificación UART-USB, `HARDWARE_TEST_GUIDE.md` §7).
**Fecha:** 25-10-2026.

Este documento sustituye a la antigua «petición de extensiones». La radio se presenta como un
**Kenwood TS-480** (`ID020;`) y los comandos nuevos siguen la sintaxis del TS-480, de modo que
también sirven flrig, Hamlib/rigctld y WSJT-X con el modelo TS-480. Lo que el TS-480 no tiene
(los parámetros propios del uSDX) va por `EX` (menú extendido), con la tabla completa en
`cat-generico-interprete-especificacion.md`.

## Reglas generales

- Serie **38400 8N1**, tramas ASCII terminadas en `;`. Un comando cada ≥ 120 ms (el firmware
  espera 10 ms tras cada trama, como legacy).
- **Lectura**: el comando sin parámetro (`AG0;`, `GT;`…) devuelve el valor.
- **Escritura**: el comando con parámetro **no devuelve nada** (igual que el TS-480). El cliente
  confirma releyendo.
- **Rechazo**: si el valor no es numérico o está fuera de rango, o si el comando no existe, la
  radio responde `?;` y no hace nada. Si la trama pasa de 40 bytes, responde `E;`.
- **En TX**: lo que toca el sintetizador, los relés o el ADC (modo, banda, VFO, RIT on/off,
  atenuador, calibración…) se **rechaza con `?;`**. `FA`/`MD`/`RU`/`RD`/`RC` se anotan y se aplican
  al volver a RX. Volumen, potencia, micro, AGC, NR, VOX y keyer funcionan también en TX.
- **Persistencia**: lo que se cambia por CAT se guarda en EEPROM igual que desde el menú, y solo
  si el valor cambia (una escritura con el mismo valor no hace nada).
- **Estado de TX**: lo da el campo P8 de `IF;` (TX real de la ISR, incluidas las pausas de la voz).
  No hay tramas espontáneas (`AI0`).

## Comandos

### Frecuencia, modo, VFO

| Comando | Lectura → respuesta | Escritura | Notas |
|---|---|---|---|
| `FA` | `FA;` → `FA00007074000;` | `FA00014074000;` | VFO activo, 11 dígitos en Hz |
| `FB` | `FB;` → `FB…;` | `FB00014200000;` | VFO **no activo**: no conmuta ni toca RF |
| `FR` | `FR;` → `FR0;` (A) / `FR1;` (B) | `FR0;` / `FR1;` | Conmuta A/B (en TX → `?;`) |
| `FT` | `FT;` → igual que `FR` | solo el mismo valor que `FR` | Sin split: otro valor → `?;` |
| `MD` | `MD;` → `MD1`..`MD5` | `MD1;`..`MD5;` | 1 LSB, 2 USB, 3 CW, 4 FM, 5 AM |
| `IF` | `IF;` → trama de 38 caracteres | — | Ver abajo |

Trama `IF` (posiciones desde 0):

| Posición | Campo | Valor en el uSDX |
|---|---|---|
| 2–12 | P1 frecuencia | 11 dígitos |
| 13–17 | P2 paso | `00000` |
| 18–22 | P3 offset del RIT | `+0250`, `-0100`… (±9999 Hz) |
| 23 | P4 RIT on | `0` / `1` |
| 24 | P5 XIT | `0` |
| 25–27 | P6–P7 memoria | `000` |
| **28** | **P8 TX/RX** | **`1` en TX** (CAT, PTT, VOX, CW) |
| 29 | P9 modo | como `MD` |
| 30 | P10 VFO | `0` A, `1` B |
| 31–36 | P11–P15 | `000000` |

### RIT

| Comando | Efecto |
|---|---|
| `RT;` | → `RT0;` / `RT1;` |
| `RT0;` / `RT1;` | Apaga / enciende el RIT. Al encender sin offset queda en +1 Hz, como en el menú; si ya hay offset, se conserva |
| `RU;` / `RD;` | Sube / baja 10 Hz |
| `RU00250;` / `RD00250;` | Sube / baja n Hz (límite ±9999, como el dial) |
| `RC;` | Borra el RIT (responde `RC;`, por compatibilidad con legacy) |

El offset se lee en `IF` (P3/P4). Un offset que llega a 0 apaga el RIT, porque en el uSDX el RIT
activo es `rit != 0`.

### Recepción y transmisión

| Comando | Rango TS-480 | Parámetro del uSDX | Conversión |
|---|---|---|---|
| `AG0nnn` | 000–255 | **Volume** (menú 0, 0..16) | lectura `v·16` (16 → 255); escritura `(n+8)/16`. Nunca pone −1 (apagado) |
| `SM0` | 0000–0030 | S-meter (dBm) | `(dBm+133)/4`: S9 (−73 dBm) = 15, 4 dB por cuenta. Solo lectura |
| `GTnnn` | 000/001/002 | AGC (menú 7) | 000 OFF, 001 Fast, 002 Slow |
| `RAnn` | 00–07 | ATT (menú 9) | lectura `RAnn00;`. 0 dB, −13, −20, −33, −40, −53, −60, −73 dB |
| `NRn` | 0/1/2 | NR (menú 8) | 0 = off, 1 = NR 1, 2 = puerta de ruido (NR ≥ 2; `NR2` conserva el nivel) |
| `RLnn` | 00–08 | NR (menú 8) | nivel directo |
| `PCnnn` | 000–100 | TX Drive (menú 20, 0..8) | lectura `drive·12,5`; escritura `(2n+12)/25` |
| `MGnnn` | 000–100 | Mic Atten (menú 28, 4..0) | 100 = sin atenuación, 0 = −24 dB; pasos de 25 |
| `PRn` | 0/1 | TX Comp (menú 30) | `PR1` conserva el nivel; el nivel 0..3 va por `EX030` |
| `KSnnn` | 001–060 | Keyer Speed (menú 14) | wpm |
| `VXn` | 0/1 | VOX (menú 18) | **ojo**: `VX1` deja la radio transmitiendo con el audio del micro |
| `TX;` `TX0;` `TX1;` `TX2;` | — | PTT | sin respuesta |
| `RX;` | — | vuelta a RX | responde `RX0;` |

### Menú extendido (todo lo demás)

| Comando | Respuesta |
|---|---|
| `EXnnn0000;` | `EXnnn0000v;` (`nnn` = número de menú de la LCD, `v` en decimal; puede llevar `-`) |
| `EXnnn0000v;` | sin respuesta; `?;` si se rechaza |

Tabla de números, rangos y efectos: `cat-generico-interprete-especificacion.md`.

### Compatibilidad (legacy)

`ID;` → `ID020;` · `PS;` → `PS1;` · `AI;`/`AI0;` → `AI0;` · `XT1;` → `XT1;` · `FL0;` → `FL0;` · `RS;` → `RS0;`.

## Detección de firmware ampliado

Hasta la v2.1.0 el firmware responde a `AG0;` con `AG0;` (eco) y a `EX…;` con `?;`.
Al conectar:

1. `ID;` → `ID020;`.
2. `EX0000000;` → si responde `EX0000000<v>;`, el firmware es ampliado: se activan todos los
   controles. Si responde `?;`, solo `FA/MD/IF/TX/RX/RC`.

## Cambios necesarios en usdxcontrol

Lo implementado en `src/features/radio/domain/cat/codec.ts` y en `catSimulatorRadioLink.ts`
seguía la petición antigua y no coincide con el TS-480:

| Hoy en el cliente | Debe ser |
|---|---|
| `VOnn;` volumen 00–99 | `AG0nnn;` 000–255 (lectura `AG0;`) |
| `AGd;` AGC 0–3 | `GTnnn;` 000–002 (no hay «AUTO») |
| `SMnnn;` 000–255 | `SM0;` → `SM0nnnn;` 0000–0030 (S9 = 0015) |
| `NRd;` 0–4 | `NR0/1/2;` y nivel `RLnn;` 00–08 |
| eco como acuse de escritura | sin respuesta; confirmar releyendo, `?;` = rechazo |
| `TX1;`/`TX0;` espontáneos | sondear `IF;` y leer P8 (posición 28) |
| `PN<d>,<v>;` | `EXnnn0000v;` con el **número de menú de la LCD** |
| `RT±nnnn;` | `RU/RD nnnnn;` + `RC;`; offset leído en `IF` P3 |
| descubrimiento con `VO;`/`PNC;` | `EX0000000;` |

## Fuera de alcance (por memoria)

Con todo lo anterior el firmware queda al **99 % de flash (≈ 290 B libres)**. Quedaron fuera, por
orden de interés, y se pueden pedir si se libera espacio:

- `KY` (enviar texto en CW): ≈ 150 B. Medido y retirado.
- `BU`/`BD` (banda arriba/abajo): ≈ 90 B. Se hace con `EX0030000<banda>;`.
- `UP`/`DN` (un paso del dial): ≈ 110 B. Se hace con `FA`.
- `FW` (ancho de filtro en Hz): ≈ 100 B. Se hace con `EX0020000<0..7>;`.
- `AI1`/`AI2` (avisos espontáneos).
- Audio por la serie: descartado (CPU y flash; ver ROADMAP).
