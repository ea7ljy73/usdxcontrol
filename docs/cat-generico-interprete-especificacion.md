# Especificación — Intérprete CAT genérico completo (`PN`) para uSDX Plus Orange

**Proyecto solicitante:** usdxcontrol (cliente de control de escritorio/web para el uSDX).
**Firmware de referencia:** usdx_plus_orange v2.1.0 (su repo se mantiene como referencia de solo lectura; esta spec es la pieza para entregar al equipo de firmware).
**Fecha:** octubre de 2026.
**Relación con otros documentos:** complementa `cat-extensiones-peticion.md` (P0–P3). Si se adopta este intérprete genérico, cubre y sustituye la propuesta puntual P2-1 (VO/AG/NR dedicados); el cliente soporta ambos modos.

---

## 1. Objetivo y alcance

Dar acceso por CAT (serie 38400 8N1, tramas `;`) a **todos los parámetros del menú del firmware** (35 ítems de `MENU[]`, `usdx_plus_orange.ino:377-430`) con un único mecanismo genérico de obtener y grabar, **sin inflar flash ni RAM**:

- Sin tablas nuevas: se reutiliza `MENU[]` (PROGMEM) tal cual, con su rango `min`/`max`, tipo, slot EEPROM y hook `on_change` ya existentes.
- Sin nombres por serie: el cliente lleva su propia copia estática de la tabla (nombres, rangos y unidades) generada del firmware stock; el firmware solo habla de índices y valores.
- Fuera de alcance: el único parámetro de texto (`CQ Message`) queda excluido por diseño (futuro comando aparte si hay presupuesto).

**Parámetros estrella a cubrir con este mismo mecanismo** (los que el cliente necesita de inmediato para operar el transceptor): Noise Gate (19), Mic Atten (28), DIGI Mode (29), TX Comp (30), TX LoCut (31), TX EnvPre (34), además de volumen, filtro, NR, ATT, drive, bias, calibración y keyer (tabla completa en §5).

## 2. Nomenclatura y diseño de tramas

Se introducen tramas nuevas con prefijo de dos letras `PN` (*Param*), sin conflicto con las ya usadas (FA, IF, MD, RX, TX, RT, RC, ID, PS, AI, AG, XT, FL, VX, RS, ni con el error `E;`/`?;`):

| Trama | Comando | Respuesta |
|---|---|---|
| `PNC;` | Descubrimiento: ¿existe el intérprete? | `PNC<nn>;` con el nº de parámetros soportados (35 en stock) |
| `PN<d>;` | Obtener el índice `<d>` (0..34, sin ceros a la izquierda) | `PN<d>,<v>;` con el valor vigente |
| `PN<d>,<v>;` | Grabar el índice `<d>` con el valor `<v>` | **Ninguna** (silencioso, igual que el `FA…;` de hoy) |
| Índice o valor fuera de rango | — | `?;` (rechazo explícito, sin efectos en la radio) |

Reglas de formato:

- `<d>` e `<v>` en decimal ASCII, sin ceros a la izquierda (excepto el propio 0) y sin signo, salvo el caso de valores con signo del firmware (§5): para valores negativos se antepone `-`.
- El buffer `CATCMD_SIZE` (40 bytes, `cat.h:13`) alcanza de sobra para `PN25,27000000;`.
- Igual que hoy: termina en `;`, y el bucle de gestión (`cat_serial_event`, `cat.h:200-219`) procesa una trama a la vez.

## 3. Semántica

1. Validación **antes** de tocar nada: comprobar `d < MENU_COUNT` y luego `min <= v <= max` del `MenuParam` correspondiente. Si falla algo → única trama `?;` y sin más efectos (los rangos exactos están en §5 y en `MENU[]`).
2. Escritura: copiar `<v>` a la variable apuntada por `&var` respetando el tipo (`P_T8S` int8, `P_T8` uint8, `P_T16`, `P_T32`, `P_ENUM` como uint8 indexado desde `min`), invocar el hook `on_change` si existe (misma vía que la página del menú: `on_att()`, `on_pwm()`, `loadWPM()` &co.) y dejar la persistencia EEPROM al código estándar del menú (`menu_eeprom_save()`, `menu.h:177-196`): **los ajustes que cambian por CAT sobreviven al reinicio igual que si se cambian con el dial**.
3. Los parámetros que cambian el aspecto en caliente (modo, banda, VFO) si se graban durante TX: se recomienda que el firmware diferir la aplicación real hasta volver a RX (por ejemplo con el mismo mecanismo de diferido que `cat_apply()` usa hoy para `FA`/`MD`); la decisión final es del equipo firmware.
4. Coherencia con la pantalla: los setters ya existen para cada param del menú; no hay código nuevo por parámetro, solo el dispatcher común.
5. `PN1` (mode) y `MD` escriben la misma variable `mode` — no hay divergencia de estado posible por diseño.

