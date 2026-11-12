# Estación WiFi con ESP32-S3 dentro del uSDX

> **Estado: propuesta, sin implementar ni probar en hardware.**
> La alternativa con una Raspberry Pi fuera de la caja está en [estacion-wifi-pi-zero.md](estacion-wifi-pi-zero.md).

## 1. Objetivo

Que el uSDX tenga **WiFi integrada**, como una mesa de mezclas digital:

1. El equipo crea su propia WiFi o se une a la de casa.
2. Cualquier móvil, tablet u ordenador abre usdxcontrol en el navegador.
3. Hacia fuera solo salen la **alimentación y la antena**.

Un ESP32-S3 con un códec de audio va **dentro de la caja**, alimentado por la radio. Hace de puente del CAT y del audio, decodifica FT8 y sirve la web.

**Ventajas frente a la Pi:**

- Todo integrado y sin cajas añadidas.
- Bajo consumo (≈ 100–250 mA).
- Arranque inmediato.

**Lo que se pierde:**

- El **RTL-SDR**, porque el USB del ESP32 (12 Mbit/s) no da para su caudal (≈ 32 Mbit/s). Queda el espectro de audio de unos 3 kHz.
- La fonía con el micro de la tablet es difícil: necesita HTTPS, que en el ESP32 es lento y engorroso.

## 2. Esquema

```
 ┌──────────────────────────── caja del uSDX ────────────────────────────┐
 │  ATmega328P UART (PD0/PD1, 5 V) ◄─ niveles 5↔3,3 V ─► ESP32-S3 UART  │
 │  salida auriculares ─────────────────────────────────► códec (ADC)   │
 │  MIC (PC2) ◄─ divisor + condensador ◄───────────────── códec (DAC)   │
 │  regulador del uSDX ─► 3,3 V (LDO propio) ───────────► ESP32 + códec │
 └───────────────────────────────────────────────────────────────────────┘
                              ESP32-S3 ◄── WiFi ──► móvil / tablet / PC (solo navegador)
```

## 3. Hardware

### Material

| Pieza | Notas |
| --- | --- |
| Módulo ESP32-S3 con **PSRAM** (8 MB) y 8–16 MB de flash | La PSRAM es necesaria para FT8 (búferes de 15 s de audio) |
| Códec de audio I2S de 16 bits (tipo ES8311) | Entrada y salida mono, configurable por I2C |
| Adaptador de niveles 5 ↔ 3,3 V | En la línea TX del ATmega → RX del ESP32 basta un divisor. En la otra dirección, mejor un adaptador que fiarse del umbral del ATmega |
| LDO de 3,3 V y 500 mA con su filtrado | Alimenta el ESP32 desde el regulador del uSDX sin meter ruido |
| Antena del ESP32 | La integrada en el módulo o una exterior pequeña (u.FL) si la caja es metálica |
| Ferritas y blindaje | Contra la RF de la propia TX y contra el ruido digital hacia el receptor |

### Conexiones en el uSDX

Los mismos puntos que hoy usa el cable USB-TTL (`GUIA_ESTACION_PC.md` del firmware):

- **CAT:**
  - PD0/RXD (pin 2) y PD1/TXD (pin 3) del ATmega328P, que los comparte con el LCD mediante 2 × 1 kΩ y el diodo 1N4148 en PC2.
  - Puerto a 38400 8N1.
- **Audio de RX:** salida de auriculares → entrada del códec, con condensador de desacoplo.
- **Audio de TX:** salida del códec → divisor de 10 kΩ y 100 Ω → condensador de 1–10 µF → MIC (PC2).
- **Menú del uSDX:** `29 DIGI Mode = ON` y `18 VOX = OFF`.
- **Antes de soldar:** comprueba los pines en el esquema de tu placa.

## 4. Firmware del ESP32 (C/C++, ESP-IDF o Arduino)

| Pieza | Qué hace |
| --- | --- |
| Servidor web | Sirve la versión web de usdxcontrol desde la flash (1,6 MB, comprimida con gzip) |
| WebSocket | Estado y órdenes para todos los clientes conectados |
| Puente CAT | UART a 38400. Respeta las pausas del firmware (≥ 120 ms entre tramas y `IF;` cada 500 ms) y reparte el estado |
| Audio | Códec I2S a 12 kHz, mono, 16 bits |
| FT8/FT4 | `ft8_lib` (C, pensada para equipos pequeños): decodificar cada ciclo, generar la señal de TX y llevar la secuencia del QSO |
| Espectro de audio | FFT del audio de RX y envío de las líneas ya calculadas |
| Seguridad de PTT | Corta la TX sin intervención (detalle en §6) |
| Red | Punto de acceso propio («uSDX-XXXX») o cliente de la WiFi de casa, nombre `usdx.local` (mDNS) y página de configuración inicial |
| Actualización | Firmware por WiFi (OTA) |

