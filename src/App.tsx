
import { useRef, useState } from 'react'
import './App.css'

type WhisperModel = 'tiny' | 'base' | 'small'

type WhisperModule = {
  onRuntimeInitialized?: () => void
  onAbort?: (reason: string) => void
  init?: (modelPath: string) => number
  free?: (instance: number) => void
  full_default?: (
    instance: number,
    audio: Float32Array,
    language: string,
    threads: number,
    translate: boolean
  ) => number
  is_processing?: () => boolean
  get_result?: () => string
  get_status?: () => number
  FS_createDataFile?: (
    parent: string,
    name: string,
    data: Uint8Array,
    canRead: boolean,
    canWrite: boolean
  ) => void
  FS_unlink?: (path: string) => void
}

declare global {
  interface Window {
    Module?: WhisperModule
    whisperModulePromise?: Promise<WhisperModule>
  }
}

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
}

const SAMPLE_RATE = 16_000
const MAX_AUDIO_SECONDS = 120

function loadWhisperModule() {
  if (window.whisperModulePromise) return window.whisperModulePromise

  window.whisperModulePromise = new Promise<WhisperModule>((resolve, reject) => {
    const fail = (reason: string) => {
      window.whisperModulePromise = undefined
      reject(new Error(reason))
    }
    const module: WhisperModule = {
      onRuntimeInitialized: () => resolve(module),
      onAbort: (reason) => fail(`Whisper WASM failed: ${reason}`),
    }

    window.Module = module
    const script = document.createElement('script')
    script.src = `${import.meta.env.BASE_URL}whisper/main.js`
    script.onerror = () => {
      script.remove()
      fail('Unable to load the whisper.cpp runtime.')
    }
    document.body.appendChild(script)
  })

  return window.whisperModulePromise
}