## 4. Descubrimiento y compatibilidad (requisito del cliente)

- Al conectar, el cliente manda **una sola vez** `PNC;`.
  - Responde `?;` o `E;` → firmware stock: el cliente **no volverá a enviar comandos `PN` en toda la sesión** y mostrará el panel de parámetros deshabilitado con la nota «requiere firmware ampliado» (mismo criterio que el descubrimiento de P2-1 para `VO/AG/NR/SM`).
  - Responde `PNC<nn>;` → el cliente fija `nn` como nº de parámetros válidos y lanza la lectura inicial completa: la cola ya le permite 8 tramas/s (hueco ≥ 120 ms), así que 35 lecturas necesitan unos 4,4 s en segundo plano.
- Tras la primera lectura, el cliente no sondea los 35 en bucle: solo re-lee al arrancar y tras un cambio por su parte (para confirmar); si el equipo lo pide, cabe una re-lectura completa al volver de TX largo. El tráfico queda regulado por el cliente con sus reglas ya documentadas (1 comando en vuelo, hueco ≥ 120 ms).
- Consecuencia: **con flash stock el coste para la radio es cero**; un usuario con firmware viejo no activa el panel y no ve tráfico adicional.

## 5. Tabla de parámetros (referencia para el equipo)

Índice `PN<d>` **es el orden de iteración de `memcpy_P` sobre `MENU[]`** cuando se recorre (mismo patrón que `save_menu_eslot()`, `.ino:222-232`); el equipo del firmware debe confirmar los índices exactos contra su orden en `usdx_plus_orange.ino:377-430` — el cliente valida con `PNC;` + prueba de cada índice e ignora con `?;` los que no existan. Los rangos y defaults provienen de los inicializadores compilados del stock.

| ⭐/– | Nombre (menú) | Var | Tipo / rango | Default | eslot |
|---|---|---|---|---|---|
| – | Volume | `volume` (int8) | −1..16 | 12 | 1 |
| – | Mode | `mode` | enum 0..4 (LSB/USB/CW/FM/AM) | 1 (USB) | 2 |
| – | Filter BW | `filt` | enum 0..7 (Full…50 Hz) | 0 | 3 |
| – | Band | `bandval` | enum 0..10 (160m..6m) | 3 (40m) | 4 |
| – | Tune Rate | `stepsize` | enum 0..9 (10M…1) | 5 (1k) | 5 |
| – | VFO Mode | `vfosel` | enum 0..1 (A/B) | 0 | 6 |
| – | RIT | `rit` (encendido) | enum 0..1 (OFF/ON) | 0 | 7 |
| – | AGC | `agc` | enum 0..2 (OFF/Fast/Slow) | 1 | 8 |
| – | NR | `nr` | 0..8 | 0 | 9 |
| – | ATT | `att` | enum 0..7 (0…−73 dB) | 0 | 10 |
| – | ATT2 | `att2` | 0..16 | 2 | 11 |
| – | S-meter | `smode` | enum 0..4 (OFF/dBm/S/S-bar/wpm) | 1 | 12 |
| – | CW Decoder | `cwdec` | enum 0..1 | 1 | 15 |
| – | Semi QSK | `semi_qsk` | enum 0..1 | 0 | 16 |
| – | Keyer Speed | `keyer_speed` | 1..60 | 25 | 13 |
| – | Keyer Mode | `keyer_mode` | enum 0..2 (IambicA/B/Visual) | 2 | 14 |
| – | Keyer Swap | `keyer_swap` | enum 0..1 | 0 | 21 |
| – | Practice | `practice` | enum 0..1 | 0 | 17 |
| – | VOX | `vox` | enum 0..1 | 0 | 18 |
| ⭐ | Noise Gate | `vox_thresh` | 0..255 | 4 | 19 |
| – | TX Drive | `drive` | 0..8 | 4 | 20 |
| – | CQ Interval | `cw_msg_interval` | 0..60 | 5 | 25 |
| – | CQ Message | `cw_msg` | P_TEXT (48 ch) | «CQ CQ DE…» | 26 |
| – | PA Bias min | `pwm_min` | 0..254 (dinámico ≤ pwm_max) | 0 | 27 |
| – | PA Bias max | `pwm_max` | 1..255 (dinámico > pwm_min) | 128 | 28 |
| – | Ref freq | `si5351.fxtal` (uint32) | 14.000.000..28.000.000 | 27.000.000 | 29 |
| – | IQ Phase | `rx_ph_q` | 0..180 | 90 | 30 |
| – | Backlight | `backlight` | enum 0..1 (default legacy 8, revisar) | 8 | 31 |
| ⭐ | Mic Atten | `mic_atten` | 0..4 (6 dB por paso) | 0 | 22 |
| ⭐ | DIGI Mode | `dig_mode` | enum 0..1 (OFF/ON) | 0 | 23 |
| ⭐ | TX Comp | `comp_enable` | 0..3 (clipper +3,5…+8 dB) | 0 | 24 |
| ⭐ | TX LoCut | `tx_lowcut` | 0..3 (off/≈100/200/400 Hz) | 0 | 32 |
| – | AGC Start | `agc_start` | enum 0..1 | 0 | 33 |
| – | AGC Hang | `agc_hang` | 1..8 (×0,1 s) | 1 | 34 |
| ⭐ | TX EnvPre | `tx_envpre` | 0..3 (c1 = 0,5 + n/2) | 0 | 37 |

