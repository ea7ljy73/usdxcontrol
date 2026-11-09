#!/usr/bin/env bash
# Compila el motor FT8/FT4 (ft8_lib + ftx_wasm.c) a WebAssembly con emscripten en docker.
# Uso: native/ftx/build.sh   → src/features/digital/infrastructure/vendor/ftx.{js,wasm}
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
FT8_LIB_COMMIT=9fec6ca39886edbf96f4f5e71edc76da5074e871
EMSDK_IMAGE=emscripten/emsdk:3.1.74
WORK="$HERE/.build"
OUT="$ROOT/src/features/digital/infrastructure/vendor"

if [ ! -d "$WORK/ft8_lib" ]; then
  mkdir -p "$WORK"
  git clone -q https://github.com/kgoba/ft8_lib "$WORK/ft8_lib"
fi
git -C "$WORK/ft8_lib" checkout -q "$FT8_LIB_COMMIT"

docker run --rm -u "$(id -u):$(id -g)" -v "$HERE:/src" -w /src "$EMSDK_IMAGE" \
  emcc -O3 -flto -I.build/ft8_lib -DLOG_LEVEL=LOG_FATAL \
    ftx_wasm.c \
    .build/ft8_lib/ft8/message.c .build/ft8_lib/ft8/text.c .build/ft8_lib/ft8/decode.c \
    .build/ft8_lib/ft8/encode.c .build/ft8_lib/ft8/constants.c .build/ft8_lib/ft8/crc.c \
    .build/ft8_lib/ft8/ldpc.c .build/ft8_lib/common/monitor.c \
    .build/ft8_lib/fft/kiss_fft.c .build/ft8_lib/fft/kiss_fftr.c \
    -o .build/ftx.js \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createFtxModule -sENVIRONMENT=web,worker \
    -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1MB -sFILESYSTEM=0 \
    -sEXPORTED_FUNCTIONS='["_ftx_decode","_ftx_encode","_ftx_wave_length","_ftx_remember_callsign","_ftx_set_params","_malloc","_free"]' \
    -sEXPORTED_RUNTIME_METHODS='["HEAPF32","HEAPU8","stringToUTF8","lengthBytesUTF8"]'

cp "$WORK/ftx.js" "$OUT/ftx.js"
cp "$WORK/ftx.wasm" "$OUT/ftx.wasm"
cp "$WORK/ft8_lib/LICENSE" "$OUT/LICENSE.ft8_lib"
echo "ok → $OUT/ftx.{js,wasm}"
