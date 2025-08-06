import { useState, useRef, useEffect } from 'react'
import { X, Mic, Square, Play, Pause, Trash2, Plus, Volume2, Upload } from 'lucide-react'
import axios from 'axios'

interface VoiceProfile {
  id: string
  name: string
  created_at: string
  file_path: string
  sample_duration?: number
}

interface VoiceManagerProps {
  isOpen: boolean
  onClose: () => void
  onVoiceProfileSelected?: (profileId: string) => void
  currentVoiceProfile?: string
}

function VoiceManager({ isOpen, onClose, onVoiceProfileSelected, currentVoiceProfile }: VoiceManagerProps) {
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playingProfileId, setPlayingProfileId] = useState<string | null>(null)
  const [newVoiceName, setNewVoiceName] = useState('')
  const [isTraining, setIsTraining] = useState(false)
  const [error, setError] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<string>(currentVoiceProfile || 'default')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<number | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadVoiceProfiles()
    }
  }, [isOpen])

  const loadVoiceProfiles = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/tts/voice-profiles')
      setVoiceProfiles(response.data.profiles || [])
    } catch (error) {
      console.error('Error loading voice profiles:', error)
      setError('Failed to load voice profiles')
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      let options: MediaRecorderOptions = {}
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus'
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
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      setError('')
      
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      setError('Unable to access microphone. Please check permissions.')
      console.error('Error accessing microphone:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      
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

  const playVoiceSample = async (profileId: string) => {
    try {
      if (playingProfileId === profileId) {
        audioElementRef.current?.pause()
        setPlayingProfileId(null)
        return
      }

      const response = await axios.get(`http://127.0.0.1:8000/api/tts/voice-profiles/${profileId}/sample`, {
        responseType: 'blob'
      })
      
      const audioUrl = URL.createObjectURL(response.data)
      const audio = new Audio(audioUrl)
      audioElementRef.current = audio
      
      audio.onended = () => {
        setPlayingProfileId(null)
        URL.revokeObjectURL(audioUrl)
      }
      
      audio.onerror = () => {
        setPlayingProfileId(null)
        URL.revokeObjectURL(audioUrl)
        setError('Failed to play voice sample')
      }
      
      setPlayingProfileId(profileId)
      await audio.play()
      
    } catch (error) {
      console.error('Error playing voice sample:', error)
      setError('Failed to play voice sample')
      setPlayingProfileId(null)
    }
  }

  const trainVoiceProfile = async () => {
    if (!recordedBlob || !newVoiceName.trim()) {
      setError('Please record a voice sample and enter a name')
      return
    }

    setIsTraining(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('voice_sample', recordedBlob, 'voice_sample.webm')
      formData.append('profile_name', newVoiceName.trim())
      formData.append('sample_duration', recordingTime.toString())
      
      const response = await axios.post('http://127.0.0.1:8000/api/tts/train-voice-profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      
      console.log('Voice profile trained successfully:', response.data)
      
      // Automatically select the newly created profile
      const newProfileId = response.data.profile_id
      if (newProfileId && onVoiceProfileSelected) {
        onVoiceProfileSelected(newProfileId)
        console.log(`[VoiceManager] Auto-selected new voice profile: ${newProfileId}`)
      }
      
      // Reset form
      setRecordedBlob(null)
      setNewVoiceName('')
      setRecordingTime(0)
      
      // Reload profiles
      await loadVoiceProfiles()
      
    } catch (err: any) {
      console.error('Error training voice profile:', err)
      setError(err.response?.data?.detail || 'Failed to train voice profile')
    } finally {
      setIsTraining(false)
    }
  }

  const deleteVoiceProfile = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this voice profile?')) {
      return
    }

    try {
      await axios.delete(`http://127.0.0.1:8000/api/tts/voice-profiles/${profileId}`)
      await loadVoiceProfiles()
      
      // If deleted profile was selected, reset to default
      if (selectedProfile === profileId) {
        setSelectedProfile('default')
        onVoiceProfileSelected?.('default')
      }
    } catch (error) {
      console.error('Error deleting voice profile:', error)
      setError('Failed to delete voice profile')
    }
  }

  const selectVoiceProfile = (profileId: string) => {
    setSelectedProfile(profileId)
    onVoiceProfileSelected?.(profileId)
  }

  const clearRecording = () => {
    setRecordedBlob(null)
    setRecordingTime(0)
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      setIsPlaying(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="voice-manager-overlay">
      <div className="voice-manager-modal">
        <div className="voice-manager-header">
          <h2>🎙️ Voice Profile Manager</h2>
          <button className="close-btn" onClick={onClose}>
            <X className="btn-icon" />
          </button>
        </div>

        <div className="voice-manager-content">
          {/* Current Voice Profiles */}
          <div className="voice-profiles-section">
            <h3>📚 Your Voice Profiles</h3>
            
            <div className="voice-profile-item default-profile">
              <div className="profile-info">
                <h4>🤖 Default Voice (System TTS)</h4>
                <p>Built-in text-to-speech voice</p>
              </div>
              <div className="profile-actions">
                <button 
                  className={`select-btn ${selectedProfile === 'default' ? 'selected' : ''}`}
                  onClick={() => selectVoiceProfile('default')}
                >
                  {selectedProfile === 'default' ? 'Selected' : 'Select'}
                </button>
              </div>
            </div>

            {voiceProfiles.length > 0 ? (
              voiceProfiles.map((profile) => (
                <div key={profile.id} className="voice-profile-item">
                  <div className="profile-info">
                    <h4>👤 {profile.name}</h4>
                    <p>Created: {new Date(profile.created_at).toLocaleDateString()}</p>
                    {profile.sample_duration && (
                      <p>Sample: {formatTime(profile.sample_duration)}</p>
                    )}
                  </div>
                  <div className="profile-actions">
                    <button 
                      className="play-sample-btn"
                      onClick={() => playVoiceSample(profile.id)}
                      title="Play voice sample"
                    >
                      {playingProfileId === profile.id ? <Pause className="btn-icon-small" /> : <Volume2 className="btn-icon-small" />}
                    </button>
                    <button 
                      className={`select-btn ${selectedProfile === profile.id ? 'selected' : ''}`}
                      onClick={() => selectVoiceProfile(profile.id)}
                    >
                      {selectedProfile === profile.id ? 'Selected' : 'Select'}
                    </button>
                    <button 
                      className="delete-btn"
                      onClick={() => deleteVoiceProfile(profile.id)}
                      title="Delete voice profile"
                    >
                      <Trash2 className="btn-icon-small" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-profiles">
                <p>No custom voice profiles yet. Create your first one below!</p>
              </div>
            )}
          </div>

          {/* Create New Voice Profile */}
          <div className="new-profile-section">
            <h3>✨ Create New Voice Profile</h3>
            <p>Record 15-30 seconds of clear speech in a quiet environment for best results.</p>

            <div className="profile-name-input">
              <label htmlFor="voice-name">Profile Name:</label>
              <input
                id="voice-name"
                type="text"
                value={newVoiceName}
                onChange={(e) => setNewVoiceName(e.target.value)}
                placeholder="e.g., My Voice, Professional Voice"
                maxLength={50}
              />
            </div>

            <div className="recording-section">
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
                  <button className="stop-btn" onClick={stopRecording}>
                    <Square className="btn-icon" />
                    Stop Recording
                  </button>
                </div>
              )}

              {recordedBlob && (
                <div className="recorded-sample">
                  <div className="sample-info">
                    <span>✅ Sample recorded: {formatTime(recordingTime)}</span>
                  </div>
                  <div className="sample-controls">
                    <button className="play-btn" onClick={playRecording}>
                      {isPlaying ? <Pause className="btn-icon" /> : <Play className="btn-icon" />}
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button className="clear-btn" onClick={clearRecording}>
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {recordedBlob && newVoiceName.trim() && (
              <button 
                className="train-btn"
                onClick={trainVoiceProfile}
                disabled={isTraining}
              >
                <Upload className="btn-icon" />
                {isTraining ? 'Training Voice Profile...' : 'Create Voice Profile'}
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VoiceManager