Notas de la tabla:

- ⭐ marca los seis parámetros que motivan esta petición (ruido, micrófono, modos digitales y forma del TX); el resto queda cubierto por ser el mismo mecanismo.
- El CQ `Message` (P_TEXT) no participa en `PN`; el resto de parámetros sin texto sí.
- El RIT **on/off** es el índice 6; el **offset** sigue por el comando dedicado propuesto en P1-2 (`RT±nnnn;`), no por `PN`, porque el dial también toca `rit` y así se evita el doble dueño del dato.
- Valores con signo solo en `volume` (int8): la trama puede llevar `-` (p. ej. `PN0,-1;`).

## 6. Diseño de mínimo recurso (guía para el equipo)

Aproximación de implementación (no vinculante, ~30 líneas en `cat.h`):

```c
// dentro de analyseCATcmd(), junto a los otros casos:
// trama tras strip: 'P' 'N' + opcional 'C'
if (cmd[0]=='P' && cmd[1]=='N') {
  if (cmd[2]=='C') { rcat = sprintf_P(buf, PSTR("PNC%d;"), MENU_COUNT); goto send; }
  // parse índice y valor: strtol s/strchr(',')
  // buscar MenuParam por índice (memcpy_P del struct), validar rango
  // escritura por tipo, memcpy del valor + hook on_change (uint8 id)
  // lectura: formatear <=5 dígitos (o 8 en fxtal) -> "PN<d>,<v>;"
}
```

- **Flash:** el dispatcher es un caso más del `switch` existente; se recomienda un único punto de formateo/parseo compartido. Estimación ≈ 0,3–0,5 KB (flash está al 95 %, así que valdría compilarlo bajo flag `#define CAT_PN` y que quien lo use lo active en su build, mismo criterio que otras opciones del firmware).
- **RAM:** cero bytes nuevos gracias a la tabla declarada en PROGMEM `MENU[]` (y buffers ya reservados del CAT).
- **CPU:** una trama entrante se despacha en unos pocos µs; nada por segundo en reposo (solo se responde a requests).
- **Riesgo controlado:** los cambios por CAT usan el mismo hook y persistencia que el menú, así que no hay código específico por parámetro: solo un dispatcher genérico.

## 7. Pruebas a añadir a `tests/fw_sim/cat_sim.cpp`

| Id | Prueba |
|---|---|
| C22 | `PNC;` → `PNC35;` (fiel iteración de MENU[ ]) |
| C23 | `PN19;` → `PN19,4;` y `PN30;` → `PN30,0;`; `PN34;` → `PN34,0;` |
| C24 | `PN19,10;` (noise gate) y `PN28,2;` (mic atten) — queda persistido en EEPROM y visible en el menú tras reinicio |
| C25 | `PN30,4;` → `?;` (fuera de rango 0..3) y sin efectos en el var |
| C26 | `PN40;` → `?;` (índice fuera de MENU_COUNT) |
| C27 | `PN0,-1;` → se acepta el valor con signo del int8 y persiste correcto |
| C28 | `PN25,27000000;` → el SI5351 recalibra con el nuevo cristal (uint32 de 8 dígitos en la trama) |
| C29 | firmware stock sin `CAT_PN`: `PNC;` → `?;` y el cliente no reenvía `PN` ninguna vez (estado del panel deshabilitado) |
| C30 | tras grabar `PN28,2;` en RX y en TX la aplicación espera a volver a RX (según regla §3.3) |

## 8. Compromiso del comportamiento del cliente

- El cliente nunca asume: usa `PNC;` como puerta, no reenvía `PN` a firmware stock, respeta 1 comando en vuelo + 120 ms + 500 ms de sondeo de estado (FA/IF) y por CAT trae solo los params que el usuario toca en el panel.
- Si un `PN` recibe `?;` el cliente marca el parámetro como invalidado en la UI y no reenvía el comando hasta que el estado llegue por lectura; nunca reintenta a ciegas.
- El panel de parámetros del cliente muestra sliders con unidades y descripciones para los ⭐ (Noise Gate, Mic Atten, DIGI Mode, TX Comp, TX LoCut, TX EnvPre) y widgets simples para el resto; es solo presentación, toda la lógica es la de `PN`.

---

*Document only: en este paso no se modifica ni el firmware ni `usdx-lab`; la pieza de código del §6 es una guía orientativa para el equipo de firmware.*
