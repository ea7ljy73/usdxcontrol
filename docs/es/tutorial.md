# Tutorial: primeros pasos con uSDX Control

*[English version](../en/tutorial.md)* · Referencia completa: [manual de usuario](manual.md)

Este tutorial te lleva de la instalación a tu primer QSO en FT8 en unos 15 minutos. Al final tienes una tabla con **todas las opciones de configuración**, dónde están y su valor por defecto.

## Qué necesitas

- Un transceptor **uSDX** (uSDX Plus Orange con firmware **v2.2.0 o posterior** para tener volumen, AGC, NR y DIGI Mode por CAT; con firmware anterior funciona todo lo demás).
- El **cable USB** del uSDX (puerto CAT, USB-serie CH340 o CP210x).
- Una **tarjeta de sonido** conectada a la radio para FT8/FT4: la salida de audio del uSDX entra al ordenador y la salida del ordenador va a la entrada de micrófono del uSDX. Una tarjeta USB barata vale.
- Opcional: un **RTL-SDR** (V3 o clon) para ver la banda entera en el panadaptador.

## Paso 1 · Instalar y elegir idioma

1. Descarga el instalador de tu sistema desde [Releases](https://github.com/ea7ljy73/usdxcontrol/releases) e instálalo (detalles en la [guía de instalación](instalacion.md)).
2. En Linux, añade tu usuario al grupo `dialout` y vuelve a iniciar sesión: `sudo usermod -aG dialout $USER`.
3. Abre uSDX Control. La interfaz sale en el idioma del sistema; para cambiarlo usa el selector **ES · Español / EN · English** de la barra superior. La app lo recuerda.

## Paso 2 · Conectar la radio

1. Enchufa el uSDX por USB y enciéndelo.
2. En la barra superior, elige el **puerto serie** (en Windows `COM3`, `COM4`…; en Linux `/dev/ttyUSB0`) y pulsa **Conectar**.
3. El indicador pasa a **Conectado** y el dial muestra la frecuencia de la radio.

Prueba a mover la frecuencia: rueda del ratón sobre el dial o sobre el espectro, flechas ↑/↓ del teclado o los botones `<` `>`. El botón **1k** cambia el paso de sintonía.

## Paso 3 · Ver y oír la banda

1. En el menú izquierdo del panadaptador (botón ←) pulsa **Audio** y elige la entrada de la tarjeta de sonido de la radio. Verás el espectro y la cascada del audio recibido.
2. Para oír la radio por los altavoces del ordenador, pulsa **Sonido** en la barra superior y marca **Escuchar la radio en el PC**. Elige como *Altavoces* los del ordenador, nunca la tarjeta que va a la radio.
3. Haz **clic** en una señal del espectro para sintonizarla. **Doble clic** fija el dial para moverlo con los cursores.

## Paso 4 · Ajustar el audio para transmitir

Abre **Sonido** en la barra superior:

1. **Entrada (RX)**: la tarjeta por la que llega el audio del uSDX. Ajusta la *Ganancia de entrada* para que el medidor **RX** quede en la parte baja de la barra con la banda en silencio.
2. **Salida (TX)**: la tarjeta que va al uSDX. **No dejes «Predeterminada del sistema»**: suele ser la de los altavoces y la radio transmitiría sin señal.
3. **Nivel de transmisión**: entra en FT8 (paso 5), pulsa **Tune** y sube el nivel hasta que la potencia de salida deje de subir; no lo pases de ahí, porque saturarías la entrada de la radio y generarías armónicos. Vuelve a pulsar **Tune** (se corta solo a los 60 s).

## Paso 5 · Tu primer QSO en FT8

1. Pulsa **FT8** en *Mode*. La radio pasa a USB, se sintoniza en la frecuencia FT8 de la banda y, con firmware v2.2.0, activa el DIGI Mode.
2. Pulsa **Ajustes…** y escribe **Mi indicativo** y **Mi locator** (4 o 6 caracteres, por ejemplo `IM76` o `IM76hk`). Guarda.
3. Pulsa **Sincronizar hora**. FT8 necesita que el reloj tenga menos de 1 s de error.
4. Espera un par de ciclos de 15 s: en **Band Activity** aparecen los decodificados. Los CQ salen en verde.
5. **Doble clic** en un CQ. La app prepara los mensajes, habilita la TX y, con **Auto secuencia** activada, sigue sola el intercambio: reporte, RR73 y 73. Tu TX no se mueve de su sitio; con **TX en hueco libre** (activado de serie) se aparta antes de cualquier otra señal.
6. Al terminar se abre **Guardar QSO**: revisa los datos y pulsa **Guardar en el libro**.
7. En cualquier momento, **Halt TX** o la tecla **Esc** cortan la emisión.

Para comprobar hasta dónde llega tu señal, abre **PSK Reporter** en la barra FT8.

## Paso 6 (opcional) · Panorámico con un RTL-SDR

1. Pulsa **SDR** en la barra superior.
2. *Conexión*: **USB directo** (el RTL-SDR en el ordenador) o **Red · rtl_tcp** (escribe servidor y puerto).
3. En HF deja *Muestreo directo* en **Rama Q** (V3 y clones).
4. Pulsa **Conectar SDR**. El panadaptador muestra la banda entera y se pausa solo cuando el uSDX transmite desde la app.

En Linux y Windows hay que preparar antes el sistema: mira el apartado 6 del [manual](manual.md#6-receptor-sdr-rtl-sdr).

## Referencia de opciones y configuración

Todos los ajustes se guardan en el ordenador (en el perfil de la app o del navegador) y se conservan entre sesiones.

### General

| Opción | Dónde | Por defecto | Para qué |
| --- | --- | --- | --- |
| Idioma | Barra superior | Idioma del sistema (español o, si no, inglés) | Idioma de toda la interfaz y de los mensajes |
| Puerto serie | Barra superior | El primero de la lista | Puerto CAT del uSDX (38400 baudios, 8N1, automático) |
| Volumen | Barra superior | El de la radio | Volumen del uSDX (firmware v2.2.0) |
| Refresco del S-métrico | Panel RX | Normal (1 s) | Lento 6 s · Normal 1 s · Rápido 0,5 s. Cada lectura se oye como un chasquido en el uSDX |
| AGC | Panel RX o bandera | El de la radio | OFF · FAST · SLOW (firmware v2.2.0) |
| NR | Panel RX o bandera | El de la radio | Reducción de ruido 0–8 (firmware v2.2.0) |
| Paso de sintonía | Botón bajo el dial | 1 kHz | Paso del dial, la rueda, el arrastre y el scan |
| Estilo del espectro | Menú ← del panadaptador | Relleno | Relleno · Línea · Suave |
| Ancho del panadaptador | Menú ← del panadaptador | Banda | Banda entera o zoom fijo |
| Espectro de audio | Panel RX, cabecera *Audio* | Desplegado | Pliégalo para ganar sitio |

### Sonido

| Opción | Por defecto | Para qué |
| --- | --- | --- |
| Entrada (RX) | Predeterminada del sistema | Tarjeta por la que llega el audio del uSDX |
| Ganancia de entrada | 100 % | Nivel del audio recibido (medidor RX) |
| Salida (TX) | Predeterminada del sistema | Tarjeta que lleva el audio FT8/FT4 al uSDX. **Cámbiala a la de la radio** |
| Nivel de transmisión | 50 % | Ajústalo con *Tune* (paso 4) |
| Escuchar la radio en el PC | Desactivado | Oír lo recibido por los altavoces del ordenador |
| Altavoces (escucha) | Predeterminada del sistema | No puede ser la tarjeta de la radio |
| Volumen de escucha | 50 % | Volumen de la escucha en el PC |

### FT8 / FT4: Ajustes…

| Opción | Por defecto | Para qué |
| --- | --- | --- |
| Mi indicativo | (vacío) | Obligatorio para transmitir |
| Mi locator | (vacío) | 4 o 6 caracteres; se envía en el CQ y sirve para mapa y distancias |
| Cierre del QSO | RR73 | RR73 (recomendado) o RRR y 73 |
| Vigilante de TX | 6 min | Deja de transmitir si pasa ese tiempo sin que toques nada |
| Secuencia de TX | Automática | Automática: la contraria a la de la estación que contestas. Manual: siempre la de *Mi secuencia* |

### FT8 / FT4: panel de transmisión

| Opción | Por defecto | Para qué |
| --- | --- | --- |
| Auto secuencia | Activada | Sigue sola el intercambio del QSO |
| Call 1st | Activada | Tras tu CQ contesta a la primera estación que te llama |
| Hold Tx Freq | Desactivada | Al contestar o mover el RX, el TX se queda quieto |
| TX en hueco libre | Activada | Antes de transmitir, aparta tu TX de otras señales |
| Mi secuencia | Impar :15/:45 | Turno de TX (par :00/:30 o impar :15/:45) |
| Frecuencia de RX / TX | 1000 Hz | Clic y Mayús + clic en la cascada; TX entre 200 y 2300 Hz |

### FT8 / FT4: cascada (botón Ajustes de la cascada)

| Opción | Por defecto |
| --- | --- |
| Paleta | Clásica (también Espectro, Fuego, Verde) |
| Espectro | Visible |
| Velocidad | ×1 |
| Brillo | 1,0 |
| Contraste | 1,4 |
| Suelo de ruido | 0,10 |

### Receptor SDR

| Opción | Por defecto | Para qué |
| --- | --- | --- |
| Conexión | USB directo | USB directo o red (rtl_tcp, solo en la app de escritorio) |
| Servidor / puerto rtl_tcp | 127.0.0.1 / 1234 | Dirección del servidor `rtl_tcp` |
| Muestreo directo (HF) | Rama Q | Rama Q para V3 y clones; Desactivado para V4 o con upconverter |
| Ancho de muestreo | 2,048 MS/s | Más ancho: más banda visible y más CPU |
| Corrección | 0 ppm | Error de frecuencia del cristal del SDR |
| Ganancia | Automática | Automática o manual (0–49,6 dB) |
| Upconverter | 0 Hz | Desplazamiento del upconverter, si usas uno |
| Dejar de recibir mientras transmite el uSDX | Activado | Protege el SDR y evita pintar la propia emisión |

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| ↑ / ↓ | Subir o bajar un paso |
| `[` / `]` | Paso de sintonía más pequeño o más grande |
| `m` / `M` | Modo siguiente o anterior |
| Espacio (mantener) | PTT |
| Esc | Halt TX en FT8 (o soltar el dial fijado) |
| Mayús + F11 / F12 | Bajar o subir el TX de FT8 |

¿Algo no funciona? Mira la tabla de [problemas frecuentes](manual.md#7-problemas-frecuentes) o abre una [issue](https://github.com/ea7ljy73/usdxcontrol/issues).
