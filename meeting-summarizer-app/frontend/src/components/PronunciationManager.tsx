import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface PronunciationCorrection {
  id: string;
  incorrect_phrase: string;
  correct_phrase: string;
  usage_count: number;
  created_at: string;
}

interface PronunciationManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const PronunciationManager: React.FC<PronunciationManagerProps> = ({ isOpen, onClose }) => {
  const [corrections, setCorrections] = useState<PronunciationCorrection[]>([]);
  const [newIncorrect, setNewIncorrect] = useState('');
  const [newCorrect, setNewCorrect] = useState('');
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCorrections();
    }
  }, [isOpen]);

  const fetchCorrections = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/pronunciation/corrections');
      setCorrections(response.data);
    } catch (error) {
      console.error('Error fetching corrections:', error);
    }
  };

  const addCorrection = async () => {
    if (!newIncorrect.trim() || !newCorrect.trim()) return;

    try {
      setLoading(true);
      await axios.post('http://localhost:8000/api/pronunciation/corrections', {
        incorrect_phrase: newIncorrect.trim(),
        correct_phrase: newCorrect.trim()
      });
      
      setNewIncorrect('');
      setNewCorrect('');
      await fetchCorrections();
    } catch (error) {
      console.error('Error adding correction:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCorrection = async (id: string) => {
    try {
      await axios.delete(`http://localhost:8000/api/pronunciation/corrections/${id}`);
      await fetchCorrections();
    } catch (error) {
      console.error('Error deleting correction:', error);
    }
  };

  const testCorrection = async () => {
    if (!testText.trim()) return;

    try {
      const response = await axios.post('http://localhost:8000/api/pronunciation/test-correction', null, {
        params: { text: testText }
      });
      setTestResult(response.data.corrected);
    } catch (error) {
      console.error('Error testing correction:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="pronunciation-modal">
      <div className="pronunciation-modal-content">
        <div className="pronunciation-modal-header">
          <h2>Pronunciation Corrections</h2>
          <button
            onClick={onClose}
            className="pronunciation-close-btn"
          >
            ×
          </button>
        </div>

        <div className="pronunciation-modal-body">
          {/* Add New Correction */}
          <div className="pronunciation-section add-section">
            <h3>Add New Correction</h3>
            <div className="pronunciation-form-grid">
              <div className="pronunciation-form-group">
                <label>Incorrect Phrase</label>
                <input
                  type="text"
                  value={newIncorrect}
                  onChange={(e) => setNewIncorrect(e.target.value)}
                  placeholder="e.g., Guy"
                  className="pronunciation-input"
                />
              </div>
              <div className="pronunciation-form-group">
                <label>Correct Phrase</label>
                <input
                  type="text"
                  value={newCorrect}
                  onChange={(e) => setNewCorrect(e.target.value)}
                  placeholder="e.g., GAIA"
                  className="pronunciation-input"
                />
              </div>
            </div>
            <button
              onClick={addCorrection}
              disabled={loading || !newIncorrect.trim() || !newCorrect.trim()}
              className="pronunciation-btn primary"
            >
              {loading ? 'Adding...' : 'Add Correction'}
            </button>
          </div>

          {/* Test Corrections */}
          <div className="pronunciation-section test-section">
            <h3>Test Corrections</h3>
            <div className="pronunciation-form-group">
              <label>Test Text</label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Enter text to test pronunciation corrections..."
                className="pronunciation-input pronunciation-textarea"
                rows={3}
              />
            </div>
            <button
              onClick={testCorrection}
              disabled={!testText.trim()}
              className="pronunciation-btn success"
            >
              Test Corrections
            </button>
            {testResult && (
              <div className="pronunciation-test-result">
                <div className="original">
                  <div className="label">Original:</div>
                  <div>{testText}</div>
                </div>
                <div className="corrected">
                  <div className="label">Corrected:</div>
                  <div>{testResult}</div>
                </div>
              </div>
            )}
          </div>

          {/* Existing Corrections */}
          <div className="pronunciation-section">
            <h3>
              Existing Corrections <span className="pronunciation-count">({corrections.length})</span>
            </h3>
            
            {corrections.length === 0 ? (
              <div className="pronunciation-empty">
                No pronunciation corrections configured yet.
              </div>
            ) : (
              <div className="pronunciation-corrections-list">
                {corrections.map((correction) => (
                  <div
                    key={correction.id}
                    className="pronunciation-correction-item"
                  >
                    <div className="pronunciation-correction-content">
                      <span className="pronunciation-phrase incorrect">
                        "{correction.incorrect_phrase}"
                      </span>
                      <span className="pronunciation-arrow">→</span>
                      <span className="pronunciation-phrase correct">
                        "{correction.correct_phrase}"
                      </span>
                      <span className="pronunciation-usage">
                        (used {correction.usage_count} times)
                      </span>
                    </div>
                    <button
                      onClick={() => deleteCorrection(correction.id)}
                      className="pronunciation-delete-btn"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PronunciationManager;
