# Installing the desktop app (Electron)

*[Versión en español](../es/instalacion.md)*

## Packages

The installers for every version are on [Releases](https://github.com/ea7ljy73/usdxcontrol/releases). `pnpm dist` builds them locally into `dist-instalador/`:

- `usdxcontrol-<version>-linux-x86_64.AppImage`: Linux, portable, no installation needed.
- `usdxcontrol-<version>-linux-amd64.deb`: Debian/Ubuntu Linux.
- `usdxcontrol-<version>-win-x64.exe` and `usdxcontrol-<version>-mac-{x64,arm64}.dmg`: built on Windows and macOS (CI does it).

## Linux

```sh
# AppImage: download and run
chmod +x usdxcontrol-<version>-linux-x86_64.AppImage
./usdxcontrol-<version>-linux-x86_64.AppImage

# deb: install system-wide
sudo apt install ./usdxcontrol-<version>-linux-amd64.deb
```

## Serial port access (uSDX over USB/UART)

The `serialport` binary needs read/write permission on the device (e.g. `/dev/ttyUSB0`). Add your user to the `dialout` group:

```sh
sudo usermod -aG dialout $USER
```

Optional udev rule for a stable name (`/etc/udev/rules.d/99-usdx.rules`); replace idVendor/idProduct with those of your CH340/CP210x cable (`lsusb`):

```
SUBSYSTEM=="ttyUSB", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE="0660", GROUP="dialout", SYMLINK+="usdx"
```

Reload with `sudo udevadm control --reload-rules && sudo udevadm trigger` and log in again so the group change applies.

## Windows

- Installer: run `usdxcontrol-<version>-win-x64.exe`. The app is not signed: if Windows shows *“Windows protected your PC”*, click **More info → Run anyway**.
- Driver: if the port does not show up, install the driver for the USB-serial converter (CH340/CP210x) of the adapter used with the uSDX.

## macOS

Open the `.dmg` (arm64 for Apple Silicon, x64 for Intel) and drag the app to Applications. The app is not signed, so the first time macOS blocks it: open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway** (on older macOS, right-click → *Open*). If macOS says the app *“is damaged”*, run `xattr -cr "/Applications/uSDX Control.app"` in Terminal. Allow microphone access when asked: the app uses it to hear the radio's sound card.

## Wiring and parameters

- uSDX UART: 38400 baud, 8N1 (fixed).
- The firmware accepts one command per frame with pauses; the app already keeps the required gaps between frames.
- Do not unplug the cable while transmitting: frequency/mode changes sent during TX are applied when the radio returns to RX.
