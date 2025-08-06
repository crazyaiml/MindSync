import { useState, useRef, useEffect } from 'react'
import { Upload, Loader2, FileAudio, CheckCircle, Mic, Square, Play, Pause, History, Trash2, Edit3, Check, X, Volume2, VolumeX } from 'lucide-react'
import axios from 'axios'
import PronunciationManager from './components/PronunciationManager'
import ChatInterface from './components/ChatInterface'
import VoiceManager from './components/VoiceManager'
import TTSTestPage from './components/TTSTestPage'
import './App.css'

interface MeetingSummary {
  id: string
  title: string
  transcript: string
  summary: string
  key_points: string[]
  action_items: string[]
  created_at: string
  file_name?: string
  duration?: number
  language?: string
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummary | null>(null)
  const [error, setError] = useState<string>('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [meetingsHistory, setMeetingsHistory] = useState<MeetingSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  
  // Edit meeting state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null)
  
  // Pronunciation manager state
  const [showPronunciationManager, setShowPronunciationManager] = useState(false)
  
  // Chat interface state
  const [showChatInterface, setShowChatInterface] = useState(false)
  
  // Voice manager state
  const [showVoiceManager, setShowVoiceManager] = useState(false)
  const [currentVoiceProfile, setCurrentVoiceProfile] = useState(() => {
    // Initialize from localStorage if available, otherwise use 'default'
    return localStorage.getItem('currentVoiceProfile') || 'default'
  })
  
  // TTS Test Page state
  const [showTTSTestPage, setShowTTSTestPage] = useState(false)
  
  // Real-time assistant state
  const [isRealTimeMode, setIsRealTimeMode] = useState(false)
  const [realTimeTranscript, setRealTimeTranscript] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Text-to-Speech states
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false)
  const [currentSpeechAudio, setCurrentSpeechAudio] = useState<HTMLAudioElement | null>(null)
  const [voiceModelTrained, setVoiceModelTrained] = useState(false)
  const [streamingProgress, setStreamingProgress] = useState<{ current: number; total: number } | null>(null)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<number | null>(null)
  const chunkingIntervalRef = useRef<number | null>(null)  // Separate ref for chunking
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const stopRequestedRef = useRef<boolean>(false)

  // Check voice training status on app startup
  useEffect(() => {
    checkVoiceStatus()
  }, [])

  const checkVoiceStatus = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tts/voice-status')
      const status = response.data
      console.log('[TTS] Voice status on startup:', status)
      
