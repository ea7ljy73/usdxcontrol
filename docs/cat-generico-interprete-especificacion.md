# CAT del uSDX Plus Orange — menú extendido `EX` (todos los parámetros)

**Estado:** implementado en el firmware v2.2.0 (sustituye a la propuesta `PN`; origen: `CAT.md` del firmware). Referencia general de comandos:
`cat-extensiones-peticion.md`. **Fecha:** 25-10-2026.

`EX` da acceso por CAT a **todos los parámetros numéricos del menú** con un único mecanismo, sin
código por parámetro: el firmware recorre su tabla `MENU[]` (en flash), valida el rango, escribe,
guarda en EEPROM y ejecuta el mismo efecto que al editar con el dial.

## Formato (TS-480)

| Trama | Respuesta |
|---|---|
| `EXnnn0000;` | `EXnnn0000v;` |
| `EXnnn0000v;` | sin respuesta (escritura correcta) o `?;` |

- `nnn`: **número de menú que se ve en la LCD**, con 3 dígitos (`000`–`034`). No es la posición
  en el array: las entradas 28–31 y 34 están insertadas detrás de la 20.
- `0000`: campos P2–P4 del TS-480, fijos.
- `v`: decimal sin ceros a la izquierda; con `-` en valores negativos (solo el volumen −1).
- `?;` si: número inexistente, `CQ Message` (texto), valor no numérico o fuera de rango, o
  parámetro con efecto sobre la RF mientras se transmite (columna «TX»).
- Escribir el valor que ya tiene no hace nada (ni EEPROM ni efecto).

## Tabla (de `usdx_plus_orange.ino`, `MENU[]`)

| `nnn` | Menú | Rango | Valores | Efecto al escribir | TX |
|---|---|---|---|---|---|
| 000 | Volume | −1..16 | −1 = mudo | — | sí |
| 001 | Mode | 0..4 | LSB, USB, CW, FM, AM | como el menú: fija paso y filtro (CW: filtro 500, NR 0) y reprograma | no |
| 002 | Filter BW | 0..7 | Full, 3000, 2400, 1800, 500, 200, 100, 50 Hz | — | sí |
| 003 | Band | 0..10 | 160, 80, 60, 40, 30, 20, 17, 15, 12, 10, 6 m | memoria de banda, LPF y SI5351 | no |
| 004 | Tune Rate | 0..9 | 10M, 1M, 0.5M, 100k, 10k, 1k, 0.5k, 100, 10, 1 | — | sí |
| 005 | VFO Mode | 0..1 | A, B | conmuta A/B (igual que `FR`) | no |
| 006 | RIT | 0..1 | off/on (on = +1 Hz) | como `RT` | no |
| 007 | AGC | 0..2 | OFF, Fast, Slow | — | sí |
| 008 | NR | 0..8 | 0 off, 1, ≥ 2 puerta de ruido | — | sí |
| 009 | ATT | 0..7 | 0, −13, −20, −33, −40, −53, −60, −73 dB | atenuador analógico | no |
| 010 | ATT2 | 0..16 | atenuación digital (CIC) | — | sí |
| 011 | S-meter | 0..4 | OFF, dBm, S, S-bar, wpm | (con CAT el firmware lo pone a 0 para no escribir en la LCD) | sí |
| 012 | CW Decoder | 0..1 | off/on | — | sí |
| 013 | Semi QSK | 0..1 | off/on | — | sí |
| 014 | Keyer Speed | 1..60 | wpm | recalcula tiempos | no |
| 015 | Keyer Mode | 0..2 | Iambic A, Iambic B, Straight | — | no |
| 016 | Keyer Swap | 0..1 | off/on | — | sí |
| 017 | Practice | 0..1 | off/on | — | sí |
| 018 | VOX | 0..1 | off/on | — | sí |
| 019 | Noise Gate | 0..255 | umbral del VOX | — | sí |
| 020 | TX Drive | 0..8 | 8 = amplitud constante | — | sí |
| 021 | CQ Interval | 0..60 | s | — | sí |
| 022 | CQ Message | — | texto | **no disponible por CAT** | — |
| 023 | PA Bias min | 0..254 | | rehace la tabla del PA | no |
| 024 | PA Bias max | 1..255 | | rehace la tabla del PA | no |
| 025 | Ref freq | 14000000..28000000 | Hz del cristal (calibración) | reprograma el SI5351 | no |
| 026 | IQ Phase | 0..180 | grados | reprograma el SI5351 | no |
| 027 | Backlight | 0..1 | off/on | — | sí |
| 028 | Mic Atten | 0..4 | 6 dB por paso | — | sí |
| 029 | DIGI Mode | 0..1 | off/on (TX plano para FT8) | — | sí |
| 030 | TX Comp | 0..3 | recorte de envolvente | — | sí |
| 031 | TX LoCut | 0..3 | off, ≈100, 200, 350 Hz | — | sí |
| 032 | AGC Start | 0..1 | off/on (precarga x8 al arrancar) | — | sí |
| 033 | AGC Hang | 1..8 | retención (n−1)·0,1 s; 1 = legacy | — | sí |
| 034 | TX EnvPre | 0..3 | preénfasis de envolvente | — | sí |

«TX = no» significa que el parámetro tiene efecto sobre RF, LCD o tiempos y se rechaza con `?;`
mientras la radio transmite. Los demás se aceptan en TX.

## Notas

- **VFO (005)**: equivale a `FR0;`/`FR1;`. Conmutar no altera la frecuencia guardada del otro VFO.
- **Backlight (027)**: el valor de fábrica es 8 (legacy), fuera del rango 0..1; se lee `8` hasta
  que se escribe 0 o 1.
- **PA Bias**: el menú limita `min < max` mientras se edita; por CAT, si `max < min`, el efecto
  sube `max` a `min` (no se graba en EEPROM hasta la siguiente edición).
- **Lectura inicial**: 35 lecturas a 1 cada 120 ms ≈ 4,2 s. No hace falta sondearlas en bucle:
  solo cambian desde el menú de la radio o por CAT.
