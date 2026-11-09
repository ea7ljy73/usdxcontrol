// Motor FT8/FT4 de uSDX Control: envoltorio WebAssembly sobre ft8_lib (Karlis Goba, MIT).
//
// Respecto al decodificador de ejemplo de ft8_lib añade:
//  - varias pasadas con sustracción de las señales ya decodificadas (en el waterfall),
//    para sacar las señales débiles que quedan debajo de las fuertes, como WSJT-X;
//  - SNR estimada como WSJT-X (en 2500 Hz, respecto al ruido de fondo de cada frecuencia);
//  - DT respecto al inicio nominal de la emisión (0,5 s tras el comienzo del ciclo);
//  - límites comprobados: nunca desborda el búfer de resultados ni se queda en bucle
//    aunque la banda esté llena;
//  - codificador FT8 y FT4 con la tabla de indicativos (indicativos no estándar).
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <common/monitor.h>
#include <ft8/constants.h>
#include <ft8/decode.h>
#include <ft8/encode.h>
#include <ft8/message.h>

#include <emscripten/emscripten.h>

#define SAMPLE_RATE 12000
#define MAX_CANDIDATES 1000
#define MAX_DECODED 250

// Parámetros de búsqueda (ajustables desde JS para pruebas; por defecto, los afinados).
static int max_candidates = 400;
static int ldpc_iterations = 30;
static int min_score = 10;
static int num_passes = 3;

EMSCRIPTEN_KEEPALIVE
void ftx_set_params(int candidates, int iterations, int score, int passes)
{
    max_candidates = candidates < 1 ? 1 : (candidates > MAX_CANDIDATES ? MAX_CANDIDATES : candidates);
    ldpc_iterations = iterations < 1 ? 1 : iterations;
    min_score = score;
    num_passes = passes < 1 ? 1 : passes;
}
#define TIME_OSR 2
#define FREQ_OSR 2
// La emisión empieza 0,5 s después del inicio del ciclo: es el DT = 0 de WSJT-X.
#define TX_START_S 0.5f

#define FT8_SYMBOL_BT 2.0f
#define FT4_SYMBOL_BT 1.0f
#define GFSK_CONST_K 5.336446f // pi * sqrt(2 / ln 2)

// Calibración: DT con señales sintéticas (DT conocido); SNR contra lo que dio WSJT-X en las
// grabaciones reales de prueba de ft8_lib (test/wav), que es con lo que se comparan los reportes.
#define SNR_OFFSET_FT8_DB (-30.7f)
#define SNR_OFFSET_FT4_DB (-25.6f)
#define DT_OFFSET_FT8_S (-0.14f)
#define DT_OFFSET_FT4_S (-0.05f)

// ---------------------------------------------------------------------------
// Tabla de indicativos para los mensajes con indicativo abreviado (<...>)

#define CALLSIGN_TABLE_SIZE 512
#define CALLSIGN_MAX_AGE 60 // ciclos (15 min en FT8)

static struct
{
    char callsign[12];
    uint32_t hash; // 8 bits altos: edad; 22 bits bajos: hash
} callsign_table[CALLSIGN_TABLE_SIZE];

static void table_age(void)
{
    for (int i = 0; i < CALLSIGN_TABLE_SIZE; ++i)
    {
        if (callsign_table[i].callsign[0] == '\0')
            continue;
        uint8_t age = (uint8_t)(callsign_table[i].hash >> 24);
        if (age > CALLSIGN_MAX_AGE)
        {
            callsign_table[i].callsign[0] = '\0';
            callsign_table[i].hash = 0;
        }
        else
        {
            callsign_table[i].hash = (((uint32_t)age + 1u) << 24) | (callsign_table[i].hash & 0x3FFFFFu);
        }
    }
}

