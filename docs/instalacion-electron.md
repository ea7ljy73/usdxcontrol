# Instalación de la app de escritorio (Electron)

## Artefactos

`pnpm dist` genera:

- `dist-instalador/usdxcontrol-0.0.0.AppImage` — Linux, portable, sin instalación.
- `dist-instalador/usdxcontrol-0.0.0.deb` — Linux Debian/Ubuntu.
- En Windows/macOS (con la herramienta de la plataforma disponible): NSIS `.exe` / `.dmg`.

## Linux

```sh
# AppImage: descargar y ejecutar
chmod +x usdxcontrol-0.0.0.AppImage
./usdxcontrol-0.0.0.AppImage

# deb: instalar en el sistema
sudo dpkg -i usdxcontrol-0.0.0.deb
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

- Instalador NSIS: ejecutar `usdxcontrol Setup 0.0.0.exe`.
- Driver: si el puerto no aparece, instala el driver del convertidor
  USB-serial (CH340/CP210x) del adaptador usado con el uSDX.

## Cableado y parámetros

- UART del uSDX: 38400 baudios, 8N1 (fijo).
- El firmware solo acepta un comando por trama con pausas; la app ya respeta
  los huecos necesarios (≥120 ms entre tramas, encuesta `IF;` cada 500 ms).
- No desconectar el cable durante transmisión: los cambios de frecuencia/modo
  enviados en TX se aplican al volver a RX.
