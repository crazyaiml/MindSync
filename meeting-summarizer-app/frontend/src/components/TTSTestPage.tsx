import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Volume2, VolumeX, Loader2 } from 'lucide-react'

interface TTSTestPageProps {
  isOpen: boolean
  onClose: () => void
}

interface VoiceProfile {
  id: string
  name: string
  is_default: boolean
}

const TTSTestPage: React.FC<TTSTestPageProps> = ({ isOpen, onClose }) => {
  const [text, setText] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [currentSpeechAudio, setCurrentSpeechAudio] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState('')
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [currentVoiceProfile, setCurrentVoiceProfile] = useState(() => {
    return localStorage.getItem('currentVoiceProfile') || 'default'
  })
  const [streamingProgress, setStreamingProgress] = useState<{ current: number; total: number } | null>(null)
  const [useStreaming, setUseStreaming] = useState(false)
  const [speechType, setSpeechType] = useState<'summary' | 'keypoints' | 'actionitems'>('summary')

  // Sample texts for quick testing
  const sampleTexts = {
    short: "Hello! This is a short test of the text-to-speech system.",
    medium: "This is a medium-length text to test the TTS system. It includes multiple sentences and should give you a good sense of how the voice sounds with natural speech patterns. The system can handle various types of content effectively.",
    long: "This is a longer text sample designed to test the streaming capabilities of our text-to-speech system. When processing longer content, the system intelligently breaks the text into smaller chunks and processes them sequentially. This approach provides faster initial feedback to users and prevents timeout issues that can occur with very long texts. The streaming feature is particularly useful when using voice cloning models, which require more processing time. By breaking the text into manageable pieces, users can start hearing the output almost immediately while the rest of the content is being processed in the background. This creates a much more responsive and user-friendly experience, especially for lengthy meeting summaries, detailed reports, or extended documentation that needs to be converted to speech."
  }

  useEffect(() => {
    if (isOpen) {
      loadVoiceProfiles()
    }
  }, [isOpen])

  const loadVoiceProfiles = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tts/voice-profiles')
      const profiles = response.data.profiles || []
      
      // Add default voice option
      const allProfiles = [
        { id: 'default', name: 'Default Voice', is_default: true },
        ...profiles
      ]
      
      setVoiceProfiles(allProfiles)
      
      // Validate current selection
      const profileExists = allProfiles.some(p => p.id === currentVoiceProfile)
      if (!profileExists && allProfiles.length > 0) {
        setCurrentVoiceProfile('default')
        localStorage.setItem('currentVoiceProfile', 'default')
      }
    } catch (error) {
      console.error('Error loading voice profiles:', error)
      setVoiceProfiles([{ id: 'default', name: 'Default Voice', is_default: true }])
    }
  }

  const handleVoiceProfileChange = (profileId: string) => {
    setCurrentVoiceProfile(profileId)
    localStorage.setItem('currentVoiceProfile', profileId)
  }

  const stopSpeaking = () => {
    if (currentSpeechAudio) {
      currentSpeechAudio.pause()
      setCurrentSpeechAudio(null)
    }
    setIsSpeaking(false)
    setIsGeneratingVoice(false)
    setStreamingProgress(null)
  }

  const speakText = async (inputText: string) => {
    if (!inputText.trim()) {
      setError('Please enter some text to speak')
      return
    }

    try {
      setIsSpeaking(true)
      setIsGeneratingVoice(true)
      setError('')
      console.log(`[TTS Test] Starting speech generation: ${inputText.slice(0, 100)}...`)
      console.log(`[TTS Test] Voice profile: ${currentVoiceProfile}`)
      console.log(`[TTS Test] Use streaming: ${useStreaming}`)
      
      // Stop any currently playing speech
      if (currentSpeechAudio) {
        currentSpeechAudio.pause()
        setCurrentSpeechAudio(null)
      }

      if (useStreaming || inputText.length > 200 || currentVoiceProfile !== 'default') {
        // Use streaming TTS
        await speakTextStreaming(inputText)
      } else {
        // Use regular TTS
        await speakTextRegular(inputText)
      }
      
    } catch (err: any) {
      console.error('Error generating speech:', err)
      setError(err.response?.data?.detail || err.message || 'Failed to generate speech')
      setIsSpeaking(false)
      setIsGeneratingVoice(false)
      setStreamingProgress(null)
      setCurrentSpeechAudio(null)
    }
  }

  const speakTextRegular = async (inputText: string) => {
    const requestPayload = {
      text: inputText,
      speech_type: speechType,
      voice_model: currentVoiceProfile
    }
    
    const timeoutDuration = currentVoiceProfile !== 'default' ? 180000 : 30000
    
    const response = await axios.post('http://127.0.0.1:8000/api/tts/speak', requestPayload, {
      responseType: 'blob',
      timeout: timeoutDuration
    })
    
    setIsGeneratingVoice(false)
    
    if (response.data.size === 0) {
      throw new Error('Received empty audio file from server')
    }
    
    const audioBlob = new Blob([response.data], { type: 'audio/wav' })
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    
    audio.preload = 'auto'
    audio.volume = 1.0
    
    setCurrentSpeechAudio(audio)
    
    audio.onended = () => {
      console.log('[TTS Test] Audio playback ended')
      setIsSpeaking(false)
      setIsGeneratingVoice(false)
      setCurrentSpeechAudio(null)
      URL.revokeObjectURL(audioUrl)
    }
    
    audio.onerror = (e) => {
      console.error('[TTS Test] Audio playback error:', e)
      setIsSpeaking(false)
      setIsGeneratingVoice(false)
      setCurrentSpeechAudio(null)
      URL.revokeObjectURL(audioUrl)
      setError(`Audio playback error: ${audio.error?.message || 'Unknown audio error'}`)
    }
    
    await audio.play()
  }

  const speakTextStreaming = async (inputText: string) => {
    const chunkSize = currentVoiceProfile !== 'default' ? 80 : 150
    
    const requestPayload = {
      text: inputText,
      speech_type: speechType,
      voice_model: currentVoiceProfile,
      chunk_size: chunkSize
    }
    
    const timeoutDuration = currentVoiceProfile !== 'default' ? 300000 : 60000
    
    const response = await axios.post('http://127.0.0.1:8000/api/tts/speak-stream', requestPayload, {
      timeout: timeoutDuration
    })
    
    const { chunks, total_chunks } = response.data
    console.log(`[TTS Test Streaming] Received ${total_chunks} audio chunks`)
    
    setIsGeneratingVoice(false)
    setStreamingProgress({ current: 0, total: total_chunks })
    
    if (chunks.length === 0) {
      throw new Error('No audio chunks were generated')
    }
    
    await playAudioChunksSequentially(chunks)
  }

  const playAudioChunksSequentially = async (chunks: any[]) => {
    console.log(`[TTS Test Streaming] Starting playback of ${chunks.length} chunks`)
    let currentChunkIndex = 0
    let shouldContinuePlaying = true
    
    const playNextChunk = async () => {
      if (currentChunkIndex >= chunks.length || !shouldContinuePlaying) {
        console.log('[TTS Test Streaming] Playback complete')
        setIsSpeaking(false)
        setStreamingProgress(null)
        setCurrentSpeechAudio(null)
        return
      }
      
      const chunk = chunks[currentChunkIndex]
      console.log(`[TTS Test Streaming] Playing chunk ${currentChunkIndex + 1}/${chunks.length}`)
      setStreamingProgress({ current: currentChunkIndex + 1, total: chunks.length })
      
      try {
        const chunkResponse = await axios.get(`http://127.0.0.1:8000${chunk.url}`, {
          responseType: 'blob',
          timeout: 30000
        })
        
        if (chunkResponse.data.size === 0) {
          console.warn(`[TTS Test Streaming] Chunk ${currentChunkIndex + 1} has zero size, skipping`)
          currentChunkIndex++
          await playNextChunk()
          return
        }
        
        const audioBlob = new Blob([chunkResponse.data], { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        audio.preload = 'metadata'
        audio.volume = 1.0
        
        setCurrentSpeechAudio(audio)
        
        const playPromise = new Promise<void>((resolve, reject) => {
          let isResolved = false
          
          const cleanup = () => {
            if (!isResolved) {
              URL.revokeObjectURL(audioUrl)
              isResolved = true
            }
          }
          
          audio.onended = () => {
            console.log(`[TTS Test Streaming] Chunk ${currentChunkIndex + 1} completed`)
            cleanup()
            resolve()
          }
          
          audio.onerror = (e) => {
            console.error(`[TTS Test Streaming] Audio error for chunk ${currentChunkIndex + 1}:`, e)
            cleanup()
            reject(new Error(`Audio playback failed: ${audio.error?.message || 'Unknown error'}`))
          }
          
          audio.onabort = () => {
            console.log(`[TTS Test Streaming] Chunk ${currentChunkIndex + 1} aborted`)
            cleanup()
            reject(new Error('Audio playback aborted'))
          }
          
          const timeoutId = setTimeout(() => {
            if (!isResolved) {
              console.error(`[TTS Test Streaming] Timeout for chunk ${currentChunkIndex + 1}`)
              cleanup()
              reject(new Error('Audio playback timeout'))
            }
          }, 30000)
          
          const originalResolve = resolve
          const originalReject = reject
          resolve = () => {
            clearTimeout(timeoutId)
            originalResolve()
          }
          reject = (error) => {
            clearTimeout(timeoutId)
            originalReject(error)
          }
          
          audio.play().catch(reject)
        })
        
        await playPromise
        currentChunkIndex++
        
        // Check if user stopped playback
        if (!isSpeaking) {
          shouldContinuePlaying = false
          return
        }
        
        await playNextChunk()
        
      } catch (chunkError) {
        console.error(`[TTS Test Streaming] Error processing chunk ${currentChunkIndex + 1}:`, chunkError)
        currentChunkIndex++
        if (isSpeaking) {
          await playNextChunk()
        }
      }
    }
    
    await playNextChunk()
  }

  const loadSampleText = (type: 'short' | 'medium' | 'long') => {
    setText(sampleTexts[type])
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content tts-test-modal">
        <div className="modal-header">
          <h2>🔊 Text-to-Speech Testing</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="tts-test-content">
          {/* Voice Settings */}
          <div className="voice-settings">
            <div className="setting-group">
              <label>Voice Profile:</label>
              <select 
                value={currentVoiceProfile} 
                onChange={(e) => handleVoiceProfileChange(e.target.value)}
                disabled={isSpeaking}
              >
                {voiceProfiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} {profile.is_default ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="setting-group">
              <label>Speech Type:</label>
              <select 
                value={speechType} 
                onChange={(e) => setSpeechType(e.target.value as any)}
                disabled={isSpeaking}
              >
                <option value="summary">Summary</option>
                <option value="keypoints">Key Points</option>
                <option value="actionitems">Action Items</option>
              </select>
            </div>
            
            <div className="setting-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={useStreaming} 
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  disabled={isSpeaking}
                />
                Force Streaming Mode
              </label>
            </div>
          </div>

          {/* Sample Text Buttons */}
          <div className="sample-texts">
            <h3>Quick Test Samples:</h3>
            <div className="sample-buttons">
              <button 
                className="sample-btn" 
                onClick={() => loadSampleText('short')}
                disabled={isSpeaking}
              >
                Short Text
              </button>
              <button 
                className="sample-btn" 
                onClick={() => loadSampleText('medium')}
                disabled={isSpeaking}
              >
                Medium Text
              </button>
              <button 
                className="sample-btn" 
                onClick={() => loadSampleText('long')}
                disabled={isSpeaking}
              >
                Long Text (Streaming)
              </button>
            </div>
          </div>

          {/* Text Input */}
          <div className="text-input-section">
            <label htmlFor="tts-text">Enter text to speak:</label>
            <textarea
              id="tts-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or paste the text you want to convert to speech..."
              rows={8}
              disabled={isSpeaking}
            />
            <div className="text-info">
              Characters: {text.length} | 
              Words: {text.trim() ? text.trim().split(/\s+/).length : 0} |
              Will use: {(useStreaming || text.length > 200 || currentVoiceProfile !== 'default') ? 'Streaming' : 'Regular'} TTS
            </div>
          </div>

          {/* Controls */}
          <div className="tts-controls">
            {!isSpeaking ? (
              <button 
                className="speak-btn"
                onClick={() => speakText(text)}
                disabled={!text.trim() || isGeneratingVoice}
              >
                <Volume2 className="btn-icon" />
                {isGeneratingVoice ? 'Generating...' : 'Speak Text'}
              </button>
            ) : (
              <button 
                className="stop-btn"
                onClick={stopSpeaking}
              >
                <VolumeX className="btn-icon" />
                Stop Speaking
              </button>
            )}
          </div>

          {/* Progress */}
          {isGeneratingVoice && (
            <div className="generation-progress">
              <Loader2 className="spinner" />
              <span>
                {currentVoiceProfile !== 'default' 
                  ? 'Generating AI voice (this may take 1-3 minutes)...' 
                  : 'Generating speech...'
                }
              </span>
            </div>
          )}

          {streamingProgress && (
            <div className="streaming-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(streamingProgress.current / streamingProgress.total) * 100}%` }}
                />
              </div>
              <span>Playing chunk {streamingProgress.current} of {streamingProgress.total}</span>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* Info Panel */}
          <div className="info-panel">
            <h4>💡 Tips:</h4>
            <ul>
              <li>Streaming mode automatically activates for long texts (200+ chars) or voice cloning</li>
              <li>Voice cloning provides personalized speech but takes longer to process</li>
              <li>Use sample texts to quickly test different lengths and features</li>
              <li>The system breaks long texts into chunks for faster initial response</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TTSTestPage
