# Instalación de la app de escritorio (Electron)

*[English version](../en/installation.md)*

## Artefactos

Los instaladores de cada versión están en [Releases](https://github.com/ea7ljy73/usdxcontrol/releases). `pnpm dist` los genera en local en `dist-instalador/`:

- `usdxcontrol-<versión>-linux-x86_64.AppImage`: Linux, portable, sin instalación.
- `usdxcontrol-<versión>-linux-amd64.deb`: Linux Debian/Ubuntu.
- `usdxcontrol-<versión>-win-x64.exe` y `usdxcontrol-<versión>-mac-{x64,arm64}.dmg`: se compilan en Windows y macOS (lo hace la CI).

## Linux

```sh
# AppImage: descargar y ejecutar
chmod +x usdxcontrol-<versión>-linux-x86_64.AppImage
./usdxcontrol-<versión>-linux-x86_64.AppImage

# deb: instalar en el sistema
sudo apt install ./usdxcontrol-<versión>-linux-amd64.deb
```

## Acceso al puerto serie (uSDX por USB/UART)

El binario de `serialport` necesita permisos de lectura/escritura sobre el
dispositivo (p. ej. `/dev/ttyUSB0`). Instala una regla udev y añade tu usuario
al grupo `dialout`:

```sh
sudo usermod -aG dialout $USER
```

Regla udev opcional para nombres estables (`/etc/udev/rules.d/99-usdx.rules`),
sustituye el idVendor/idProduct por los de tu cable CH340/CP210x
(`lsusb`):

```
SUBSYSTEM=="ttyUSB", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0660", GROUP="dialout", SYMLINK+="usdx"
```

Recarga con `sudo udevadm control --reload-rules && sudo udevadm trigger` y
vuelve a iniciar sesión para que el cambio de grupo aplique.

## Windows

- Instalador: ejecuta `usdxcontrol-<versión>-win-x64.exe`. La app no está firmada: si Windows muestra *«Windows protegió su PC»*, pulsa **Más información → Ejecutar de todas formas**.
- Driver: si el puerto no aparece, instala el driver del convertidor
  USB-serial (CH340/CP210x) del adaptador usado con el uSDX.

## macOS

Abre el `.dmg` (arm64 para Apple Silicon, x64 para Intel) y arrastra la app a Aplicaciones. La app no está firmada, así que la primera vez macOS la bloquea: ábrela una vez, ve a **Ajustes del Sistema → Privacidad y seguridad** y pulsa **Abrir igualmente** (en macOS antiguos, clic derecho → *Abrir*). Si macOS dice que la app *«está dañada»*, ejecuta en Terminal `xattr -cr "/Applications/uSDX Control.app"`. Permite el acceso al micrófono cuando lo pida: la app lo usa para oír la tarjeta de sonido de la radio.

## Cableado y parámetros


- UART del uSDX: 38400 baudios, 8N1 (fijo).
- El firmware solo acepta un comando por trama con pausas; la app ya respeta
  los huecos necesarios (≥120 ms entre tramas, encuesta `IF;` cada 500 ms).
- No desconectar el cable durante transmisión: los cambios de frecuencia/modo
  enviados en TX se aplican al volver a RX.