static void table_save(const char* callsign, uint32_t hash)
{
    uint16_t hash10 = (hash >> 12) & 0x3FFu;
    int idx = (hash10 * 23) % CALLSIGN_TABLE_SIZE;
    int oldest = idx;
    for (int probe = 0; probe < CALLSIGN_TABLE_SIZE; ++probe)
    {
        if (callsign_table[idx].callsign[0] == '\0')
        {
            oldest = idx;
            break;
        }
        if (((callsign_table[idx].hash & 0x3FFFFFu) == hash) && strcmp(callsign_table[idx].callsign, callsign) == 0)
        {
            callsign_table[idx].hash &= 0x3FFFFFu; // vuelve a ser nuevo
            return;
        }
        if ((callsign_table[idx].hash >> 24) > (callsign_table[oldest].hash >> 24))
            oldest = idx;
        idx = (idx + 1) % CALLSIGN_TABLE_SIZE;
    }
    // Hueco libre o, con la tabla llena, el más antiguo.
    strncpy(callsign_table[oldest].callsign, callsign, 11);
    callsign_table[oldest].callsign[11] = '\0';
    callsign_table[oldest].hash = hash & 0x3FFFFFu;
}

static bool table_lookup(ftx_callsign_hash_type_t hash_type, uint32_t hash, char* callsign)
{
    uint8_t shift = (hash_type == FTX_CALLSIGN_HASH_10_BITS) ? 12 : (hash_type == FTX_CALLSIGN_HASH_12_BITS ? 10 : 0);
    uint16_t hash10 = (hash >> (12 - shift)) & 0x3FFu;
    int idx = (hash10 * 23) % CALLSIGN_TABLE_SIZE;
    for (int probe = 0; probe < CALLSIGN_TABLE_SIZE; ++probe)
    {
        if (callsign_table[idx].callsign[0] == '\0')
            break;
        if (((callsign_table[idx].hash & 0x3FFFFFu) >> shift) == hash)
        {
            strcpy(callsign, callsign_table[idx].callsign);
            return true;
        }
        idx = (idx + 1) % CALLSIGN_TABLE_SIZE;
    }
    callsign[0] = '\0';
    return false;
}

static ftx_callsign_hash_interface_t hash_if = { .lookup_hash = table_lookup, .save_hash = table_save };

// ---------------------------------------------------------------------------
// Decodificación

static monitor_t monitors[2];
static bool monitor_ready[2];
static float monitor_fmin[2];
static float monitor_fmax[2];

static monitor_t* get_monitor(int protocol, float f_min, float f_max)
{
    int p = protocol ? 1 : 0;
    if (monitor_ready[p] && (monitor_fmin[p] != f_min || monitor_fmax[p] != f_max))
    {
        monitor_free(&monitors[p]);
        monitor_ready[p] = false;
    }
    if (!monitor_ready[p])
    {
        monitor_config_t cfg = {
            .f_min = f_min,
            .f_max = f_max,
            .sample_rate = SAMPLE_RATE,
            .time_osr = TIME_OSR,
            .freq_osr = FREQ_OSR,
            .protocol = p ? FTX_PROTOCOL_FT4 : FTX_PROTOCOL_FT8,
        };
        monitor_init(&monitors[p], &cfg);
        monitor_ready[p] = true;
        monitor_fmin[p] = f_min;
        monitor_fmax[p] = f_max;
    }
    return &monitors[p];
}

static inline int wf_index(const ftx_waterfall_t* wf, int block, int time_sub, int freq_sub, int bin)
{
    return ((block * wf->time_osr + time_sub) * wf->freq_osr + freq_sub) * wf->num_bins + bin;
}

static inline float db_to_power(float db) { return powf(10.0f, db * 0.1f); }

