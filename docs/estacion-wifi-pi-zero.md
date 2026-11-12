# Estación WiFi con Raspberry Pi Zero 2 W

> **Estado: propuesta, sin implementar ni probar en hardware.**
> La opción con el ESP32 dentro del uSDX está en [estacion-wifi-esp32.md](estacion-wifi-esp32.md).

## 1. Objetivo

Manejar el uSDX **sin cables hasta el ordenador**, como una mesa de mezclas digital:

1. El equipo crea su propia WiFi o se une a la de casa.
2. Cualquier móvil, tablet u ordenador abre usdxcontrol en el navegador.
3. Nada que instalar en el cliente.

Una Raspberry Pi Zero 2 W va **pegada a la caja del uSDX y con su propia alimentación**. Hace todo el trabajo: CAT, audio, FT8/FT4 y el espectro del SDR. Los navegadores solo muestran el estado y envían órdenes.

**Ventajas frente al ESP32:**

- No hay que abrir ni modificar el uSDX. Al quitar la Pi, la radio queda como estaba.
- La potencia sobra para decodificar FT8.
- Se mantiene el **RTL-SDR** con la banda completa.
- Se reaprovecha casi todo el código:
  - El motor FT8 (WASM).
  - El cálculo del espectro IQ (`features/sdr/domain`).
  - El acceso al puerto serie y a `rtl_tcp` (`src/main`).
- Es fácil servir HTTPS, que abre la puerta a la fonía con el micro de la tablet.

## 2. Esquema

```
                        ┌──────────── Raspberry Pi Zero 2 W ─────────────┐
 uSDX UART (PD0/PD1) ◄──┤ CAT        servidor usdxcontrol (Node)         │
 uSDX auriculares ─────►│ audio RX   · web estática (HTTPS)              │◄── WiFi ──► móvil / tablet / PC
 uSDX MIC ◄─────────────┤ audio TX   · WebSocket: CAT, FT8, espectro     │            (solo navegador)
 RTL-SDR (su antena) ──►│ USB        · FT8/FT4 y FFT del SDR en la Pi    │
                        └──────────── alimentación propia 5 V ───────────┘
```

## 3. Hardware

### Material

| Pieza | Notas |
| --- | --- |
| Raspberry Pi Zero 2 W | 4 núcleos a 1 GHz y 512 MB. WiFi 2,4 GHz integrada |
| Tarjeta microSD de 16 GB o más | Raspberry Pi OS Lite de 64 bits |
| Alimentación 5 V / 2,5 A | Aparte de la del uSDX, con ferrita |
| RTL-SDR V3 o un clon (HTOOL) | Con **su propia antena**, o con un conmutador o limitador si comparte la del uSDX |
| Aisladores de audio 600:600 (2) | Evitan zumbido por el bucle de masa entre las dos alimentaciones |
| Ferritas de clip | En todos los cables entre la Pi y el uSDX |
| Caja o soporte | Fijada a la caja del uSDX, con cables cortos |

### Conexión: dos variantes

| | **A. Por USB** (sin soldar en la Pi) | **B. Por pines** (más compacta) |
| --- | --- | --- |
| CAT | El USB-TTL de 5 V que ya tienes | UART de la Pi (GPIO14/15, 3,3 V) con **adaptador de niveles** 3,3 ↔ 5 V |
| Audio | Tarjeta de sonido USB con entrada de línea | Placa de audio I2S sobre la Pi (tipo WM8960) |
| SDR | RTL-SDR por USB | RTL-SDR por USB |
| Lo que hace falta | Hub USB OTG: la Zero solo tiene un puerto | Soldar el adaptador de niveles y la placa I2S |

**Lado uSDX:** igual que en la estación con PC (`GUIA_ESTACION_PC.md` del firmware).

- **CAT:**
  - Pines PD0/PD1, que comparte con el LCD mediante 2 × 1 kΩ y un diodo 1N4148 en PC2.
  - Puerto a 38400 8N1.
- **Audio de RX:** salida de auriculares → aislador → entrada de línea.
- **Audio de TX:**
  - Salida → divisor de 10 kΩ y 100 Ω → condensador de 1–10 µF → MIC.
  - En el menú del uSDX: `29 DIGI Mode = ON` y `18 VOX = OFF`.

## 4. Software en la Pi

Es un **servicio Node** (systemd) con estas piezas:

