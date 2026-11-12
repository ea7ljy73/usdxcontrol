# uSDX Control

*English · [Español](README.es.md)*

Control a **uSDX** transceiver from your computer: panadapter and waterfall, VFO A/B, bands, modes, S-meter and PTT over CAT. It includes a complete **FT8/FT4** station (WSJT-X style) and supports an **RTL-SDR** as a panadapter receiver that goes quiet on its own while the uSDX transmits.

![FT8 station](docs/capturas/ft8.png)

## Downloads

> **Beta version.** It works and is used daily, but it may still have bugs. If you find one, please open an [issue](https://github.com/ea7ljy73/usdxcontrol/issues) with your system, version and what you were doing.

Installers for every version are on **[Releases](https://github.com/ea7ljy73/usdxcontrol/releases)**.

| System | File | Notes |
| --- | --- | --- |
| Windows 10/11 (x64) | `usdxcontrol-<version>-win-x64.exe` | NSIS installer |
| macOS Apple Silicon | `usdxcontrol-<version>-mac-arm64.dmg` | Unsigned: the first time, right-click → *Open* |
| macOS Intel | `usdxcontrol-<version>-mac-x64.dmg` | Unsigned: the first time, right-click → *Open* |
| Linux (any distribution) | `usdxcontrol-<version>-linux-x86_64.AppImage` | `chmod +x` and run |
| Debian/Ubuntu Linux | `usdxcontrol-<version>-linux-amd64.deb` | `sudo apt install ./usdxcontrol-….deb` |

[All versions](https://github.com/ea7ljy73/usdxcontrol/releases) · **[Getting started tutorial](docs/en/tutorial.md)** · [User manual](docs/en/manual.md) · [Installation and serial port permissions](docs/en/installation.md)

## Screenshots

| Panadapter with an RTL-SDR | SDR settings |
| --- | --- |
| ![40 m band spectrum with the SDR](docs/capturas/sdr-espectro.png) | ![SDR receiver dialog](docs/capturas/sdr-ajustes.png) |

## Features

- **CAT control** of the uSDX over USB-serial: frequency, VFO A/B, RIT, mode, AGC, NR, volume and PTT (also with the space bar).
- **Panadapter and waterfall** with tuning by click, drag, wheel or arrow keys.
- **FT8 and FT4** (receive and transmit): multi-pass decoding with WSJT-X-style SNR/DT, Band Activity and Rx Frequency, Tx1–Tx6, auto sequence, Call 1st, Hold Tx Freq, clear-spot search for TX, automatic uSDX DIGI Mode over CAT, Tune, watchdog, station map, PSK Reporter, log with ADIF import and export, and new country/callsign marks.
- **Audio**: choice of the radio input and output sound cards and monitoring of the radio through the PC speakers.
- **RTL-SDR** (V3 and clones such as HTOOL) over direct USB or `rtl_tcp`. The SDR stops receiving while the uSDX transmits.
- **English and Spanish interface**: pick it in the top bar; it is remembered.
- **Demo mode** without a radio: open the web version with `?radio=mock`.

## Development

Requires Node 24 and pnpm 10.

```sh
pnpm install
pnpm dev            # web version at http://localhost:5173 (?radio=mock to simulate)
pnpm dev:desktop    # desktop app
pnpm lint && pnpm test && pnpm test:e2e && pnpm test:desktop
```

The FT8/FT4 engine is WebAssembly built from [ft8_lib](https://github.com/kgoba/ft8_lib) (MIT). Its source is in `native/ftx/` and it is rebuilt with `native/ftx/build.sh` (needs Docker); the output goes to `src/features/digital/infrastructure/vendor/`.

Before packaging, `pnpm licenses:third-party` regenerates `THIRD_PARTY_LICENSES.txt` (`pnpm dist` and CI do it too). If you add a dependency that ends up inside the app, add it to the list in `scripts/third-party-licenses.cjs`.

Code comments and the technical design notes in `docs/` are in Spanish.

## Translations

Interface texts live in `src/i18n/messages/`: `es.ts` is the reference catalogue and `en.ts` its translation. The compiler checks that every language has all the keys. To add a language, copy `en.ts`, translate it and add its code to `LOCALES` and `LOCALE_NAMES` in `src/i18n/i18n.ts`. User documentation is in `docs/en/` and `docs/es/`. Contributions are welcome.

## License

[MIT](LICENSE) © 2026 jgalera. Bundled third-party components (ft8_lib, KISS FFT, React, Radix, Leaflet, serialport, webrtlsdr…) keep their own licenses, collected in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt).