**Todo funciona por HTTP sin certificados:** la tablet no maneja audio en tiempo real, solo muestra el estado y envía órdenes.

## 5. Cambios en usdxcontrol (cliente)

Hay que añadir un modo nuevo, **«uSDX WiFi»**, con adaptadores nuevos detrás de los puertos que ya existen:

| Puerto | Adaptador actual | Adaptador nuevo |
| --- | --- | --- |
| `RadioLink` | WebSerial o Electron | `webSocketRadioLink` |
| Receptor y operador FT8 | Motor en el navegador con la tarjeta de sonido | Estado remoto: el ESP32 decodifica y transmite; el navegador muestra lo decodificado y envía las órdenes |
| Espectro | Audio local o SDR | Líneas de espectro de audio desde el ESP32 |
| SDR | WebUSB o `rtl_tcp` | No disponible en este modo |

**Varios clientes a la vez:**

- Todos ven el mismo estado.
- **Solo uno controla la TX** en cada momento.

## 6. Seguridad

- **Corte de PTT en el ESP32**, imprescindible. La TX se corta sola si pasa cualquiera de estas cosas:
  - el cliente deja de enviar su señal de vida (por ejemplo, 2 s);
  - se supera un tiempo máximo de TX;
  - el ESP32 se reinicia (el watchdog deja el PTT en reposo).
- **Contraseña** para operar. Sin ella solo se puede ver.
- **Punto de acceso** con WPA2 y contraseña.

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **El ESP32-S3 no decodifica FT8 a tiempo** (≈ 2 s por ciclo) | Es lo primero que se mide (fase 1). Si no llega, pasar a la [opción con la Pi Zero](estacion-wifi-pi-zero.md) |
| Ruido de la WiFi o de la parte digital en el receptor de HF | LDO y filtrado propios, blindaje, ESP32 lejos de la entrada de RF, pruebas banda a banda |
| La RF de la TX cuelga el ESP32 o mete ruido en el audio | Ferritas, desacoplo, antena del ESP32 alejada de la del uSDX |
| Poco sitio dentro de la caja del uSDX+ | Módulo pequeño. Si no cabe, va en una caja adosada (pierde parte de la ventaja) |
| Consumo añadido en el regulador del uSDX | Medir. Si va justo, LDO alimentado directamente de la entrada de 12 V |
| Escritura en el LCD que bloquea el UART (heredado del firmware) | Sondeo ≥ 120 ms, como ya hace usdxcontrol |

## 8. Fases

Cada fase se valida antes de pasar a la siguiente. **No se transmite** hasta tener la recepción y el CAT validados.

1. **Prueba de viabilidad, fuera de la caja.**
   - ESP32-S3 con códec, sin conectar a la radio.
   - *Prueba:* decodificar con `ft8_lib` la grabación de muestra (`sample_ft8.wav`) en menos de 2 s y con los mismos resultados que el navegador.
   - **Esta fase decide si se sigue o se pasa a la Pi.**
2. **CAT por WiFi.**
   - Web servida desde el ESP32, puente CAT, corte de PTT y contraseña.
   - *Prueba:* desde el móvil se cambian frecuencia y modo. Al cortar la WiFi en TX, el PTT cae en ≤ 2 s.
3. **Audio y FT8 en directo.**
   - *Prueba:* se decodifican ciclos reales y se completa un QSO desde la tablet.
4. **Montaje dentro del uSDX.**
   - *Prueba:* comparar el ruido de fondo en cada banda con el ESP32 encendido y apagado, y transmitir a plena potencia sin cuelgues.
5. **Opcional: escucha remota.**
   - Audio de RX al navegador con 1–2 s de retraso, solo para escuchar.

## 9. Decisiones pendientes

- Módulo concreto (con antena integrada o exterior) y códec.
- Punto de acceso propio, WiFi de casa o las dos cosas.
- Alimentación desde el regulador de 5 V del uSDX o desde la entrada de 12 V.
