// Adapted from whisper.cpp/examples/whisper.wasm/emscripten.cpp (MIT license).
#include "whisper.h"

#include <emscripten.h>
#include <emscripten/bind.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

std::thread g_worker;
std::vector<whisper_context *> g_contexts(4, nullptr);
std::atomic<bool> g_processing{false};
std::string g_result;
int g_status = 0;

static inline int mpow2(int n) {
    int p = 1;
    while (p <= n) p *= 2;
    return p / 2;
}

EMSCRIPTEN_BINDINGS(whisper) {
    emscripten::function("init", emscripten::optional_override([](const std::string &path_model) {
        if (g_worker.joinable()) {
            g_worker.join();
        }

        for (size_t i = 0; i < g_contexts.size(); ++i) {
            if (g_contexts[i] == nullptr) {
                g_contexts[i] = whisper_init_from_file_with_params(
                    path_model.c_str(), whisper_context_default_params());
                return g_contexts[i] == nullptr ? size_t(0) : i + 1;
            }
        }

        return size_t(0);
    }));

    emscripten::function("free", emscripten::optional_override([](size_t index) {
        if (g_worker.joinable()) {
            g_worker.join();
        }

        --index;
        if (index < g_contexts.size()) {
            whisper_free(g_contexts[index]);
            g_contexts[index] = nullptr;
        }
    }));

    emscripten::function("full_default", emscripten::optional_override(
        [](size_t index, const emscripten::val &audio, const std::string &lang,
           int nthreads, bool translate) {
            if (g_worker.joinable()) {
                g_worker.join();
            }

            --index;
            if (index >= g_contexts.size()) return -1;
            if (g_contexts[index] == nullptr) return -2;

            whisper_full_params params = whisper_full_default_params(
                WHISPER_SAMPLING_GREEDY);
            const bool is_multilingual = whisper_is_multilingual(g_contexts[index]);

            params.print_realtime = true;
            params.print_progress = false;
            params.print_timestamps = false;
            params.print_special = false;
            params.translate = translate;
            params.language = is_multilingual ? strdup(lang.c_str()) : "en";
            params.n_threads = std::max(
                1, std::min(nthreads, std::min(16, mpow2(
                    static_cast<int>(std::thread::hardware_concurrency())))));
            params.offset_ms = 0;

            const int sample_count = audio["length"].as<int>();
            emscripten::val heap = emscripten::val::module_property("HEAPU8");
            emscripten::val memory = heap["buffer"];
            std::vector<float> samples(static_cast<size_t>(sample_count));
            emscripten::val memory_view = audio["constructor"].new_(
                memory, reinterpret_cast<uintptr_t>(samples.data()), sample_count);
            memory_view.call<void>("set", audio);

            g_result.clear();
            g_status = 0;
            g_processing.store(true, std::memory_order_release);
            g_worker = std::thread(
                [index, params, samples = std::move(samples), is_multilingual]() {
                    g_status = whisper_full(
                        g_contexts[index], params, samples.data(), samples.size());
                    if (g_status == 0) {
                        const int count = whisper_full_n_segments(g_contexts[index]);
                        for (int i = 0; i < count; ++i) {
                            if (i > 0) g_result += " ";
                            g_result += whisper_full_get_segment_text(g_contexts[index], i);
                        }
                    }
                    if (is_multilingual) {
                        free(const_cast<char *>(params.language));
                    }
                    g_processing.store(false, std::memory_order_release);
                });

            return 0;
        }));

    emscripten::function("is_processing", emscripten::optional_override([]() {
        return g_processing.load(std::memory_order_acquire);
    }));
    emscripten::function("get_result", emscripten::optional_override([]() {
        return g_result;
    }));
    emscripten::function("get_status", emscripten::optional_override([]() {
        return g_status;
    }));
}