      // Update voice model trained status based on available profiles
      if (status.total_profiles > 0) {
        setVoiceModelTrained(true)
        console.log('[TTS] Voice profiles found - TTS available!')
        
        // If no specific voice profile is selected and profiles exist, load them and select the first one
        if (currentVoiceProfile === 'default') {
          console.log('[TTS] Current voice profile is default, checking for available profiles...')
          try {
            const profilesResponse = await axios.get('http://127.0.0.1:8000/api/tts/voice-profiles')
            const profiles = profilesResponse.data.profiles || []
            console.log('[TTS] Available profiles:', profiles)
            if (profiles.length > 0) {
              const firstProfile = profiles[0]
              setCurrentVoiceProfile(firstProfile.id)
              localStorage.setItem('currentVoiceProfile', firstProfile.id)
              console.log(`[TTS] Auto-selected first voice profile: ${firstProfile.name} (${firstProfile.id})`)
            } else {
              console.log('[TTS] No voice profiles available for auto-selection')
            }
          } catch (error) {
            console.error('[TTS] Error loading voice profiles for auto-selection:', error)
          }
        } else {
          // Validate that the current voice profile still exists
          console.log(`[TTS] Current voice profile from storage: ${currentVoiceProfile}`)
          try {
            const profilesResponse = await axios.get('http://127.0.0.1:8000/api/tts/voice-profiles')
            const profiles = profilesResponse.data.profiles || []
            const profileExists = profiles.some((p: any) => p.id === currentVoiceProfile)
            
            if (!profileExists && profiles.length > 0) {
              console.log(`[TTS] Stored profile ${currentVoiceProfile} no longer exists, selecting first available`)
              const firstProfile = profiles[0]
              setCurrentVoiceProfile(firstProfile.id)
              localStorage.setItem('currentVoiceProfile', firstProfile.id)
              console.log(`[TTS] Auto-selected replacement voice profile: ${firstProfile.name} (${firstProfile.id})`)
            } else if (!profileExists) {
              console.log(`[TTS] Stored profile ${currentVoiceProfile} no longer exists, reverting to default`)
              setCurrentVoiceProfile('default')
              localStorage.setItem('currentVoiceProfile', 'default')
            } else {
              console.log(`[TTS] Current voice profile validated: ${currentVoiceProfile}`)
            }
          } catch (error) {
            console.error('[TTS] Error validating voice profile:', error)
          }
        }
      } else {
        setVoiceModelTrained(false)
        console.log('[TTS] No voice profiles found')
      }
    } catch (error) {
      console.error('[TTS] Error checking voice status:', error)
      // Don't set error state, just assume not trained
      setVoiceModelTrained(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startRealTimeRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Setup WebSocket connection
      const ws = new WebSocket('ws://127.0.0.1:8000/api/real-time/ws/real-time-transcribe')
      setWsConnection(ws)
      
      ws.onopen = () => {
        console.log('WebSocket connected successfully')
        // Send start_session with ai_assistant mode to use VOSK
        ws.send(JSON.stringify({ 
          command: 'start_session', 
          mode: 'ai_assistant'  // This will use VOSK for real-time transcription
        }))
      }
      
      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason)
        console.log('📊 Close event details:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          type: event.type
        })
        if (event.code !== 1000) { // Not a normal close
          console.warn('⚠️ WebSocket closed unexpectedly, code:', event.code)
          if (event.code === 1006) {
            console.warn('⚠️ Code 1006: Connection was closed abnormally (e.g., without sending or receiving a Close control frame)')
          }
          setError(`WebSocket connection lost unexpectedly (code: ${event.code})`)
        }
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        console.log('Received WebSocket data:', data)
        
        if (data.type === 'session_started') {
          setSessionId(data.session_id)
          console.log('✅ Session started:', data.session_id, 'Engine:', data.engine)
        } else if (data.session_id && data.hasOwnProperty('transcription')) {
          // Handle transcription updates (even if transcription is empty)
          console.log('📝 Processing transcription:', data.transcription)
          console.log('📄 Full transcript:', data.full_transcript)
          
          if (data.full_transcript) {
            setRealTimeTranscript(data.full_transcript)
            console.log('🔄 Updated live transcript display')
          }
          
          if (data.transcription && data.transcription.trim()) {
            console.log('🎯 New transcription chunk:', data.transcription)
          }
          
          if (data.suggestions && data.suggestions.length > 0) {
            console.log('💡 Adding suggestions:', data.suggestions)
            setSuggestions(prev => [...prev, ...data.suggestions])
          }
        } else if (data.type === 'error') {
          console.error('❌ WebSocket error from server:', data.error)
          setError(`Real-time error: ${data.error}`)
        } else {
          console.log('❓ Unhandled WebSocket message type:', data)
        }
        
        // Handle errors in transcription response
        if (data.error) {
          console.warn('⚠️ Transcription error received:', data.error)
          // Don't set it as a global error since these are expected during processing
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setError('Real-time connection failed')
      }
      
      // Setup MediaRecorder for streaming - collect complete audio chunks
      let options: MediaRecorderOptions = {}
      // For real-time mode, prefer formats that work well with FFmpeg
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4'
      }
      
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      
      // Collect complete audio files and send them
      let currentChunks: Blob[] = []
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('📊 MediaRecorder data available:', event.data.size, 'bytes')
        if (event.data.size > 0) {
          currentChunks.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        console.log('⏹️ MediaRecorder stopped, chunks:', currentChunks.length)
        if (currentChunks.length > 0 && ws.readyState === WebSocket.OPEN) {
          // Create complete audio blob and send
          const completeBlob = new Blob(currentChunks, { type: mediaRecorder.mimeType })
          console.log(`🚀 Sending complete audio file: ${completeBlob.size} bytes, type: ${mediaRecorder.mimeType}`)
          ws.send(completeBlob)
          currentChunks = [] // Clear for next recording
          
          // Restart recording after a brief pause (if still in real-time mode)
          if (isRealTimeMode && !stopRequestedRef.current) {
            setTimeout(() => {
              if (mediaRecorderRef.current && isRealTimeMode && !stopRequestedRef.current) {
                try {
                  console.log('🔄 Restarting MediaRecorder for next chunk...')
                  mediaRecorderRef.current.start()
                  console.log('✅ MediaRecorder restarted successfully')
                } catch (error) {
                  console.error('❌ Failed to restart recording:', error)
                }
              }
            }, 100) // Brief pause before restarting
          }
        }
        
        // Final cleanup when completely stopping
        if (stopRequestedRef.current) {
          console.log('🛑 Final cleanup - stopping stream and ending session')
          stream.getTracks().forEach(track => track.stop())
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'end_session' }))
          }
        }
      }
      
      // Track stop requests to avoid infinite restart loop
      stopRequestedRef.current = false
      
      // Function to manually trigger stops for chunking (every 2 seconds for faster feedback)
      const chunkingInterval = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !stopRequestedRef.current) {
          console.log('Stopping MediaRecorder for chunking...')
          mediaRecorderRef.current.stop() // This will trigger ondataavailable and automatic restart
        }
      }, 2000) // 2-second chunks for faster feedback
      
      // Store chunking interval for cleanup (separate from recording timer)
      chunkingIntervalRef.current = chunkingInterval
      
      // Start initial recording
      console.log('🎙️ Starting initial MediaRecorder...')
      mediaRecorder.start() // Start without timeslice to get complete files
      setIsRecording(true)
      setIsRealTimeMode(true)
      setRecordingTime(0)
      console.log('✅ MediaRecorder started successfully')
      
      // Start recording timer (separate from chunking)
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      console.error('Error starting real-time recording:', err)
      setError('Could not start real-time recording')
    }
  }

  const stopRealTimeRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      stopRequestedRef.current = true // Signal to stop automatic restart
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsRealTimeMode(false)
      
      // Clean up both intervals
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
      if (chunkingIntervalRef.current) {
        clearInterval(chunkingIntervalRef.current)
      }
      
      if (wsConnection) {
        wsConnection.close()
        setWsConnection(null)
      }
    }
  }

  const clearRealTimeSession = () => {
    setRealTimeTranscript('')
    setSuggestions([])
    setSessionId(null)
    setIsRealTimeMode(false)
  }

  const speakText = async (text: string, type: 'summary' | 'keypoints' | 'actionitems' = 'summary') => {
    try {
      setIsSpeaking(true)
      setIsGeneratingVoice(true)
      console.log(`[TTS] Starting speech generation for ${type}: ${text.slice(0, 100)}...`)
      console.log(`[TTS] Current voice profile: ${currentVoiceProfile}`)
      console.log(`[TTS] Voice model trained: ${voiceModelTrained}`)
      
      // Show progress message for voice cloning
      if (currentVoiceProfile !== 'default') {
        console.log('[TTS] Starting AI voice cloning - this may take up to 2-3 minutes...')
      }
      
      // Stop any currently playing speech
      if (currentSpeechAudio) {
        currentSpeechAudio.pause()
        setCurrentSpeechAudio(null)
      }
      
      // Send text to TTS API
      const requestPayload = {
        text: text,
        speech_type: type,
        voice_model: currentVoiceProfile // Use selected voice profile instead of boolean
      }
      console.log('[TTS] Request payload:', requestPayload)
      
      // Use longer timeout for voice cloning requests (up to 3 minutes)
      const timeoutDuration = currentVoiceProfile !== 'default' ? 180000 : 30000
      console.log(`[TTS] Using timeout: ${timeoutDuration}ms for voice model: ${currentVoiceProfile}`)
      
      const response = await axios.post('http://127.0.0.1:8000/api/tts/speak', requestPayload, {
        responseType: 'blob',
        timeout: timeoutDuration // 3 minutes for voice cloning, 30 seconds for default
      })
      
      setIsGeneratingVoice(false) // Voice generation complete, now loading audio
      
      console.log(`[TTS] Response received, size: ${response.data.size} bytes`)
      console.log(`[TTS] Response headers:`, response.headers)
      
      if (currentVoiceProfile !== 'default') {
        console.log('[TTS] Voice cloning completed successfully!')
      }
      
      if (response.data.size === 0) {
        throw new Error('Received empty audio file from server')
      }
      
      // Create audio URL and play
      const audioBlob = new Blob([response.data], { type: 'audio/wav' })
      const audioUrl = URL.createObjectURL(audioBlob)
      console.log(`[TTS] Created audio URL: ${audioUrl}`)
      
      const audio = new Audio(audioUrl)
      
      // Set audio properties for better compatibility
      audio.preload = 'auto'
      audio.volume = 1.0
      
      // Add comprehensive event listeners
      audio.onloadstart = () => console.log('[TTS] Audio loading started')
      audio.oncanplay = () => console.log('[TTS] Audio can start playing')
      audio.onplay = () => console.log('[TTS] Audio playback started')
      audio.onpause = () => console.log('[TTS] Audio playback paused')
      audio.onwaiting = () => console.log('[TTS] Audio waiting for data')
      audio.onsuspend = () => console.log('[TTS] Audio loading suspended')
      
      setCurrentSpeechAudio(audio)
      
      audio.onended = () => {
        console.log('[TTS] Audio playback ended')
        setIsSpeaking(false)
        setIsGeneratingVoice(false)
        setCurrentSpeechAudio(null)
        URL.revokeObjectURL(audioUrl)
      }
      
      audio.onerror = (e) => {
        console.error('[TTS] Audio playback error:', e)
        console.error('[TTS] Audio error details:', audio.error)
        setIsSpeaking(false)
        setIsGeneratingVoice(false)
        setCurrentSpeechAudio(null)
        URL.revokeObjectURL(audioUrl)
        setError(`Audio playback error: ${audio.error?.message || 'Unknown audio error'}`)
      }
      
      audio.onabort = () => {
        console.log('[TTS] Audio playback aborted')
        setIsSpeaking(false)
        setIsGeneratingVoice(false)
        setCurrentSpeechAudio(null)
        URL.revokeObjectURL(audioUrl)
      }
      
      // Try to play the audio
      try {
        console.log('[TTS] Attempting to play audio...')
        await audio.play()
        console.log('[TTS] Audio play() promise resolved successfully')
      } catch (playError: any) {
        console.error('[TTS] Audio play() failed:', playError)
        setIsSpeaking(false)
        setCurrentSpeechAudio(null)
        URL.revokeObjectURL(audioUrl)
        setError(`Failed to play audio: ${playError.message}`)
      }
      
    } catch (err: any) {
      console.error('Error generating speech:', err)
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      })
      setError(err.response?.data?.detail || err.message || 'Failed to generate speech')
      setIsSpeaking(false)
      setIsGeneratingVoice(false)
      setCurrentSpeechAudio(null)
    }
  }

  const stopSpeaking = () => {
    if (currentSpeechAudio) {
      currentSpeechAudio.pause()
      setCurrentSpeechAudio(null)
    }
    
    // Stop streaming playback if it's active
    if ((playAudioChunksSequentially as any).stopPlayback) {
      (playAudioChunksSequentially as any).stopPlayback()
    }
    
    setIsSpeaking(false)
    setIsGeneratingVoice(false)
    setStreamingProgress(null)
  }

  const testAudioPlayback = async () => {
    console.log('[TEST] Testing audio playback with user interaction...')
    try {
      // Test with a simple beep sound
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.value = 800
      gainNode.gain.value = 0.1
      
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)
      
      console.log('[TEST] ✅ AudioContext test passed')
      
      // Now test with actual audio file
      const response = await axios.get('http://127.0.0.1:8000/api/tts/chunk/speech_chunk_ff3d6d7ddbf9437d956759afc190bb04_0.wav', {
        responseType: 'blob'
      })
      
      const audioBlob = new Blob([response.data], { type: 'audio/wav' })
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      
      console.log('[TEST] Testing actual audio file playback...')
      await audio.play()
      console.log('[TEST] ✅ Audio file test passed')
      
    } catch (error) {
      console.error('[TEST] ❌ Audio test failed:', error)
    }
  }

  const speakTextStreaming = async (text: string, type: 'summary' | 'keypoints' | 'actionitems' = 'summary') => {
    console.log('[TTS Streaming] Function called with:', { textLength: text.length, type })
    
    try {
      setIsSpeaking(true)
      setIsGeneratingVoice(true)
      console.log(`[TTS Streaming] Starting streaming speech generation for ${type}: ${text.slice(0, 100)}...`)
      console.log(`[TTS Streaming] Current voice profile: ${currentVoiceProfile}`)
      
      // Stop any currently playing speech
      if (currentSpeechAudio) {
        currentSpeechAudio.pause()
        setCurrentSpeechAudio(null)
      }
      
      // Test user interaction capability first with proper data URL
      console.log('[TTS Streaming] Testing audio permission with silent audio...')
      try {
        // Create a minimal silence audio data URL to test autoplay
        const silenceDataUrl = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
        const testAudio = new Audio(silenceDataUrl)
        testAudio.volume = 0.01 // Very low but not muted
        await testAudio.play()
        testAudio.pause()
        console.log('[TTS Streaming] ✅ Audio permission test passed - autoplay allowed')
      } catch (permError) {
        console.warn('[TTS Streaming] ⚠️ Audio permission test failed:', permError)
        console.log('[TTS Streaming] ⚠️ Browser autoplay policy may block audio - user interaction required')
        // Still continue, but warn about potential issues
      }
      
      // Determine chunk size based on voice model (smaller chunks for voice cloning)
      const chunkSize = currentVoiceProfile !== 'default' ? 80 : 150
      
      // Send text to streaming TTS API
      const requestPayload = {
        text: text,
        speech_type: type,
        voice_model: currentVoiceProfile,
        chunk_size: chunkSize
      }
      console.log('[TTS Streaming] Request payload:', requestPayload)
      
      const timeoutDuration = currentVoiceProfile !== 'default' ? 300000 : 60000 // 5 min for voice cloning
      console.log(`[TTS Streaming] Using timeout: ${timeoutDuration}ms for streaming`)
      
      const response = await axios.post('http://127.0.0.1:8000/api/tts/speak-stream', requestPayload, {
        timeout: timeoutDuration
      })
      
      const { chunks, total_chunks } = response.data
      console.log(`[TTS Streaming] Received ${total_chunks} audio chunks`)
      
      setIsGeneratingVoice(false) // Generation complete, now playing
      setStreamingProgress({ current: 0, total: total_chunks })
      
      if (chunks.length === 0) {
        throw new Error('No audio chunks were generated')
      }
      
      // Play chunks sequentially
      console.log('[TTS Streaming] About to call playAudioChunksSequentially with chunks:', chunks)
      console.log(`[TTS Streaming] Current isSpeaking state before playAudioChunksSequentially: ${isSpeaking}`)
      await playAudioChunksSequentially(chunks)
      
    } catch (err: any) {
      console.error('Error generating streaming speech:', err)
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      })
      setError(err.response?.data?.detail || err.message || 'Failed to generate streaming speech')
      setIsSpeaking(false)
      setIsGeneratingVoice(false)
      setStreamingProgress(null)
      setCurrentSpeechAudio(null)
    }
  }

  const playAudioChunksSequentially = async (chunks: any[]) => {
    console.log(`[TTS Streaming] Starting playback of ${chunks.length} chunks`)
    let currentChunkIndex = 0
    let shouldContinuePlaying = true // Use local variable instead of relying on isSpeaking state
    
    // Create a way to stop the playback externally
    const stopPlayback = () => {
      shouldContinuePlaying = false
      console.log('[TTS Streaming] Playback stopped externally')
    }
    
    // Store the stop function so it can be called from outside
    ;(playAudioChunksSequentially as any).stopPlayback = stopPlayback
    
    const playNextChunk = async () => {
      console.log(`[TTS Streaming] playNextChunk called: currentChunkIndex=${currentChunkIndex}, chunks.length=${chunks.length}, shouldContinuePlaying=${shouldContinuePlaying}`)
      
      if (currentChunkIndex >= chunks.length || !shouldContinuePlaying) {
        console.log('[TTS Streaming] Playback complete - sequence finished')
        setIsSpeaking(false)
        setStreamingProgress(null)
        setCurrentSpeechAudio(null)
        return
      }
      
      const chunk = chunks[currentChunkIndex]
      console.log(`[TTS Streaming] Processing chunk ${currentChunkIndex + 1}/${chunks.length}:`, {
        text: chunk.text.slice(0, 50) + '...',
        url: chunk.url,
        filename: chunk.filename,
        chunk_id: chunk.chunk_id
      })
      setStreamingProgress({ current: currentChunkIndex + 1, total: chunks.length })
      
      try {
        // Fetch the audio chunk
        console.log(`[TTS Streaming] Fetching audio from: http://127.0.0.1:8000${chunk.url}`)
        const chunkResponse = await axios.get(`http://127.0.0.1:8000${chunk.url}`, {
          responseType: 'blob',
          timeout: 30000
        })
        
        console.log(`[TTS Streaming] Received blob for chunk ${currentChunkIndex + 1}:`, {
          size: chunkResponse.data.size,
          type: chunkResponse.data.type,
          validBlob: chunkResponse.data instanceof Blob
        })
        
        if (chunkResponse.data.size === 0) {
          console.warn(`[TTS Streaming] Chunk ${currentChunkIndex + 1} has zero size, skipping`)
          currentChunkIndex++
          await playNextChunk()
          return
        }
        
        // Create audio URL and play
        const audioBlob = new Blob([chunkResponse.data], { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        
        console.log(`[TTS Streaming] Created audio object for chunk ${currentChunkIndex + 1}:`, {
          url: audioUrl.slice(0, 50) + '...',
          readyState: audio.readyState,
          networkState: audio.networkState
        })
        
        audio.preload = 'metadata'
        audio.volume = 1.0
        
        setCurrentSpeechAudio(audio)
        
        // Promise-based audio playback to ensure proper sequencing
        const playPromise = new Promise<void>((resolve, reject) => {
          let isResolved = false
          
          const cleanup = () => {
            if (!isResolved) {
              URL.revokeObjectURL(audioUrl)
              isResolved = true
            }
          }
          
          audio.onended = () => {
            console.log(`[TTS Streaming] ✅ Chunk ${currentChunkIndex + 1} playback ended naturally`)
            cleanup()
            resolve()
          }
          
          audio.onerror = (e) => {
            console.error(`[TTS Streaming] ❌ Audio error for chunk ${currentChunkIndex + 1}:`, e)
            console.error('Audio element error details:', {
              code: audio.error?.code,
              message: audio.error?.message,
              readyState: audio.readyState,
              networkState: audio.networkState
            })
            cleanup()
            reject(new Error(`Audio playback failed: ${audio.error?.message || 'Unknown error'}`))
          }
          
          audio.onabort = () => {
            console.log(`[TTS Streaming] ⏹️ Chunk ${currentChunkIndex + 1} playback aborted`)
            cleanup()
            reject(new Error('Audio playback aborted'))
          }
          
          audio.oncanplaythrough = () => {
            console.log(`[TTS Streaming] 📡 Chunk ${currentChunkIndex + 1} can play through (ready to play)`)
          }
          
          audio.onloadstart = () => {
            console.log(`[TTS Streaming] 🔄 Chunk ${currentChunkIndex + 1} load started`)
          }
          
          audio.onloadeddata = () => {
            console.log(`[TTS Streaming] 📥 Chunk ${currentChunkIndex + 1} data loaded`)
          }
          
          audio.onloadedmetadata = () => {
            console.log(`[TTS Streaming] 📋 Chunk ${currentChunkIndex + 1} metadata loaded, duration: ${audio.duration}s`)
          }
          
          audio.onplay = () => {
            console.log(`[TTS Streaming] ▶️ Chunk ${currentChunkIndex + 1} playback started`)
          }
          
          audio.onpause = () => {
            console.log(`[TTS Streaming] ⏸️ Chunk ${currentChunkIndex + 1} playback paused`)
          }
          
          audio.ontimeupdate = () => {
            // Only log occasionally to avoid spam
            if (Math.floor(audio.currentTime * 4) % 4 === 0) {
              console.log(`[TTS Streaming] ⏰ Chunk ${currentChunkIndex + 1} time: ${audio.currentTime.toFixed(1)}s / ${audio.duration.toFixed(1)}s`)
            }
          }
          
          // Add a timeout as safety net
          const timeoutId = setTimeout(() => {
            if (!isResolved) {
              console.error(`[TTS Streaming] ⏱️ Timeout waiting for chunk ${currentChunkIndex + 1} to complete`)
              cleanup()
              reject(new Error('Audio playback timeout'))
            }
          }, 30000) // 30 second timeout per chunk
          
          // Clear timeout when resolved
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
          
          // Start playing
          console.log(`[TTS Streaming] 🎵 Attempting to play chunk ${currentChunkIndex + 1}`)
          audio.play().then(() => {
            console.log(`[TTS Streaming] ✅ Play() promise resolved for chunk ${currentChunkIndex + 1}`)
          }).catch((playError) => {
            console.error(`[TTS Streaming] ❌ Play() promise rejected for chunk ${currentChunkIndex + 1}:`, playError)
            reject(playError)
          })
        })
        
        // Wait for current chunk to finish before moving to next
        console.log(`[TTS Streaming] ⏳ Waiting for chunk ${currentChunkIndex + 1} to complete...`)
        await playPromise
        console.log(`[TTS Streaming] ✅ Chunk ${currentChunkIndex + 1} completed, moving to next`)
        
        currentChunkIndex++
        
        // Add a small delay between chunks to ensure proper cleanup
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if we should continue playing before moving to next chunk
        if (shouldContinuePlaying && currentChunkIndex < chunks.length) {
          await playNextChunk() // Play next chunk
        } else {
          console.log(`[TTS Streaming] Stopping playback: shouldContinuePlaying=${shouldContinuePlaying}, currentChunkIndex=${currentChunkIndex}, chunks.length=${chunks.length}`)
          setIsSpeaking(false)
          setStreamingProgress(null)
          setCurrentSpeechAudio(null)
        }
        
      } catch (chunkError) {
        console.error(`[TTS Streaming] 💥 Error processing chunk ${currentChunkIndex + 1}:`, chunkError)
        // Try to continue with next chunk
        console.log(`[TTS Streaming] 🔄 Attempting to continue with next chunk...`)
        currentChunkIndex++
        
        // Check if we should continue playing after error
        if (shouldContinuePlaying && currentChunkIndex < chunks.length) {
          await playNextChunk()
        } else {
          console.log(`[TTS Streaming] Stopping playback after error: shouldContinuePlaying=${shouldContinuePlaying}`)
          setIsSpeaking(false)
          setStreamingProgress(null)
          setCurrentSpeechAudio(null)
        }
      }
    }
    
    console.log('[TTS Streaming] 🚀 Starting chunk playback sequence...')
    await playNextChunk()
  }

  const speakTextIntelligent = async (text: string, type: 'summary' | 'keypoints' | 'actionitems' = 'summary') => {
    // Use streaming for longer texts or voice cloning to improve responsiveness
    const useStreaming = text.length > 200 || currentVoiceProfile !== 'default'
    
    console.log(`[TTS] Using ${useStreaming ? 'streaming' : 'regular'} TTS for ${text.length} chars`)
    console.log(`[TTS] Current voice profile: ${currentVoiceProfile}`)
    console.log(`[TTS] Use streaming conditions: text.length > 200: ${text.length > 200}, currentVoiceProfile !== 'default': ${currentVoiceProfile !== 'default'}`)
    
    try {
      if (useStreaming) {
        console.log('[TTS] About to call speakTextStreaming...')
        await speakTextStreaming(text, type)
        console.log('[TTS] speakTextStreaming completed')
      } else {
        console.log('[TTS] About to call speakText...')
        await speakText(text, type)
        console.log('[TTS] speakText completed')
      }
    } catch (error) {
      console.error('[TTS] Error in speakTextIntelligent:', error)
      setError(`TTS Error: ${error}`)
    }
  }

  const handleVoiceProfileSelected = (profileId: string) => {
    setCurrentVoiceProfile(profileId)
    localStorage.setItem('currentVoiceProfile', profileId)
    console.log(`[TTS] Voice profile selected and saved: ${profileId}`)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Try to use a compatible audio format
      let options: MediaRecorderOptions = {}
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus'
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4'
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm'
      }
      
      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType })
        setRecordedBlob(audioBlob)
        
        // Create file from blob for processing (but don't auto-set as selectedFile)
        // const file = new File([audioBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })
        // setSelectedFile(file)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      
      // Start timer
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      setError('Unable to access microphone. Please check permissions.')
      console.error('Error accessing microphone:', err)
    }
  }

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume()
        setIsPaused(false)
        // Resume timer
        recordingIntervalRef.current = window.setInterval(() => {
          setRecordingTime(prev => prev + 1)
        }, 1000)
      } else {
        mediaRecorderRef.current.pause()
        setIsPaused(true)
        // Pause timer
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current)
        }
      }
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
      }
    }
  }

  const playRecording = () => {
    if (recordedBlob) {
      if (isPlaying) {
        audioElementRef.current?.pause()
        setIsPlaying(false)
      } else {
        const audioUrl = URL.createObjectURL(recordedBlob)
        const audio = new Audio(audioUrl)
        audioElementRef.current = audio
        
        audio.onended = () => {
          setIsPlaying(false)
          URL.revokeObjectURL(audioUrl)
        }
        
        audio.play()
        setIsPlaying(true)
      }
    }
  }

  const clearRecording = () => {
    setRecordedBlob(null)
    setSelectedFile(null)
    setRecordingTime(0)
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      setIsPlaying(false)
    }
  }

  const fetchMeetingsHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/meetings/')
      setMeetingsHistory(response.data)
    } catch (err) {
      console.error('Error fetching meetings history:', err)
      setError('Failed to load meetings history')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const deleteMeeting = async (meetingId: string) => {
    try {
      await axios.delete(`http://127.0.0.1:8000/api/meetings/${meetingId}`)
      setMeetingsHistory(prev => prev.filter(meeting => meeting.id !== meetingId))
    } catch (err) {
      console.error('Error deleting meeting:', err)
      setError('Failed to delete meeting')
    }
  }

  const updateMeetingTitle = async (meetingId: string, newTitle: string) => {
    try {
      const response = await axios.put(`http://127.0.0.1:8000/api/meetings/${meetingId}`, {
        title: newTitle
      })
      
      // Update the current meeting summary if it's being displayed
      if (meetingSummary && meetingSummary.id === meetingId) {
        setMeetingSummary(response.data)
      }
      
      // Update the meetings history
      setMeetingsHistory(prev => 
        prev.map(meeting => 
          meeting.id === meetingId ? { ...meeting, title: newTitle } : meeting
        )
      )
      
      setIsEditingTitle(false)
      setEditedTitle('')
      setEditingMeetingId(null)
    } catch (err) {
      console.error('Error updating meeting title:', err)
      setError('Failed to update meeting title')
    }
  }

  const startEditingTitle = (currentTitle: string, meetingId?: string) => {
    setEditedTitle(currentTitle)
    setIsEditingTitle(true)
    if (meetingId) {
      setEditingMeetingId(meetingId)
    }
  }

  const cancelEditingTitle = () => {
    setIsEditingTitle(false)
    setEditedTitle('')
    setEditingMeetingId(null)
  }

  const viewMeeting = (meeting: MeetingSummary) => {
    setMeetingSummary(meeting)
    setShowHistory(false)
  }

  const validateAudioFile = (file: File): boolean => {
    // Check if it's an audio file by type or extension
    const audioTypes = ['audio/', 'video/']
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.wma']
    
    const isAudioType = audioTypes.some(type => file.type.startsWith(type))
    const isAudioExtension = audioExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    
    return isAudioType || isAudioExtension
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!validateAudioFile(file)) {
        setError('Please select an audio file (MP3, WAV, M4A, AAC, OGG, FLAC, AIFF, WMA)')
        return
      }
      setSelectedFile(file)
      setError('')
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragOver(false)
    
    const files = event.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (!validateAudioFile(file)) {
        setError('Please drop an audio file (MP3, WAV, M4A, AAC, OGG, FLAC, AIFF, WMA)')
        return
      }
      setSelectedFile(file)
      setError('')
    }
  }

  const processAudioFile = async () => {
    if (!selectedFile) return

    try {
      setError('')
      setIsUploading(true)
      
      // Step 1: Upload and transcribe
      const formData = new FormData()
      formData.append('file', selectedFile)
      
      setIsTranscribing(true)
      setIsUploading(false)
      
      const transcribeResponse = await axios.post('http://127.0.0.1:8000/api/audio/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      const transcription = transcribeResponse.data.text
      
      // Step 2: Create meeting summary
      setIsSummarizing(true)
      setIsTranscribing(false)
      
      const meetingResponse = await axios.post('http://127.0.0.1:8000/api/meetings/', {
        title: selectedFile.name.replace(/\.[^/.]+$/, ""), // Remove file extension
        transcription: transcription
      })

      setMeetingSummary(meetingResponse.data)
      setIsSummarizing(false)
      
      // Refresh history if it's being shown
      if (showHistory) {
        fetchMeetingsHistory()
      }
      
    } catch (err: any) {
      setError(err.response?.data?.detail || 'An error occurred while processing the audio file')
      setIsUploading(false)
      setIsTranscribing(false)
      setIsSummarizing(false)
    }
  }

  const processRecordedAudio = async () => {
    if (!recordedBlob) return

    try {
      setError('')
      setIsUploading(true)
      
      // Determine file extension based on blob type
      let extension = '.webm'
      let mimeType = recordedBlob.type || 'audio/webm'
      
      if (mimeType.includes('mp4')) {
        extension = '.mp4'
      } else if (mimeType.includes('webm')) {
        extension = '.webm'
      }
      
      // Convert blob to file with a cleaner filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const audioFile = new File([recordedBlob], `recording-${timestamp}${extension}`, {
        type: mimeType
      })
      
      console.log('Processing recorded audio:', {
        name: audioFile.name,
        type: audioFile.type,
        size: audioFile.size,
        duration: recordingTime
      })
      
      // Step 1: Upload audio file first
      const uploadFormData = new FormData()
      uploadFormData.append('file', audioFile)
      
      console.log('Uploading audio file...')
      const uploadResponse = await axios.post('http://127.0.0.1:8000/api/audio/upload', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      const fileId = uploadResponse.data.file_id
      console.log('Audio uploaded with file ID:', fileId)
      
      // Step 2: Transcribe the uploaded file
      setIsTranscribing(true)
      setIsUploading(false)
      
      const transcribeFormData = new FormData()
      transcribeFormData.append('file', audioFile)
      
      const transcribeResponse = await axios.post('http://127.0.0.1:8000/api/audio/transcribe', transcribeFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      const transcription = transcribeResponse.data.text
      console.log('Transcription completed:', transcription.length, 'characters')
      
      // Step 3: Create meeting summary with file reference
      setIsSummarizing(true)
      setIsTranscribing(false)
      
      const meetingResponse = await axios.post('http://127.0.0.1:8000/api/meetings/', {
        title: `Recording ${new Date().toLocaleString()}`,
        transcription: transcription,
        file_name: fileId,  // Store the file ID, not the display name
        duration: recordingTime,
        language: transcribeResponse.data.language || 'en'
      })

      setMeetingSummary(meetingResponse.data)
      setIsSummarizing(false)
      
      // Refresh history if it's being shown
      if (showHistory) {
        fetchMeetingsHistory()
      }
      
      // Clear recording state after successful processing
      setRecordedBlob(null)
      setRecordingTime(0)
      
    } catch (err: any) {
      console.error('Error processing recorded audio:', err)
      setError(err.response?.data?.detail || 'An error occurred while processing the recorded audio')
      setIsUploading(false)
      setIsTranscribing(false)
      setIsSummarizing(false)
    }
  }

  const resetApp = () => {
    setSelectedFile(null)
    setMeetingSummary(null)
    setError('')
    setIsUploading(false)
    setIsTranscribing(false)
    setIsSummarizing(false)
    setIsDragOver(false)
    setShowHistory(false)
    
    // Reset recording states
    setIsRecording(false)
    setIsPaused(false)
    setRecordingTime(0)
    setRecordedBlob(null)
    setIsPlaying(false)
    
    // Clean up recording
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause()
    }
  }

  const getCurrentStep = () => {
    if (isUploading) return 'Uploading file...'
    if (isTranscribing) return 'Transcribing audio...'
    if (isSummarizing) return 'Generating summary...'
    return ''
  }

  const isProcessing = isUploading || isTranscribing || isSummarizing

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-text">
            <h1>MindSync Meeting Summarizer</h1>
            <p>Upload an audio file to get a comprehensive meeting summary</p>
          </div>
          <button 
            className="history-btn" 
            onClick={() => {
              setShowHistory(!showHistory)
              if (!showHistory) {
                fetchMeetingsHistory()
              }
            }}
          >
            <History className="btn-icon" />
            {showHistory ? 'Hide History' : 'View History'}
          </button>
          
          {/* Temporary test button */}
          <button 
            className="history-btn" 
            onClick={testAudioPlayback}
            style={{ marginLeft: '10px', backgroundColor: '#e74c3c' }}
          >
            🔊 Test Audio
          </button>
        </div>
      </header>

      <main className="app-main">
        {showHistory ? (
          <div className="history-section">
            <div className="history-header">
              <h2>📚 Meeting History</h2>
              <button className="new-meeting-btn" onClick={() => setShowHistory(false)}>
                New Meeting
              </button>
            </div>
            
            {isLoadingHistory ? (
              <div className="loading">
                <Loader2 className="spinner" />
                <p>Loading meetings...</p>
              </div>
            ) : meetingsHistory.length === 0 ? (
              <div className="empty-history">
                <p>No meetings found. Create your first meeting!</p>
              </div>
            ) : (
              <div className="meetings-grid">
                {isEditingTitle && (
                  <div className="edit-modal-overlay">
                    <div className="edit-modal">
                      <h3>Edit Meeting Name</h3>
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="title-edit-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingMeetingId) {
                            updateMeetingTitle(editingMeetingId, editedTitle)
                          } else if (e.key === 'Escape') {
                            cancelEditingTitle()
                          }
                        }}
                      />
                      <div className="edit-modal-actions">
                        <button 
                          className="save-btn"
                          onClick={() => {
                            if (editingMeetingId) {
                              updateMeetingTitle(editingMeetingId, editedTitle)
                            }
                          }}
                        >
                          <Check className="btn-icon-small" />
                          Save
                        </button>
                        <button 
                          className="cancel-btn"
                          onClick={cancelEditingTitle}
                        >
                          <X className="btn-icon-small" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {meetingsHistory.map((meeting) => (
                  <div key={meeting.id} className="meeting-card">
                    <div className="meeting-card-header">
                      <h3>{meeting.title}</h3>
                      <div className="meeting-actions">
                        <button 
                          className="edit-btn"
                          onClick={() => startEditingTitle(meeting.title, meeting.id)}
                          title="Edit Meeting Name"
                        >
                          <Edit3 className="btn-icon-small" />
                        </button>
                        <button 
                          className="view-btn"
                          onClick={() => viewMeeting(meeting)}
                          title="View Meeting"
                        >
                          View
                        </button>
                        <button 
                          className="delete-btn"
                          onClick={() => deleteMeeting(meeting.id)}
                          title="Delete Meeting"
                        >
                          <Trash2 className="btn-icon-small" />
                        </button>
                      </div>
                    </div>
                    <p className="meeting-date">
                      {new Date(meeting.created_at).toLocaleDateString()} at{' '}
                      {new Date(meeting.created_at).toLocaleTimeString()}
                    </p>
                    <p className="meeting-summary-preview">
                      {meeting.summary ? meeting.summary.substring(0, 150) + '...' : 'No summary available'}
                    </p>
                    <div className="meeting-stats">
                      <span>{meeting.key_points?.length || 0} key points</span>
                      <span>{meeting.action_items?.length || 0} action items</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !meetingSummary ? (
          <div className="upload-section">
            {/* Real-time Assistant Mode Toggle */}
            <div className="mode-selector">
              <button 
                className={`mode-btn ${!isRealTimeMode ? 'active' : ''}`}
                onClick={() => setIsRealTimeMode(false)}
              >
                📁 Standard Mode
              </button>
              <button 
                className={`mode-btn ${isRealTimeMode ? 'active' : ''}`}
                onClick={() => setIsRealTimeMode(true)}
              >
                🤖 AI Assistant Mode
              </button>
              <button 
                className="mode-btn settings-btn"
                onClick={() => setShowPronunciationManager(true)}
                title="Pronunciation Settings"
              >
                ⚙️ Settings
              </button>
              <button 
                className="mode-btn chat-btn"
                onClick={() => setShowChatInterface(true)}
                title="Ask About Meetings"
              >
                💬 Ask Me
              </button>
              <button 
                className="mode-btn voice-btn"
                onClick={() => setShowVoiceManager(true)}
                title="Manage Voice Profiles"
              >
                🎙️ Voice Profiles
              </button>
              <button 
                className="mode-btn tts-test-btn"
                onClick={() => setShowTTSTestPage(true)}
                title="Test Text-to-Speech"
              >
                🔊 TTS Test
              </button>
            </div>

            {isRealTimeMode ? (
              /* Real-time Assistant Mode */
              <div className="real-time-assistant">
                <h3>🤖 AI Meeting Assistant</h3>
                <p>Get real-time suggestions based on your conversation history</p>
                
                {!isRecording ? (
                  <button className="record-btn real-time" onClick={startRealTimeRecording}>
                    <Mic className="btn-icon" />
                    Start AI-Assisted Recording
                  </button>
                ) : (
                  <div className="real-time-controls">
                    <div className="recording-status">
                      <div className="recording-indicator"></div>
                      <span>AI Assistant Active: {formatTime(recordingTime)}</span>
                    </div>
                    <button className="stop-btn" onClick={stopRealTimeRecording}>
                      <Square className="btn-icon" />
                      Stop
                    </button>
                  </div>
                )}
                
                {/* Real-time Transcript */}
                {realTimeTranscript && (
                  <div className="real-time-transcript">
                    <h4>📝 Live Transcript</h4>
                    <div className="transcript-content">
                      {realTimeTranscript}
                    </div>
                  </div>
                )}
                
                {/* AI Suggestions */}
                {suggestions.length > 0 && (
                  <div className="ai-suggestions">
                    <h4>💡 AI Suggestions</h4>
                    <div className="suggestions-list">
                      {suggestions.slice(-5).map((suggestion, index) => (
                        <div key={index} className={`suggestion-card ${suggestion.type}`}>
                          <div className="suggestion-header">
                            <span className="suggestion-type">
                              {suggestion.type === 'reminder' ? '⏰' : 
                               suggestion.type === 'context' ? '🔗' : 
                               suggestion.type === 'action' ? '✅' : '❓'}
                              {suggestion.type.toUpperCase()}
                            </span>
                          </div>
                          <p>{suggestion.suggestion}</p>
                          {suggestion.source_meetings && (
                            <div className="suggestion-source">
                              Related to: {suggestion.source_meetings.map((m: any) => m.title).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <button className="clear-suggestions-btn" onClick={clearRealTimeSession}>
                      Clear Session
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Standard Recording Mode */
              <>
            {/* Recording Section */}
            <div className="recording-section">
              <h3>🎙️ Record Audio</h3>
              
              {!isRecording && !recordedBlob && (
                <button className="record-btn" onClick={startRecording}>
                  <Mic className="btn-icon" />
                  Start Recording
                </button>
              )}
              
              {isRecording && (
                <div className="recording-controls">
                  <div className="recording-status">
                    <div className="recording-indicator"></div>
                    <span>Recording: {formatTime(recordingTime)}</span>
                  </div>
                  <div className="recording-buttons">
                    <button className="pause-btn" onClick={pauseRecording}>
                      {isPaused ? <Play className="btn-icon" /> : <Pause className="btn-icon" />}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    <button className="stop-btn" onClick={stopRecording}>
                      <Square className="btn-icon" />
                      Stop
                    </button>
                  </div>
                </div>
              )}
              
              {recordedBlob && (
                <div className="recorded-audio">
                  <div className="recording-info">
                    <span>Recording complete: {formatTime(recordingTime)}</span>
                  </div>
                  <div className="playback-controls">
                    <button className="play-btn" onClick={playRecording}>
                      {isPlaying ? <Pause className="btn-icon" /> : <Play className="btn-icon" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button className="clear-btn" onClick={clearRecording}>
                      Clear
                    </button>
                  </div>
                  
                  {!isProcessing && (
                    <button className="process-btn" onClick={processRecordedAudio}>
                      <Upload className="btn-icon" />
                      Process Recording
                    </button>
                  )}
                </div>
              )}
            </div>
            
            <div className="separator">
              <span>OR</span>
            </div>
            
            {/* File Upload Section */}
            <div className="file-upload-section">
              <h3>📁 Upload Audio File</h3>
            <div 
              className={`upload-area ${isDragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="audio-file"
                accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.aiff,.wma"
                onChange={handleFileSelect}
                className="file-input"
                disabled={isProcessing}
              />
              <label htmlFor="audio-file" className={`file-label ${isProcessing ? 'disabled' : ''}`}>
                <FileAudio className="upload-icon" />
                <span>Choose Audio File</span>
                <span className="drag-text">or drag and drop M4A, MP3, WAV files here</span>
              </label>
            </div>

            {selectedFile && (
              <div className="file-info">
                <p><strong>Selected:</strong> {selectedFile.name}</p>
                <p><strong>Size:</strong> {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            )}

            {selectedFile && !isProcessing && (
              <button className="process-btn" onClick={processAudioFile}>
                <Upload className="btn-icon" />
                Process Audio
              </button>
            )}

            {isProcessing && (
              <div className="processing">
                <Loader2 className="spinner" />
                <p>{getCurrentStep()}</p>
              </div>
            )}

            {error && (
              <div className="error">
                <p>{error}</p>
              </div>
            )}
            </div>
            </>
            )}
          </div>
        ) : (
          <div className="results-section">
            <div className="results-header">
              <CheckCircle className="success-icon" />
              <h2>Meeting Summary Complete</h2>
              <button className="new-meeting-btn" onClick={resetApp}>
                Process New Meeting
              </button>
            </div>

            <div className="summary-content">
              <div className="summary-card">
                <div className="summary-header">
                  <h3>📝 Summary</h3>
                  <button 
                    className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
                    onClick={() => isSpeaking ? stopSpeaking() : speakTextIntelligent(meetingSummary.summary, 'summary')}
                    title={
                      isGeneratingVoice 
                        ? 'Generating speech with voice cloning...' 
                        : streamingProgress
                          ? `Playing chunk ${streamingProgress.current}/${streamingProgress.total}`
                          : isSpeaking 
                            ? 'Stop speaking' 
                            : 'Listen to summary'
                    }
                    disabled={isGeneratingVoice}
                  >
                    {isGeneratingVoice ? (
                      <Loader2 className="btn-icon-small animate-spin" />
                    ) : isSpeaking ? (
                      <VolumeX className="btn-icon-small" />
                    ) : (
                      <Volume2 className="btn-icon-small" />
                    )}
                  </button>
                </div>
                <p>{meetingSummary.summary}</p>
              </div>

              <div className="summary-card">
                <div className="summary-header">
                  <h3>🔑 Key Points</h3>
                  <button 
                    className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
                    onClick={() => isSpeaking ? stopSpeaking() : speakTextIntelligent(meetingSummary.key_points.join('. '), 'keypoints')}
                    title={
                      isGeneratingVoice 
                        ? 'Generating speech with voice cloning...' 
                        : streamingProgress
                          ? `Playing chunk ${streamingProgress.current}/${streamingProgress.total}`
                          : isSpeaking 
                            ? 'Stop speaking' 
                            : 'Listen to key points'
                    }
                    disabled={isGeneratingVoice}
                  >
                    {isGeneratingVoice ? (
                      <Loader2 className="btn-icon-small animate-spin" />
                    ) : isSpeaking ? (
                      <VolumeX className="btn-icon-small" />
                    ) : (
                      <Volume2 className="btn-icon-small" />
                    )}
                  </button>
                </div>
                <ul>
                  {meetingSummary.key_points.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>

              <div className="summary-card">
                <div className="summary-header">
                  <h3>✅ Action Items</h3>
                  <button 
                    className={`speak-btn ${isSpeaking ? 'speaking' : ''}`}
                    onClick={() => isSpeaking ? stopSpeaking() : speakTextIntelligent(meetingSummary.action_items.join('. '), 'actionitems')}
                    title={
                      isGeneratingVoice 
                        ? 'Generating speech with voice cloning...' 
                        : streamingProgress
                          ? `Playing chunk ${streamingProgress.current}/${streamingProgress.total}`
                          : isSpeaking 
                            ? 'Stop speaking' 
                            : 'Listen to action items'
                    }
                    disabled={isGeneratingVoice}
                  >
                    {isGeneratingVoice ? (
                      <Loader2 className="btn-icon-small animate-spin" />
                    ) : isSpeaking ? (
                      <VolumeX className="btn-icon-small" />
                    ) : (
                      <Volume2 className="btn-icon-small" />
                    )}
                  </button>
                </div>
                <ul>
                  {meetingSummary.action_items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="summary-card">
                <h3>📄 Full Transcript</h3>
                <div className="transcript-content">
                  <p>{meetingSummary.transcript}</p>
                </div>
              </div>

              {meetingSummary.file_name && (
                <div className="summary-card">
                  <h3>🎵 Audio Recording</h3>
                  <div className="audio-section">
                    <audio controls style={{ width: '100%' }}>
                      <source src={`http://127.0.0.1:8000/api/audio/file/${meetingSummary.file_name}`} />
                      Your browser does not support the audio element.
                    </audio>
                    <div className="audio-info">
                      <p><strong>File:</strong> {meetingSummary.file_name}</p>
                      {meetingSummary.duration && (
                        <p><strong>Duration:</strong> {Math.round(meetingSummary.duration)} seconds</p>
                      )}
                      {meetingSummary.language && (
                        <p><strong>Language:</strong> {meetingSummary.language}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="meeting-info">
                <div className="meeting-title-section">
                  {isEditingTitle ? (
                    <div className="title-edit-form">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="title-edit-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateMeetingTitle(meetingSummary.id, editedTitle)
                          } else if (e.key === 'Escape') {
                            cancelEditingTitle()
                          }
                        }}
                      />
                      <div className="title-edit-actions">
                        <button 
                          className="save-btn"
                          onClick={() => updateMeetingTitle(meetingSummary.id, editedTitle)}
                        >
                          <Check className="btn-icon-small" />
                        </button>
                        <button 
                          className="cancel-btn"
                          onClick={cancelEditingTitle}
                        >
                          <X className="btn-icon-small" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="meeting-title-display">
                      <strong>Meeting:</strong> {meetingSummary.title}
                      <button 
                        className="edit-title-btn"
                        onClick={() => startEditingTitle(meetingSummary.title)}
                        title="Edit Meeting Name"
                      >
                        <Edit3 className="btn-icon-small" />
                      </button>
                    </div>
                  )}
                </div>
                <p><strong>Created:</strong> {new Date(meetingSummary.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Pronunciation Manager Modal */}
      <PronunciationManager 
        isOpen={showPronunciationManager}
        onClose={() => setShowPronunciationManager(false)}
      />
      
      {/* Chat Interface Modal */}
      <ChatInterface 
        isOpen={showChatInterface}
        onClose={() => setShowChatInterface(false)}
      />
      
      {/* Voice Manager Modal */}
      <VoiceManager 
        isOpen={showVoiceManager}
        onClose={() => setShowVoiceManager(false)}
        onVoiceProfileSelected={handleVoiceProfileSelected}
        currentVoiceProfile={currentVoiceProfile}
      />
      
      {/* TTS Test Page Modal */}
      <TTSTestPage 
        isOpen={showTTSTestPage}
        onClose={() => setShowTTSTestPage(false)}
      />
    </div>
  )
}

export default App
