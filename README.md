# Polish Speech Transcriber

A static React application that transcribes Polish audio in the browser using
[whisper.cpp](https://github.com/ggml-org/whisper.cpp)'s WebAssembly build.
Audio is decoded and processed locally; model files are downloaded from
[Hugging Face](https://huggingface.co/ggerganov/whisper.cpp) when first needed.

## Run locally

```sh
npm ci
npm run dev
```

The development server serves the UI, but does not build the whisper.cpp
runtime. Transcription is available on the GitHub Pages deployment.

## Deployment

The `Deploy Polish Speech Transcriber` workflow builds the app and compiles
whisper.cpp v1.9.6 with Emscripten before publishing to GitHub Pages. The
runtime is generated as part of the workflow and is not checked into the repo.
GitHub Pages must use **GitHub Actions** as its deployment source.

On first use, the selected quantized model is downloaded and cached by the
browser where supported. The Tiny model is about 31 MB; Base and Small provide
higher quality at larger download sizes. Audio is limited to 2 minutes and 100
MB. Browser support for WebAssembly SIMD and cross-origin isolation is required.
