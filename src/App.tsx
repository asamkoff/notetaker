
import { useRef, useState } from 'react'
import './App.css'

type WhisperModel = 'tiny' | 'base' | 'small'

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [model, setModel] = useState<WhisperModel>('base')
  const [transcript, setTranscript] = useState('')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Waiting for an audio file')
  const [error, setError] = useState('')

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

    if (!['m4a', 'wav'].includes(extension ?? '')) {
      setError('Please select an M4A or WAV audio file.')
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
    if (!file) return

    setError(
      'The transcription engine will be connected in a later development stage.'
    )
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
            Local processing is the goal. Audio will not be
            uploaded to external servers.
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>1. Select an audio recording</h2>

        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.wav,audio/mp4,audio/wav,audio/x-wav"
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
          <span>M4A or WAV · Maximum 100 MB</span>
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
          disabled={!file}
          onClick={handleStart}
          type="button"
        >
          ▶ Start transcription
        </button>

        <p className="helper-text">
          The transcription engine is not connected yet.
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