// Ruido de fondo de cada frecuencia (columna freq_sub/bin), en unidades del waterfall,
// como la línea base de WSJT-X: espectro medio (potencia) en el tiempo y, en cada frecuencia, el
// percentil bajo de ese espectro en una ventana de ±125 Hz. Así no lo contaminan las
// señales, que duran casi todo el ciclo.
#define BASELINE_HALF_WINDOW 40 // columnas de 3,125 Hz (±125 Hz)
#define BASELINE_PERCENTILE 10
static void noise_floor(const ftx_waterfall_t* wf, uint8_t* floor_out)
{
    const int fosr = wf->freq_osr;
    const int cols = wf->num_bins * fosr;
    const int frames = wf->num_blocks * wf->time_osr;
    float* mean = (float*)malloc(cols * sizeof(float));
    for (int f = 0; f < cols; ++f)
    {
        int fs = f % fosr, bin = f / fosr;
        // Media de la potencia en lineal (como WSJT-X), expresada otra vez en unidades del waterfall.
        float acc = 0;
        for (int b = 0; b < wf->num_blocks; ++b)
            for (int ts = 0; ts < wf->time_osr; ++ts)
                acc += db_to_power(WF_ELEM_MAG(wf->mag[wf_index(wf, b, ts, fs, bin)]));
        mean[f] = 2.0f * (10.0f * log10f(acc / frames + 1e-12f) + 120.0f);
    }
    float window[2 * BASELINE_HALF_WINDOW + 1];
    for (int f = 0; f < cols; ++f)
    {
        int lo = f - BASELINE_HALF_WINDOW, hi = f + BASELINE_HALF_WINDOW;
        if (lo < 0)
        {
            hi -= lo;
            lo = 0;
        }
        if (hi >= cols)
        {
            lo -= hi - (cols - 1);
            hi = cols - 1;
            if (lo < 0)
                lo = 0;
        }
        int n = 0;
        for (int i = lo; i <= hi; ++i)
            window[n++] = mean[i];
        // Selección parcial: el k-ésimo menor.
        int k = (n * BASELINE_PERCENTILE) / 100;
        for (int i = 0; i <= k; ++i)
        {
            int m = i;
            for (int j = i + 1; j < n; ++j)
                if (window[j] < window[m])
                    m = j;
            float t = window[i];
            window[i] = window[m];
            window[m] = t;
        }
        float v = window[k] + 0.5f;
        floor_out[(f % fosr) * wf->num_bins + f / fosr] = (uint8_t)(v < 0 ? 0 : (v > 255 ? 255 : v));
    }
    free(mean);
}

static int message_tones(int protocol, const ftx_message_t* msg, uint8_t* tones)
{
    if (protocol)
    {
        ft4_encode(msg->payload, tones);
        return FT4_NN;
    }
    ft8_encode(msg->payload, tones);
    return FT8_NN;
}

// SNR en 2500 Hz como WSJT-X: potencia media de los tonos de la señal frente a la línea
// base de ruido en esas mismas frecuencias.
static float estimate_snr(int protocol, const ftx_waterfall_t* wf, const ftx_candidate_t* cand, const uint8_t* tones, int num_tones,
                          const uint8_t* floor_db)
{
    float sig = 0, noise = 0;
    int n = 0;
    for (int k = 0; k < num_tones; ++k)
    {
        int block = cand->time_offset + k;
        if (block < 0 || block >= wf->num_blocks)
            continue;
        int bin = cand->freq_offset + tones[k];
        if (bin < 0 || bin >= wf->num_bins)
            continue;
        sig += db_to_power(WF_ELEM_MAG(wf->mag[wf_index(wf, block, cand->time_sub, cand->freq_sub, bin)]));
        noise += db_to_power(WF_ELEM_MAG(floor_db[cand->freq_sub * wf->num_bins + bin]));
        ++n;
    }
    float floor_snr = protocol ? -21.0f : -24.0f;
    if (n == 0 || noise <= 0)
        return floor_snr;
    float ratio = sig / noise - 1.0f;
    if (ratio < 1e-3f)
        ratio = 1e-3f;
    float snr = 10.0f * log10f(ratio) + (protocol ? SNR_OFFSET_FT4_DB : SNR_OFFSET_FT8_DB);
    return snr < floor_snr ? floor_snr : snr;
}

// Borra del waterfall una señal ya decodificada (la deja al nivel del ruido) para que
// la pasada siguiente pueda encontrar lo que tapaba.
static void subtract_signal(const ftx_waterfall_t* wf, const ftx_candidate_t* cand, const uint8_t* tones, int num_tones,
                            const uint8_t* floor_db)
{
    const int tosr = wf->time_osr, fosr = wf->freq_osr;
    const int frames = wf->num_blocks * tosr;
    const int cols = wf->num_bins * fosr;
    for (int k = 0; k < num_tones; ++k)
    {
        int t0 = (cand->time_offset + k) * tosr + cand->time_sub;
        int f0 = (cand->freq_offset + tones[k]) * fosr + cand->freq_sub;
        for (int dt = -1; dt <= 1; ++dt)
        {
            int t = t0 + dt;
            if (t < 0 || t >= frames)
                continue;
            for (int df = -1; df <= 1; ++df)
            {
                int f = f0 + df;
                if (f < 0 || f >= cols)
                    continue;
                int fs = f % fosr, bin = f / fosr;
                int idx = wf_index(wf, t / tosr, t % tosr, fs, bin);
                uint8_t fl = floor_db[fs * wf->num_bins + bin];
                if (wf->mag[idx] > fl)
                    wf->mag[idx] = fl;
            }
        }
    }
}

