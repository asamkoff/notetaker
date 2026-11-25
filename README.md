# Polish Speech Transcriber

A browser-based Polish speech transcriber intended for **Android phones**.
Whisper.cpp runs in WebAssembly on the phone; selected audio is processed
locally and is not uploaded. The app downloads its quantized model from
[Hugging Face](https://huggingface.co/ggerganov/whisper.cpp) when needed.
This is not a native Android app or APK.

## Use on Android

1. Open the deployed GitHub Pages site over HTTPS in a current version of
   Chrome for Android.
2. On the first visit, allow the page to reload once so its service worker can
   enable the threaded WebAssembly runtime.
3. Choose an audio file and start transcription. An internet connection is
   needed to download the selected model the first time.

The Tiny model (about 31 MB) is selected by default. Base and Small are larger
and may exceed the memory or performance limits of some phones. Browser caching
may retain a downloaded model, but is not guaranteed and should not be treated
as offline storage.

## Audio and device requirements

- Android phone with a current Chrome browser, WebAssembly SIMD support, and
  cross-origin isolation enabled by the service worker.
- Audio formats currently accepted by the UI: M4A, WAV, MP3, OGG, and WebM.
  Actual decoding depends on the browser's audio codec support.
- Maximum file size is 100 MB and maximum duration is 2 minutes.
- Processing time, memory use, heat, and battery consumption depend on the
  phone and selected model.

The app is currently a static website, not a Play Store install. It is intended
for Android, but does not yet block access from desktop or non-Android browsers.

## Development and deployment

`npm ci` and `npm run dev` serve the UI for development, but do not build the
whisper.cpp runtime, so transcription is not available from that local dev
server. The GitHub Actions workflow builds the app and whisper.cpp v1.9.6 with
Emscripten, then deploys both to GitHub Pages. Configure GitHub Pages to use
**GitHub Actions** as its deployment source.
