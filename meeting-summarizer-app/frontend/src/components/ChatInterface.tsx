import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface ChatMessage {
  id: string;
  query: string;
  response: string;
  timestamp: string;
  query_type: string;
  meetings_found: number;
  relevant_meetings: Array<{
    id: string;
    title: string;
    created_at: string;
    relevance_score: number;
  }>;
}

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuery, setCurrentQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSuggestions = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/chat/suggestions');
      setSuggestions(response.data.suggestions);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  };

  const sendQuery = async (query?: string) => {
    const queryText = query || currentQuery;
    if (!queryText.trim() || isLoading) return;

    setIsLoading(true);
    setCurrentQuery('');

    try {
      const response = await axios.post('http://localhost:8000/api/chat/query', {
        query: queryText
      });

      const newMessage: ChatMessage = {
        id: Date.now().toString(),
        ...response.data,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('Error sending query:', error);
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        query: queryText,
        response: 'Sorry, I encountered an error processing your request. Please try again.',
        timestamp: new Date().toISOString(),
        query_type: 'error',
        meetings_found: 0,
        relevant_meetings: []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuery();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="chat-modal">
      <div className="chat-modal-content">
        <div className="chat-header">
          <div className="chat-title">
            <h2>💬 Ask About Your Meetings</h2>
            <p>Ask me anything about your recorded meetings!</p>
          </div>
          <div className="chat-controls">
            {messages.length > 0 && (
              <button onClick={clearChat} className="chat-clear-btn">
                Clear
              </button>
            )}
            <button onClick={onClose} className="chat-close-btn">
              ×
            </button>
          </div>
        </div>

        <div className="chat-body">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome-message">
                <h3>🤖 Hello! I'm your meeting assistant</h3>
                <p>You can ask me questions like:</p>
              </div>
              
              <div className="chat-suggestions">
                {suggestions.map((category, idx) => (
                  <div key={idx} className="suggestion-category">
                    <h4>{category.category}</h4>
                    <div className="suggestion-examples">
                      {category.examples.map((example: string, exampleIdx: number) => (
                        <button
                          key={exampleIdx}
                          onClick={() => sendQuery(example)}
                          className="suggestion-btn"
                          disabled={isLoading}
                        >
                          "{example}"
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-messages">
              {messages.map((message) => (
                <div key={message.id} className="chat-message">
                  <div className="chat-query">
                    <div className="chat-bubble user-bubble">
                      <strong>You:</strong> {message.query}
                    </div>
                  </div>
                  
                  <div className="chat-response">
                    <div className="chat-bubble assistant-bubble">
                      <div className="response-header">
                        <strong>🤖 Assistant:</strong>
                        <span className="query-type">{message.query_type}</span>
                        {message.meetings_found > 0 && (
                          <span className="meetings-count">
                            Found {message.meetings_found} relevant meeting{message.meetings_found !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="response-text">{message.response}</div>
                      
                      {message.relevant_meetings.length > 0 && (
                        <div className="relevant-meetings">
                          <h4>📋 Related Meetings:</h4>
                          {message.relevant_meetings.map((meeting) => (
                            <div key={meeting.id} className="meeting-ref">
                              <span className="meeting-title">{meeting.title}</span>
                              <span className="meeting-date">
                                {new Date(meeting.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="chat-message">
                  <div className="chat-response">
                    <div className="chat-bubble assistant-bubble loading">
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                      Processing your query...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <textarea
              value={currentQuery}
              onChange={(e) => setCurrentQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about your meetings... (e.g., 'What are my todos?')"
              className="chat-input"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={() => sendQuery()}
              disabled={!currentQuery.trim() || isLoading}
              className="chat-send-btn"
            >
              {isLoading ? '⏳' : '📤'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