typedef struct
{
    ftx_message_t message;
    ftx_candidate_t cand;
    uint8_t tones[FT4_NN > FT8_NN ? FT4_NN : FT8_NN];
    int num_tones;
} decoded_t;

static decoded_t decoded[MAX_DECODED];

static bool already_decoded(const ftx_message_t* msg, int count)
{
    for (int i = 0; i < count; ++i)
        if (decoded[i].message.hash == msg->hash && memcmp(decoded[i].message.payload, msg->payload, sizeof(msg->payload)) == 0)
            return true;
    return false;
}

// Decodifica un ciclo. `signal`: audio mono a 12 kHz desde el inicio del ciclo.
// Escribe una línea por mensaje («snr\tdt\tfrecuencia\ttexto\n») sin pasar de out_size
// y devuelve cuántos mensajes ha escrito.
EMSCRIPTEN_KEEPALIVE
int ftx_decode(int protocol, const float* signal, int num_samples, float f_min, float f_max, char* out, int out_size)
{
    if (out_size <= 0)
        return 0;
    out[0] = '\0';
    monitor_t* mon = get_monitor(protocol, f_min, f_max);
    monitor_reset(mon);
    // Sin restos del ciclo anterior en la ventana de análisis.
    memset(mon->last_frame, 0, mon->nfft * sizeof(mon->last_frame[0]));
    for (int pos = 0; pos + mon->block_size <= num_samples; pos += mon->block_size)
        monitor_process(mon, signal + pos);

    ftx_waterfall_t* wf = &mon->wf;
    if (wf->num_blocks == 0)
        return 0;

    uint8_t* floor_db = (uint8_t*)malloc(wf->freq_osr * wf->num_bins);
    if (!floor_db)
        return 0;
    noise_floor(wf, floor_db);

    static ftx_candidate_t candidates[MAX_CANDIDATES];
    int count = 0;
    int written = 0;
    int used = 0;
    for (int pass = 0; pass < num_passes && count < MAX_DECODED; ++pass)
    {
        int first_new = count;
        int num_candidates = ftx_find_candidates(wf, max_candidates, candidates, min_score);
        for (int i = 0; i < num_candidates && count < MAX_DECODED; ++i)
        {
            const ftx_candidate_t* cand = &candidates[i];
            ftx_message_t message;
            ftx_decode_status_t status;
            if (!ftx_decode_candidate(wf, cand, ldpc_iterations, &message, &status))
                continue;
            if (already_decoded(&message, count))
                continue;

            char text[FTX_MAX_MESSAGE_LENGTH];
            ftx_message_offsets_t offsets;
            if (ftx_message_decode(&message, &hash_if, text, &offsets) != FTX_MESSAGE_RC_OK)
                continue;

            decoded_t* d = &decoded[count++];
            d->message = message;
            d->cand = *cand;
            d->num_tones = message_tones(protocol, &message, d->tones);

            float freq_hz = (mon->min_bin + cand->freq_offset + (float)cand->freq_sub / wf->freq_osr) / mon->symbol_period;
            float time_s = (cand->time_offset + (float)cand->time_sub / wf->time_osr) * mon->symbol_period - TX_START_S +
                           (protocol ? DT_OFFSET_FT4_S : DT_OFFSET_FT8_S);
            float snr = estimate_snr(protocol, wf, cand, d->tones, d->num_tones, floor_db);

            char line[FTX_MAX_MESSAGE_LENGTH + 48];
            int len = snprintf(line, sizeof(line), "%.1f\t%.2f\t%.1f\t%s\n", snr, time_s, freq_hz, text);
            if (len > 0 && used + len < out_size)
            {
                memcpy(out + used, line, len);
                used += len;
                out[used] = '\0';
                ++written;
            }
        }
        if (count == first_new)
            break; // esta pasada no ha sacado nada nuevo
        if (pass + 1 < num_passes)
            for (int i = first_new; i < count; ++i)
                subtract_signal(wf, &decoded[i].cand, decoded[i].tones, decoded[i].num_tones, floor_db);
    }
    free(floor_db);
    table_age();
    return written;
}