async function downloadModel(
  model: WhisperModel,
  onProgress: (progress: number) => void
) {
  const response = await fetch(MODEL_URLS[model], { cache: 'force-cache' })
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download the ${model} Whisper model.`)
  }

  const contentLength = Number(response.headers.get('content-length'))
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length

    if (Number.isFinite(contentLength) && contentLength > 0) {
      onProgress(Math.round((received / contentLength) * 40))
    }
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

async function decodeAudio(file: File) {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    if (decoded.duration > MAX_AUDIO_SECONDS) {
      throw new Error(`Audio must be ${MAX_AUDIO_SECONDS} seconds or shorter.`)
    }

    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * SAMPLE_RATE),
      SAMPLE_RATE
    )
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    return (await offline.startRendering()).getChannelData(0)
  } finally {
    await context.close()
  }
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState<WhisperModel>('tiny')
  const [transcript, setTranscript] = useState('')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Waiting for an audio file')
  const [error, setError] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const whisperInstance = useRef<number | null>(null)
  const loadedModel = useRef<WhisperModel | null>(null)

  const MAX_FILE_SIZE = 100 * 1024 * 1024

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0]

    setError('')
    setProgress(0)
    setTranscript('')
    setStatus('Waiting for an audio file')

    if (!selectedFile) return

    const extension = selectedFile.name
      .split('.')
      .pop()
      ?.toLowerCase()

    if (!['m4a', 'wav', 'mp3', 'ogg', 'webm'].includes(extension ?? '')) {
      setError('Please select a supported audio file (M4A, WAV, MP3, OGG, or WebM).')
      setFile(null)
      event.target.value = ''
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError('The selected file exceeds the 100 MB limit.')
      setFile(null)
      event.target.value = ''
      return
    }

    if (selectedFile.size === 0) {
      setError('The selected file is empty.')
      setFile(null)
      event.target.value = ''
      return
    }

    setFile(selectedFile)
    setStatus('File ready for transcription')
  }

  function handleStart() {
    if (!file || isTranscribing) return
    void transcribe(file)
  }

  async function transcribe(selectedFile: File) {
    setError('')
    setTranscript('')
    setProgress(0)
    setIsTranscribing(true)

    try {
      if (!crossOriginIsolated) {
        throw new Error('This browser could not enable the threaded WASM runtime. Reload the page and try again.')
      }

      setStatus('Preparing audio locally')
      const audio = await decodeAudio(selectedFile)
      setProgress(10)

      setStatus('Loading whisper.cpp')
      const whisper = await loadWhisperModule()
      if (
        !whisper.init ||
        !whisper.full_default ||
        !whisper.is_processing ||
        !whisper.get_result ||
        !whisper.get_status ||
        !whisper.FS_createDataFile ||
        !whisper.FS_unlink
      ) {
        throw new Error('The whisper.cpp runtime is missing required functions.')
      }

      if (loadedModel.current !== model) {
        setStatus(`Downloading the ${model} model`)
        const modelBytes = await downloadModel(model, setProgress)
        setProgress(40)

        if (whisperInstance.current !== null) {
          whisper.free?.(whisperInstance.current)
          whisperInstance.current = null
        }
        whisper.FS_unlink('whisper.bin')
        whisper.FS_createDataFile('/', 'whisper.bin', modelBytes, true, true)
        const instance = whisper.init('whisper.bin')
        if (!instance) throw new Error('Unable to initialize the Whisper model.')

        whisperInstance.current = instance
        loadedModel.current = model
      }

      const instance = whisperInstance.current
      if (instance === null) throw new Error('The Whisper model is not initialized.')

      setProgress(50)
      setStatus('Transcribing locally; this may take a while')
      const result = whisper.full_default(instance, audio, 'pl', 4, false)
      if (result !== 0) {
        throw new Error(`Whisper could not start transcription (error ${result}).`)
      }

      while (whisper.is_processing()) {
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      }

      const transcriptionStatus = whisper.get_status()
      if (transcriptionStatus !== 0) {
        throw new Error(`Whisper transcription failed (error ${transcriptionStatus}).`)
      }

      const text = whisper.get_result().trim()
      if (!text) throw new Error('No speech was recognized in this recording.')

      setTranscript(text)
      setProgress(100)
      setStatus('Transcription complete')
    } catch (transcriptionError) {
      setError(
        transcriptionError instanceof Error
          ? transcriptionError.message
          : 'Transcription failed unexpectedly.'
      )
      setStatus('Transcription failed')
    } finally {
      setIsTranscribing(false)
    }
  }

  async function handleCopy() {
    if (!transcript.trim()) return

    try {
      await navigator.clipboard.writeText(transcript)
      setStatus('Transcript copied to clipboard')
    } catch {
      setError('Unable to access the clipboard.')
    }
  }

  function handleDownload() {
    if (!transcript.trim()) return

    const blob = new Blob(
      [transcript],
      { type: 'text/plain;charset=utf-8' }
    )

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'polish-transcript.txt'
    link.click()

    URL.revokeObjectURL(url)
  }

  function formatFileSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <main className="app-container">
      <header className="app-header">
        <div className="logo">🎙️</div>
        <div>
          <h1>Polish Speech Transcriber</h1>
          <p>
            Private speech transcription directly on your device.
          </p>
        </div>
      </header>

      <div className="privacy-notice">
        <span>🔒</span>
        <div>
          <strong>Your privacy matters</strong>
          <p>
            Audio is transcribed on this device and is not uploaded. The selected
            Whisper model is downloaded from Hugging Face on first use.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>1. Select an audio recording</h2>

        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.wav,.mp3,.ogg,.webm,audio/*"
          onChange={handleFileChange}
          hidden
        />

        <button
          className="file-button"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <span className="file-icon">📁</span>
          <strong>Choose audio file</strong>
          <span>Audio file · Maximum 100 MB · Up to 2 minutes</span>
        </button>

        {file && (
          <div className="file-info">
            <span>🎵</span>
            <div className="file-details">
              <strong>{file.name}</strong>
              <span>{formatFileSize(file.size)}</span>
            </div>
            <span className="ready-label">Ready</span>
          </div>
        )}

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>2. Transcription settings</h2>

        <div className="settings-grid">
          <div className="setting">
            <label htmlFor="language">Language</label>
            <select id="language" value="pl" disabled>
              <option value="pl">Polish</option>
            </select>
          </div>

          <div className="setting">
            <label htmlFor="model">Whisper model</label>
            <select
              id="model"
              value={model}
              disabled={isTranscribing}
              onChange={(event) =>
                setModel(event.target.value as WhisperModel)
              }
            >
              <option value="tiny">Tiny – fastest</option>
              <option value="base">Base – recommended</option>
              <option value="small">Small – better quality</option>
            </select>
          </div>
        </div>

        <button
          className="start-button"
          disabled={!file || isTranscribing}
          onClick={handleStart}
          type="button"
        >
          {isTranscribing ? 'Transcribing…' : '▶ Start transcription'}
        </button>

        <p className="helper-text">
          Runs locally in your browser with whisper.cpp. Model downloads are
          cached by your browser when possible.
        </p>
      </section>

      <section className="panel">
        <h2>3. Transcription progress</h2>

        <div className="progress-info">
          <span>{status}</span>
          <strong>{progress}%</strong>
        </div>

        <div
          className="progress-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      <section className="panel">
        <h2>4. Transcription result</h2>

        <textarea
          className="transcript-area"
          placeholder="Your Polish transcription will appear here. You can also edit the text manually."
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          spellCheck
          lang="pl"
        />

        <div className="result-actions">
          <button
            className="secondary-button"
            onClick={handleCopy}
            disabled={!transcript.trim()}
            type="button"
          >
            📋 Copy transcript
          </button>

          <button
            className="secondary-button"
            onClick={handleDownload}
            disabled={!transcript.trim()}
            type="button"
          >
            ⬇ Download TXT
          </button>
        </div>
      </section>

      <footer>
        <p>Polish Speech Transcriber</p>
        <span>Designed for private, local speech recognition.</span>
      </footer>
    </main>
  )
}

export default App