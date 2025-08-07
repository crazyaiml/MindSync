import { useState, useRef, useEffect } from 'react'
import { Upload, Loader2, FileAudio, CheckCircle, Mic, Square, Play, Pause, History, Trash2, Edit3, Check, X, Volume2, VolumeX, Home, Bot, Settings, MessageCircle, User, Plus, FileText, Menu } from 'lucide-react'
import axios from 'axios'
import PronunciationManager from './components/PronunciationManager'
import ChatInterface from './components/ChatInterface'
import VoiceManager from './components/VoiceManager'
import TTSTestPage from './components/TTSTestPage'
import './App.css'

interface MeetingSummary {
  id: string
  title: string
  description?: string
  transcript?: string
  summary?: string
  key_points?: string[]
  action_items?: string[]
  created_at: string
  updated_at?: string
  file_name?: string
  duration?: number
  language?: string
  status: 'draft' | 'recording' | 'processing' | 'completed'
}

function App() {
  // Navigation state
  const [activeTab, setActiveTab] = useState('standard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
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
  
  // Empty meeting creation state
  const [showCreateMeetingModal, setShowCreateMeetingModal] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingDescription, setNewMeetingDescription] = useState('')
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false)
  
  // Transcript input state
  const [showTranscriptModal, setShowTranscriptModal] = useState(false)
  const [transcriptInput, setTranscriptInput] = useState('')
  const [selectedMeetingForTranscript, setSelectedMeetingForTranscript] = useState<string | null>(null)
  const [isAddingTranscript, setIsAddingTranscript] = useState(false)
  
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

  // Create empty meeting
  const createEmptyMeeting = async () => {
    if (!newMeetingTitle.trim()) {
      setError('Meeting title is required')
      return
    }

    setIsCreatingMeeting(true)
    setError('')
    
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/meetings/empty', {
        title: newMeetingTitle.trim(),
        description: newMeetingDescription.trim() || undefined
      })
      
      const newMeeting = response.data
      setMeetingsHistory(prev => [newMeeting, ...prev])
      setMeetingSummary(newMeeting)
      
      // Reset form
      setNewMeetingTitle('')
      setNewMeetingDescription('')
      setShowCreateMeetingModal(false)
      
    } catch (err: any) {
      console.error('Error creating empty meeting:', err)
      setError(err.response?.data?.detail || 'Failed to create meeting')
    } finally {
      setIsCreatingMeeting(false)
    }
  }

  // Add transcript to existing meeting
  const addTranscriptToMeeting = async () => {
    if (!selectedMeetingForTranscript || !transcriptInput.trim()) {
      setError('Please select a meeting and enter transcript text')
      return
    }

    setIsAddingTranscript(true)
    setError('')
    
    try {
      const response = await axios.post(
        `http://127.0.0.1:8000/api/meetings/${selectedMeetingForTranscript}/add-transcript`,
        {
          title: '', // Not used since we're updating existing meeting
          transcription: transcriptInput.trim(),
          description: '',
          file_name: `transcript_${Date.now()}.txt`,
          duration: null,
          language: 'en'
        }
      )
      
      const updatedMeeting = response.data
      
      // Update meetings history
      setMeetingsHistory(prev => 
        prev.map(meeting => 
          meeting.id === selectedMeetingForTranscript ? updatedMeeting : meeting
        )
      )
      
      // Update current meeting if it's the one being viewed
      if (meetingSummary && meetingSummary.id === selectedMeetingForTranscript) {
        setMeetingSummary(updatedMeeting)
      }
      
      // Reset form
      setTranscriptInput('')
      setSelectedMeetingForTranscript(null)
      setShowTranscriptModal(false)
      
    } catch (err: any) {
      console.error('Error adding transcript to meeting:', err)
      setError(err.response?.data?.detail || 'Failed to add transcript to meeting')
    } finally {
      setIsAddingTranscript(false)
    }
  }

  // Start recording for existing meeting
  const startMeetingRecording = async (meetingId: string) => {
    try {
      const response = await axios.post(`http://127.0.0.1:8000/api/meetings/${meetingId}/start-recording`)
      const updatedMeeting = response.data
      
      // Update meetings history
      setMeetingsHistory(prev => 
        prev.map(meeting => 
          meeting.id === meetingId ? updatedMeeting : meeting
        )
      )
      
      // Update current meeting if it's the one being viewed
      if (meetingSummary && meetingSummary.id === meetingId) {
        setMeetingSummary(updatedMeeting)
      }
      
    } catch (err: any) {
      console.error('Error starting recording:', err)
      setError(err.response?.data?.detail || 'Failed to start recording')
    }
  }

  // Stop recording for existing meeting
  const stopMeetingRecording = async (meetingId: string, audioFile?: File) => {
    try {
      let audioFilePath = undefined
      
      // If audio file provided, upload it first
      if (audioFile) {
        const formData = new FormData()
        formData.append('file', audioFile)
        
        const uploadResponse = await axios.post('http://127.0.0.1:8000/api/upload-audio', formData)
        audioFilePath = uploadResponse.data.file_path
      }
      
      const response = await axios.post(`http://127.0.0.1:8000/api/meetings/${meetingId}/stop-recording`, {
        meeting_id: meetingId,
        audio_file_path: audioFilePath
      })
      
      const updatedMeeting = response.data
      
      // Update meetings history
      setMeetingsHistory(prev => 
        prev.map(meeting => 
          meeting.id === meetingId ? updatedMeeting : meeting
        )
      )
      
      // Update current meeting if it's the one being viewed
      if (meetingSummary && meetingSummary.id === meetingId) {
        setMeetingSummary(updatedMeeting)
      }
      
    } catch (err: any) {
      console.error('Error stopping recording:', err)
      setError(err.response?.data?.detail || 'Failed to stop recording')
    }
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

  const renderMainContent = () => {
    if (activeTab === 'history') {
      return (
        <div className="history-section">
          <div className="history-header">
            <h2>📚 Meeting History</h2>
            <button className="new-meeting-btn" onClick={() => {
              setActiveTab('standard')
            }}>
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
                        <Check className="btn-icon" />
                        Save
                      </button>
                      <button 
                        className="cancel-btn"
                        onClick={cancelEditingTitle}
                      >
                        <X className="btn-icon" />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {meetingsHistory.map((meeting) => (
                <div key={meeting.id} className="meeting-card">
                  <div className="meeting-card-header">
                    <div className="meeting-info">
                      <h3 
                        className="meeting-title" 
                        title={meeting.title}
                        onClick={() => startEditingTitle(meeting.id, meeting.title)}
                      >
                        {meeting.title}
                        <Edit3 className="edit-icon" />
                      </h3>
                      <div className="meeting-meta">
                        <span className="meeting-date">
                          {new Date(meeting.created_at).toLocaleString()}
                        </span>
                        <span className={`meeting-status status-${meeting.status}`}>
                          {meeting.status}
                        </span>
                      </div>
                      {meeting.description && (
                        <p className="meeting-description">{meeting.description}</p>
                      )}
                    </div>
                    <div className="meeting-actions">
                      {meeting.status === 'draft' && (
                        <>
                          <button 
                            className="action-btn start-recording-btn"
                            onClick={() => startMeetingRecording(meeting.id)}
                            title="Start Recording"
                          >
                            <Mic />
                          </button>
                          <button 
                            className="action-btn add-transcript-btn"
                            onClick={() => {
                              setSelectedMeetingForTranscript(meeting.id)
                              setShowTranscriptModal(true)
                            }}
                            title="Add Transcript"
                          >
                            <FileText />
                          </button>
                        </>
                      )}
                      {meeting.status === 'recording' && (
                        <button 
                          className="action-btn stop-recording-btn"
                          onClick={() => stopMeetingRecording(meeting.id)}
                          title="Stop Recording"
                        >
                          <Square />
                        </button>
                      )}
                      <button 
                        className="action-btn delete-btn"
                        onClick={() => deleteMeeting(meeting.id)}
                        title="Delete Meeting"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                  
                  {meeting.transcript && (
                    <div className="meeting-transcript">
                      <h4>Transcript</h4>
                      <p>{meeting.transcript.substring(0, 200)}...</p>
                    </div>
                  )}
                  
                  {meeting.summary && (
                    <div className="meeting-summary">
                      <h4>Summary</h4>
                      <p>{meeting.summary}</p>
                    </div>
                  )}
                  
                  {meeting.key_points && meeting.key_points.length > 0 && (
                    <div className="meeting-key-points">
                      <h4>Key Points</h4>
                      <ul>
                        {meeting.key_points.slice(0, 3).map((point, index) => (
                          <li key={index}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {meeting.action_items && meeting.action_items.length > 0 && (
                    <div className="meeting-action-items">
                      <h4>Action Items</h4>
                      <ul>
                        {meeting.action_items.slice(0, 3).map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="meeting-details">
                    {meeting.duration && (
                      <span className="detail-item">
                        Duration: {Math.round(meeting.duration)}s
                      </span>
                    )}
                    {meeting.language && (
                      <span className="detail-item">
                        Language: {meeting.language}
                      </span>
                    )}
                    {meeting.file_name && (
                      <span className="detail-item">
                        File: {meeting.file_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (activeTab === 'ai-assistant') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>🤖 AI Assistant Mode</h2>
            <p>Real-time transcription with AI suggestions</p>
          </div>
          
          <div className="real-time-section">
            <div className="real-time-controls">
              {!isRealTimeMode || !isRecording ? (
                <button className="record-btn real-time" onClick={startRealTimeRecording}>
                  <Mic className="btn-icon" />
                  Start AI Assistant
                </button>
              ) : (
                <div className="recording-controls">
                  <div className="recording-status">
                    <span className="recording-indicator"></span>
                    AI Assistant Active
                  </div>
                  <button className="stop-btn" onClick={stopRealTimeRecording}>
                    <Square className="btn-icon" />
                    Stop
                  </button>
                </div>
              )}
            </div>

            {isRealTimeMode && (
              <div className="real-time-content">
                <div className="real-time-transcript">
                  <h3>Live Transcript</h3>
                  <div className="transcript-content">
                    {realTimeTranscript || "Start speaking to see real-time transcription..."}
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="ai-suggestions">
                    <h3>AI Suggestions</h3>
                    <div className="suggestions-list">
                      {suggestions.map((suggestion, index) => (
                        <div key={index} className="suggestion-item">
                          <div className="suggestion-type">{suggestion.type}</div>
                          <div className="suggestion-content">{suggestion.content}</div>
                        </div>
                      ))}
                    </div>
                    <button className="clear-suggestions-btn" onClick={clearRealTimeSession}>
                      Clear Session
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )
    }

    if (activeTab === 'voice-profile') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>👤 Voice Profile Management</h2>
            <p>Manage your voice profiles for text-to-speech</p>
          </div>
          <VoiceManager 
            isOpen={true}
            onClose={() => setActiveTab('standard')}
            onVoiceProfileSelected={(voiceId: string) => {
              setCurrentVoiceProfile(voiceId)
              localStorage.setItem('currentVoiceProfile', voiceId)
            }}
            currentVoiceProfile={currentVoiceProfile}
          />
        </div>
      )
    }

    if (activeTab === 'tts-test') {
      return (
        <div className="mode-section">
          <TTSTestPage 
            isOpen={true}
            onClose={() => setActiveTab('standard')}
          />
        </div>
      )
    }

    if (activeTab === 'ask-me') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>💬 Ask Me</h2>
            <p>Chat with AI about your meetings</p>
          </div>
          <ChatInterface 
            isOpen={true}
            onClose={() => setActiveTab('standard')}
          />
        </div>
      )
    }

    if (activeTab === 'settings') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>⚙️ Settings</h2>
            <p>Configure pronunciation and other settings</p>
          </div>
          <PronunciationManager 
            isOpen={true} 
            onClose={() => setActiveTab('standard')} 
          />
        </div>
      )
    }

    if (activeTab === 'new-meeting') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>➕ Create New Meeting</h2>
            <p>Start a new meeting session</p>
          </div>
          <div className="new-meeting-options">
            <button 
              className="option-btn record-option"
              onClick={() => {
                setActiveTab('standard')
                startRecording()
              }}
            >
              <Mic className="option-icon" />
              <div>
                <h3>Start Recording</h3>
                <p>Begin recording a new meeting</p>
              </div>
            </button>
            <button 
              className="option-btn ai-option"
              onClick={() => {
                setActiveTab('ai-assistant')
                startRealTimeRecording()
              }}
            >
              <Bot className="option-icon" />
              <div>
                <h3>AI Assistant Mode</h3>
                <p>Real-time transcription with AI suggestions</p>
              </div>
            </button>
          </div>
        </div>
      )
    }

    if (activeTab === 'add-transcript') {
      return (
        <div className="mode-section">
          <div className="mode-header">
            <h2>📄 Add Transcript</h2>
            <p>Upload an existing transcript or audio file</p>
          </div>
          <div className="upload-options">
            <div className="upload-area">
              <div className="upload-content">
                <Upload className="upload-icon" />
                <h3>Upload Audio File</h3>
                <p>Drag and drop an audio file or click to browse</p>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileSelect}
                  className="file-input"
                  id="audio-upload"
                />
                <label htmlFor="audio-upload" className="upload-btn">
                  <Upload />
                  Choose File
                </label>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Standard Mode (default)
    return (
      <div className="mode-section">
        <div className="mode-header">
          <h2>📁 Standard Mode</h2>
          <p>Upload audio files for meeting summarization</p>
        </div>
        
        <div className="upload-section">
          {!isRecording && !recordedBlob && (
            <div className="recording-section">
              <h3>🎙️ Record Audio</h3>
              <div className="recording-controls">
                <button className="record-btn" onClick={startRecording}>
                  <Mic className="btn-icon" />
                  Start Recording
                </button>
              </div>
            </div>
          )}

          {isRecording && (
            <div className="recording-section active">
              <h3>🎙️ Recording in Progress</h3>
              <div className="recording-status">
                <div className="recording-indicator"></div>
                <span className="recording-time">{formatTime(recordingTime)}</span>
                <div className="recording-controls">
                  <button className="pause-btn" onClick={pauseRecording}>
                    <Pause className="btn-icon" />
                  </button>
                  <button className="stop-btn" onClick={stopRecording}>
                    <Square className="btn-icon" />
                    Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {recordedBlob && (
            <div className="recorded-audio-section">
              <h3>🎵 Recorded Audio</h3>
              <div className="audio-controls">
                <div className="audio-info">
                  <span>Duration: {formatTime(recordingTime)}</span>
                </div>
                <div className="audio-actions">
                  <button className="play-btn" onClick={playRecording}>
                    <Play className="btn-icon" />
                  </button>
                  <button className="clear-btn" onClick={clearRecording}>
                    <Trash2 className="btn-icon" />
                  </button>
                </div>
              </div>
              <div className="process-section">
                <button className="process-btn" onClick={processRecordedAudio}>
                  Process Recording
                </button>
              </div>
            </div>
          )}

          <div className="upload-divider">
            <span>OR</span>
          </div>

          <div 
            className={`upload-area ${isDragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="upload-content">
              <FileAudio className="upload-icon" />
              <h3>Upload Audio File</h3>
              <p>Drag and drop your audio file here, or click to select</p>
              <input
                type="file"
                accept="audio/*,.webm"
                onChange={handleFileSelect}
                className="file-input"
                id="file-input"
              />
              <label htmlFor="file-input" className="upload-btn">
                <Upload className="btn-icon" />
                Choose File
              </label>
            </div>
          </div>

          {selectedFile && (
            <div className="file-info">
              <FileAudio className="file-icon" />
              <div className="file-details">
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button className="process-btn" onClick={processAudioFile}>
                Process Audio
              </button>
            </div>
          )}

          {(isUploading || isTranscribing || isSummarizing) && (
            <div className="processing">
              <Loader2 className="spinner" />
              <div className="processing-text">
                {isUploading && <p>Uploading file...</p>}
                {isTranscribing && <p>Transcribing audio...</p>}
                {isSummarizing && <p>Generating summary...</p>}
              </div>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          {meetingSummary && (
            <div className="summary-section">
              <div className="summary-header">
                <CheckCircle className="success-icon" />
                <h2>Meeting Summary Complete!</h2>
              </div>
              
              <div className="summary-content">
                <div className="summary-item">
                  <h3>📝 Summary</h3>
                  <p>{meetingSummary.summary}</p>
                </div>
                
                {meetingSummary.key_points && meetingSummary.key_points.length > 0 && (
                  <div className="summary-item">
                    <h3>🔍 Key Points</h3>
                    <ul>
                      {meetingSummary.key_points.map((point, index) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {meetingSummary.action_items && meetingSummary.action_items.length > 0 && (
                  <div className="summary-item">
                    <h3>✅ Action Items</h3>
                    <ul>
                      {meetingSummary.action_items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="summary-meta">
                  <div className="meta-item">
                    <strong>Duration:</strong> {meetingSummary.duration}s
                  </div>
                  <div className="meta-item">
                    <strong>Language:</strong> {meetingSummary.language}
                  </div>
                  <div className="meta-item">
                    <strong>Created:</strong> {new Date(meetingSummary.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              
              <div className="summary-actions">
                <button className="new-meeting-btn" onClick={resetApp}>
                  New Meeting
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <h2>MindSync</h2>
          </div>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>Main</h3>
            <ul>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'standard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('standard')}
                >
                  <Home className="nav-icon" />
                  <span>Standard Mode</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'ai-assistant' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ai-assistant')}
                >
                  <Bot className="nav-icon" />
                  <span>AI Assistant</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('history')
                    fetchMeetingsHistory()
                  }}
                >
                  <History className="nav-icon" />
                  <span>Meeting History</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="nav-section">
            <h3>Actions</h3>
            <ul>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'new-meeting' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('new-meeting')
                  }}
                >
                  <Plus className="nav-icon" />
                  <span>New Meeting</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'add-transcript' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('add-transcript')
                  }}
                >
                  <FileText className="nav-icon" />
                  <span>Add Transcript</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="nav-section">
            <h3>Tools</h3>
            <ul>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'ask-me' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('ask-me')
                  }}
                >
                  <MessageCircle className="nav-icon" />
                  <span>Ask Me</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'voice-profile' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('voice-profile')
                  }}
                >
                  <User className="nav-icon" />
                  <span>Voice Profile</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'tts-test' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('tts-test')
                  }}
                >
                  <Volume2 className="nav-icon" />
                  <span>TTS Test</span>
                </button>
              </li>
              <li>
                <button 
                  className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('settings')
                  }}
                >
                  <Settings className="nav-icon" />
                  <span>Settings</span>
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="main-layout">
        {/* Header */}
        <header className="app-header">
          <div className="header-content">
            <h1>🧠 MindSync Meeting Summarizer ✨</h1>
            </div>
          </header>
        {/* Main Content Area */}
        <main className="app-main">
          {renderMainContent()}
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-content">
            <p>&copy; 2025 MindSync. All rights reserved.</p>
            <div className="footer-links">
              <span>Made with ❤️ for better meetings</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Modals */}
      {showCreateMeetingModal && (
        <div className="modal-overlay" onClick={() => setShowCreateMeetingModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Meeting</h3>
              <button 
                className="close-btn"
                onClick={() => setShowCreateMeetingModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="modal-content">
              <div className="form-group">
                <label htmlFor="meeting-title">Meeting Title *</label>
                <input
                  id="meeting-title"
                  type="text"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="Enter meeting title"
                />
              </div>
              <div className="form-group">
                <label htmlFor="meeting-description">Description</label>
                <textarea
                  id="meeting-description"
                  value={newMeetingDescription}
                  onChange={(e) => setNewMeetingDescription(e.target.value)}
                  placeholder="Optional meeting description"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowCreateMeetingModal(false)}
              >
                Cancel
              </button>
              <button 
                className="create-btn"
                onClick={createEmptyMeeting}
                disabled={isCreatingMeeting || !newMeetingTitle.trim()}
              >
                {isCreatingMeeting ? (
                  <>
                    <Loader2 className="spinner-small" />
                    Creating...
                  </>
                ) : (
                  'Create Meeting'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTranscriptModal && (
        <div className="modal-overlay" onClick={() => setShowTranscriptModal(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Transcript to Meeting</h3>
              <button 
                className="close-btn"
                onClick={() => setShowTranscriptModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="modal-content">
              {!selectedMeetingForTranscript && (
                <div className="form-group">
                  <label>Select Meeting</label>
                  <select 
                    value={selectedMeetingForTranscript || ''}
                    onChange={(e) => setSelectedMeetingForTranscript(e.target.value)}
                  >
                    <option value="">Select a meeting...</option>
                    {meetingsHistory
                      .filter(m => m.status === 'draft' && !m.transcript)
                      .map(meeting => (
                        <option key={meeting.id} value={meeting.id}>
                          {meeting.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="transcript-input">Transcript *</label>
                <textarea
                  id="transcript-input"
                  value={transcriptInput}
                  onChange={(e) => setTranscriptInput(e.target.value)}
                  placeholder="Paste or type the meeting transcript here..."
                  rows={10}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowTranscriptModal(false)}
              >
                Cancel
              </button>
              <button 
                className="add-btn"
                onClick={addTranscriptToMeeting}
                disabled={isAddingTranscript || !transcriptInput.trim() || !selectedMeetingForTranscript}
              >
                {isAddingTranscript ? (
                  <>
                    <Loader2 className="spinner-small" />
                    Adding...
                  </>
                ) : (
                  'Add Transcript'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <PronunciationManager 
        isOpen={showPronunciationManager}
        onClose={() => setShowPronunciationManager(false)}
      />
      
      <ChatInterface 
        isOpen={showChatInterface}
        onClose={() => setShowChatInterface(false)}
      />
      
      <VoiceManager 
        isOpen={showVoiceManager}
        onClose={() => setShowVoiceManager(false)}
        onVoiceProfileSelected={handleVoiceProfileSelected}
        currentVoiceProfile={currentVoiceProfile}
      />
      
      <TTSTestPage 
        isOpen={showTTSTestPage}
        onClose={() => setShowTTSTestPage(false)}
      />
    </div>
  )
}

export default App