// ---------------------------------------------------------------------------
// Codificación

static void gfsk_pulse(int n_spsym, float symbol_bt, float* pulse)
{
    for (int i = 0; i < 3 * n_spsym; ++i)
    {
        float t = i / (float)n_spsym - 1.5f;
        float arg1 = GFSK_CONST_K * symbol_bt * (t + 0.5f);
        float arg2 = GFSK_CONST_K * symbol_bt * (t - 0.5f);
        pulse[i] = (erff(arg1) - erff(arg2)) / 2;
    }
}

static void synth_gfsk(const uint8_t* symbols, int n_sym, float f0, float symbol_bt, float symbol_period, float* signal)
{
    int n_spsym = (int)(0.5f + SAMPLE_RATE * symbol_period);
    int n_wave = n_sym * n_spsym;
    float dphi_peak = 2 * M_PI / n_spsym;
    float* dphi = (float*)malloc((n_wave + 2 * n_spsym) * sizeof(float));
    float* pulse = (float*)malloc(3 * n_spsym * sizeof(float));
    for (int i = 0; i < n_wave + 2 * n_spsym; ++i)
        dphi[i] = 2 * M_PI * f0 / SAMPLE_RATE;
    gfsk_pulse(n_spsym, symbol_bt, pulse);
    for (int i = 0; i < n_sym; ++i)
    {
        int ib = i * n_spsym;
        for (int j = 0; j < 3 * n_spsym; ++j)
            dphi[j + ib] += dphi_peak * symbols[i] * pulse[j];
    }
    for (int j = 0; j < 2 * n_spsym; ++j)
    {
        dphi[j] += dphi_peak * pulse[j + n_spsym] * symbols[0];
        dphi[j + n_sym * n_spsym] += dphi_peak * pulse[j] * symbols[n_sym - 1];
    }
    float phi = 0;
    for (int k = 0; k < n_wave; ++k)
    {
        signal[k] = sinf(phi);
        phi = fmodf(phi + dphi[k + n_spsym], 2 * M_PI);
    }
    int n_ramp = n_spsym / 8;
    for (int i = 0; i < n_ramp; ++i)
    {
        float env = (1 - cosf(2 * M_PI * i / (2 * n_ramp))) / 2;
        signal[i] *= env;
        signal[n_wave - 1 - i] *= env;
    }
    free(dphi);
    free(pulse);
}

// Muestras (12 kHz) de una emisión completa del protocolo.
EMSCRIPTEN_KEEPALIVE
int ftx_wave_length(int protocol)
{
    return protocol ? (int)(0.5f + FT4_NN * FT4_SYMBOL_PERIOD * SAMPLE_RATE) : (int)(0.5f + FT8_NN * FT8_SYMBOL_PERIOD * SAMPLE_RATE);
}

// Genera la señal de un mensaje con el tono 0 en f0 Hz. Devuelve el número de muestras
// o un valor negativo si el mensaje no se puede codificar.
EMSCRIPTEN_KEEPALIVE
int ftx_encode(int protocol, const char* text, float f0, float* out, int max_samples)
{
    int n = ftx_wave_length(protocol);
    if (max_samples < n)
        return -100;
    ftx_message_t msg;
    ftx_message_rc_t rc = ftx_message_encode(&msg, &hash_if, text);
    if (rc != FTX_MESSAGE_RC_OK)
        return -(int)rc - 1;
    uint8_t tones[FT4_NN > FT8_NN ? FT4_NN : FT8_NN];
    int num_tones = message_tones(protocol, &msg, tones);
    synth_gfsk(tones, num_tones, f0, protocol ? FT4_SYMBOL_BT : FT8_SYMBOL_BT, protocol ? FT4_SYMBOL_PERIOD : FT8_SYMBOL_PERIOD, out);
    return n;
}

// Apunta un indicativo en la tabla (el propio y el del corresponsal), para que los
// mensajes que lo llevan abreviado (<...>) se muestren completos.
EMSCRIPTEN_KEEPALIVE
void ftx_remember_callsign(const char* callsign)
{
    char text[32];
    snprintf(text, sizeof(text), "CQ %s", callsign);
    ftx_message_t msg;
    ftx_message_encode(&msg, &hash_if, text);
}