| Pieza | Qué hace | De dónde sale |
| --- | --- | --- |
| Servidor web HTTPS | Sirve la versión web de usdxcontrol (1,6 MB) | `pnpm build` |
| Puente CAT | Abre el puerto serie y reparte el estado por WebSocket. Respeta las pausas del firmware (≥ 120 ms entre tramas y `IF;` cada 500 ms) | Lógica del enlace de Electron (`src/main`) |
| Audio | Captura y reproduce por ALSA a 12 kHz, mono, 16 bits | Nuevo |
| FT8/FT4 | Decodifica cada ciclo, genera la señal de TX y lleva la secuencia del QSO | `features/digital` (motor WASM y `ft8Operator`) ejecutado en Node |
| SDR | `rtl_tcp` o librtlsdr local, FFT en la Pi, envía las líneas ya calculadas (≈ 100 kB/s) | `features/sdr/domain` (`iqSpectrum`, `sdrTuning`) |
| Seguridad de PTT | Corta la TX sin intervención (detalle en §6) | Nuevo |
| Red | Punto de acceso propio («uSDX-XXXX») o cliente de la WiFi de casa, con nombre `usdx.local` (mDNS) | Configuración del sistema |

**Rendimiento previsto:**

- La decodificación FT8 de un ciclo cabe holgada en los 4 núcleos.
- El SDR conviene dejarlo en **1,024 MS/s**: la Zero va desahogada y 40 m sigue viéndose entera.

## 5. Cambios en usdxcontrol (cliente)

Hay que añadir un modo nuevo, **«Estación WiFi»**. Gracias a la arquitectura hexagonal son adaptadores nuevos detrás de los puertos que ya existen; la interfaz casi no cambia.

| Puerto | Adaptador actual | Adaptador nuevo |
| --- | --- | --- |
| `RadioLink` | WebSerial o Electron | `webSocketRadioLink` |
| Receptor y operador FT8 | Motor en el navegador con la tarjeta de sonido | Estado remoto: la Pi decodifica y transmite; el navegador muestra lo decodificado y envía las órdenes (CQ, responder, Halt…) |
| `SdrConnector` | WebUSB o `rtl_tcp` | Líneas de espectro por WebSocket |
| Escucha (opcional) | — | Audio de RX enviado al navegador |

**Varios clientes a la vez:**

- Todos ven el mismo estado.
- **Solo uno controla la TX** en cada momento, con un aviso de quién la tiene.

## 6. Seguridad

- **Corte de PTT en la Pi**, imprescindible. La TX se corta sola si pasa cualquiera de estas cosas:
  - el cliente que transmite deja de enviar su señal de vida (por ejemplo, 2 s);
  - se supera un tiempo máximo de TX;
  - se reinicia el servicio.
- **Contraseña** para operar. Sin ella solo se puede ver.
- **HTTPS** con un certificado propio, aceptado una vez en cada dispositivo. Hace falta para el micro y el audio en tiempo real en el navegador.
- **Punto de acceso** con WPA2 y contraseña.

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Zumbido por bucle de masa (dos alimentaciones) | Aisladores de audio y una sola masa común en el CAT |
| RF de la TX que entra en la Pi o en el audio | Ferritas, cables cortos, Pi en caja metálica |
| Ruido de la Pi o de la WiFi en el receptor de HF | Separación física y filtrado de la alimentación de la Pi |
| La Zero 2 W se queda corta con el SDR y FT8 a la vez | Muestreo de 1,024 MS/s y menos líneas de espectro por segundo |
| Latencia en fonía | WebRTC con Opus (≈ 100–200 ms). Para FT8 no importa |

## 8. Fases

Cada fase se valida antes de pasar a la siguiente. **No se transmite** hasta tener la recepción y el CAT validados.

1. **Servidor y CAT por WiFi.**
   - Web servida desde la Pi, CAT por WebSocket, corte de PTT y contraseña.
   - *Prueba:* desde el móvil se cambian frecuencia y modo. Al cortar la WiFi en TX, el PTT cae en ≤ 2 s.
2. **Audio y FT8 en la Pi.**
   - *Prueba:* la Pi decodifica un ciclo en directo antes de que empiece el siguiente, y se completa un QSO desde la tablet.
3. **SDR en la Pi.**
   - *Prueba:* la cascada de 40 m se ve completa en la tablet y se pausa durante la TX.
4. **Escucha remota y fonía.**
   - *Prueba:* se oye el audio de RX en la tablet y se hace un QSO de fonía con el micro de la tablet.
5. **Montaje definitivo.**
   - Caja, fijación y prueba de interferencias en todas las bandas.

## 9. Decisiones pendientes

- Conexión por USB (A) o por pines (B).
- Punto de acceso propio, WiFi de casa o las dos cosas.
- Si la fase 4 (fonía desde la tablet) entra en el alcance o se queda en mejora futura.
