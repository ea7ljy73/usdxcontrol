# Tutorial: getting started with uSDX Control

*[Versión en español](../es/tutorial.md)* · Full reference: [user manual](manual.md)

This tutorial takes you from installation to your first FT8 QSO in about 15 minutes. At the end there is a table with **every configuration option**, where to find it and its default value.

## What you need

- A **uSDX** transceiver (uSDX Plus Orange with firmware **v2.2.0 or later** for volume, AGC, NR and DIGI Mode over CAT; with older firmware everything else works).
- The uSDX **USB cable** (CAT port, CH340 or CP210x USB-serial).
- A **sound card** connected to the radio for FT8/FT4: the uSDX audio output goes into the computer and the computer output goes to the uSDX microphone input. A cheap USB sound card is fine.
- Optional: an **RTL-SDR** (V3 or a clone) to see the whole band on the panadapter.

## Step 1 · Install and pick a language

1. Download the installer for your system from [Releases](https://github.com/ea7ljy73/usdxcontrol/releases) and install it (details in the [installation guide](installation.md)).
2. On Linux, add your user to the `dialout` group and log in again: `sudo usermod -aG dialout $USER`.
3. Open uSDX Control. The interface follows your system language; to change it use the **ES · Español / EN · English** selector in the top bar. The app remembers your choice.

## Step 2 · Connect the radio

1. Plug the uSDX in over USB and switch it on.
2. In the top bar, pick the **serial port** (`COM3`, `COM4`… on Windows; `/dev/ttyUSB0` on Linux) and press **Connect**.
3. The indicator changes to **Connected** and the dial shows the radio frequency.

Try tuning: mouse wheel over the dial or the spectrum, ↑/↓ keys or the `<` `>` buttons. The **1k** button changes the tuning step.

## Step 3 · See and hear the band

1. In the panadapter left menu (← button) press **Audio** and allow the radio sound card input. You will see the spectrum and waterfall of the received audio.
2. To hear the radio through the computer speakers, press **Sound** in the top bar and tick **Listen to the radio on the PC**. Pick the computer speakers as *Speakers*, never the card that goes to the radio.
3. **Click** a signal on the spectrum to tune it. **Double-click** locks the dial so the arrow keys move it.

## Step 4 · Set up audio for transmitting

Open **Sound** in the top bar:

1. **Input (RX)**: the card that receives the uSDX audio. Set the *Input gain* so the **RX** meter sits in the lower part of the bar on a quiet band.
2. **Output (TX)**: the card that goes to the uSDX. **Do not leave it on “System default”**: that is usually the speakers, and the radio would transmit with no signal.
3. **Transmit level**: go into FT8 (step 5), press **Tune** and raise the level until the output power stops increasing; go no further, because you would overdrive the radio input and produce harmonics. Press **Tune** again (it stops on its own after 60 s).

## Step 5 · Your first FT8 QSO

1. Press **FT8** under *Mode*. The radio switches to USB, tunes to the band's FT8 frequency and, with firmware v2.2.0, turns DIGI Mode on.
2. Press **Settings…** and enter **My callsign** and **My grid** (4 or 6 characters, e.g. `IM76` or `IM76hk`). Save.
3. Press **Sync clock**. FT8 needs the clock to be within 1 s.
4. Wait a couple of 15 s cycles: decodes appear in **Band Activity**. CQs are shown in green.
5. **Double-click** a CQ. The app prepares the messages, enables TX and, with **Auto sequence** on, runs the exchange on its own: report, RR73 and 73. Your TX stays where it is; with **TX on clear spot** (on by default) it first moves off any other signal.
6. When the QSO ends, **Log QSO** opens: check the details and press **Save to log**.
7. At any time, **Halt TX** or the **Esc** key stops transmitting.

To check how far your signal gets, open **PSK Reporter** in the FT8 toolbar.

## Step 6 (optional) · Panadapter with an RTL-SDR

1. Press **SDR** in the top bar.
2. *Connection*: **Direct USB** (RTL-SDR plugged into the computer) or **Network · rtl_tcp** (enter server and port).
3. On HF leave *Direct sampling* on **Q branch** (V3 and clones).
4. Press **Connect SDR**. The panadapter shows the whole band and pauses on its own while the uSDX transmits from the app.

Linux and Windows need some preparation first: see section 6 of the [manual](manual.md#6-sdr-receiver-rtl-sdr).

## Options and configuration reference

All settings are stored on the computer (in the app or browser profile) and kept between sessions.

### General

| Option | Where | Default | What for |
| --- | --- | --- | --- |
| Language | Top bar | System language (Spanish, otherwise English) | Language of the whole interface and its messages |
| Serial port | Top bar | First in the list | uSDX CAT port (38400 baud, 8N1, automatic) |
| Volume | Top bar | The radio's | uSDX volume (firmware v2.2.0) |
| S-meter refresh | RX panel | Normal (1 s) | Slow 6 s · Normal 1 s · Fast 0.5 s. Every reading is heard as a click on the uSDX |
| AGC | RX panel or flag | The radio's | OFF · FAST · SLOW (firmware v2.2.0) |
| NR | RX panel or flag | The radio's | Noise reduction 0–8 (firmware v2.2.0) |
| Tuning step | Button under the dial | 1 kHz | Step for the dial, wheel, drag and scan |
| Spectrum style | Panadapter ← menu | Filled | Filled · Line · Soft |
| Panadapter span | Panadapter ← menu | Band | Whole band or a fixed zoom |
| Audio spectrum | RX panel, *Audio* header | Expanded | Collapse it to save space |

### Sound

| Option | Default | What for |
| --- | --- | --- |
| Input (RX) | System default | Card that receives the uSDX audio |
| Input gain | 100 % | Level of the received audio (RX meter) |
| Output (TX) | System default | Card that sends the FT8/FT4 audio to the uSDX. **Change it to the radio card** |
| Transmit level | 50 % | Set it with *Tune* (step 4) |
| Listen to the radio on the PC | Off | Hear the received audio through the computer speakers |
| Speakers (monitoring) | System default | Cannot be the radio card |
| Monitoring volume | 50 % | Volume of the monitoring on the PC |

### FT8 / FT4: Settings…

| Option | Default | What for |
| --- | --- | --- |
| My callsign | (empty) | Required to transmit |
| My grid | (empty) | 4 or 6 characters; sent in your CQ and used for the map and distances |
| QSO ending | RR73 | RR73 (recommended) or RRR and 73 |
| TX watchdog | 6 min | Stops transmitting after that long without you touching anything |
| TX period | Automatic | Automatic: the opposite of the station you reply to. Manual: always the one in *My period* |

### FT8 / FT4: transmit panel

| Option | Default | What for |
| --- | --- | --- |
| Auto sequence | On | Runs the QSO exchange on its own |
| Call 1st | On | After your CQ, replies to the first station that calls you |
| Hold Tx Freq | Off | When replying or moving RX, TX stays put |
| TX on clear spot | On | Before transmitting, moves your TX off other signals |
| My period | Odd :15/:45 | TX period (even :00/:30 or odd :15/:45) |
| RX / TX frequency | 1000 Hz | Click and Shift + click on the waterfall; TX between 200 and 2300 Hz |

### FT8 / FT4: waterfall (waterfall Settings button)

| Option | Default |
| --- | --- |
| Palette | Classic (also Spectrum, Fire, Green) |
| Spectrum | Shown |
| Speed | ×1 |
| Brightness | 1.0 |
| Contrast | 1.4 |
| Noise floor | 0.10 |

### SDR receiver

| Option | Default | What for |
| --- | --- | --- |
| Connection | Direct USB | Direct USB or network (rtl_tcp, desktop app only) |
| rtl_tcp server / port | 127.0.0.1 / 1234 | Address of the `rtl_tcp` server |
| Direct sampling (HF) | Q branch | Q branch for V3 and clones; Off for V4 or with an upconverter |
| Sample rate | 2.048 MS/s | Wider: more visible band and more CPU |
| Correction | 0 ppm | Frequency error of the SDR crystal |
| Gain | Automatic | Automatic or manual (0–49.6 dB) |
| Upconverter | 0 Hz | Upconverter offset, if you use one |
| Stop receiving while the uSDX transmits | On | Protects the SDR and avoids drawing your own signal |

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| ↑ / ↓ | One step up or down |
| `[` / `]` | Smaller or larger tuning step |
| `m` / `M` | Next or previous mode |
| Space (hold) | PTT |
| Esc | Halt TX in FT8 (or unlock the locked dial) |
| Shift + F11 / F12 | Move the FT8 TX down or up |

Something not working? See the [troubleshooting](manual.md#7-troubleshooting) table or open an [issue](https://github.com/ea7ljy73/usdxcontrol/issues).
