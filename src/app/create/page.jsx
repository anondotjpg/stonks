"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const PumpTokenCreator = () => {
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    image: null,
    twitter: '',
    telegram: '',
    website: '',
    discord: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [rateLimitError, setRateLimitError] = useState(null);
  const [tokenData, setTokenData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [previewImage, setPreviewImage] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState({});

  const steps = [
    { id: 'wallet', label: 'Creating Wallet', icon: '🔑' },
    { id: 'funding', label: 'Funding Wallet', icon: '💰' },
    { id: 'metadata', label: 'Uploading Metadata', icon: '📝' },
    { id: 'token', label: 'Launching Token', icon: '🚀' },
    { id: 'saving', label: 'Saving Data', icon: '💾' },
    { id: 'complete', label: 'Processing', icon: '✅' }
  ];

  const isDevelopment = process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location.hostname === 'localhost');

  useEffect(() => {
    if (success && !loading) {
      const timer = setTimeout(() => {
        setSuccess(false);
        setTokenData(null);
        setWalletData(null);
        setCurrentStep(0);
        setStepStatuses({});
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [success, loading]);

  useEffect(() => {
    if (rateLimitError) {
      const timer = setTimeout(() => setRateLimitError(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [rateLimitError]);

  const updateStepStatus = (stepId, status, delay = 0) => {
    setTimeout(() => {
      setStepStatuses(prev => ({ ...prev, [stepId]: status }));
    }, delay);
  };

  const simulateProgress = () => {
    setCurrentStep(0);
    updateStepStatus('wallet', 'loading');
    setTimeout(() => { updateStepStatus('wallet', 'complete'); setCurrentStep(1); updateStepStatus('funding', 'loading'); }, 1000);
    setTimeout(() => { updateStepStatus('funding', 'complete'); setCurrentStep(2); updateStepStatus('metadata', 'loading'); }, 3500);
    setTimeout(() => { updateStepStatus('metadata', 'complete'); setCurrentStep(3); updateStepStatus('token', 'loading'); }, 5000);
    setTimeout(() => { updateStepStatus('token', 'complete'); setCurrentStep(4); updateStepStatus('saving', 'loading'); }, 5500);
    setTimeout(() => { updateStepStatus('saving', 'complete'); setCurrentStep(5); updateStepStatus('complete', 'complete'); }, 6000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, image: file }));
      const reader = new FileReader();
      reader.onload = (e) => setPreviewImage(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const createPumpToken = async () => {
    if (!formData.name || !formData.symbol) {
      setError('Name and symbol are required');
      return;
    }

    setLoading(true);
    setError('');
    setRateLimitError(null);
    setSuccess(false);
    setCurrentStep(0);
    setStepStatuses({});
    simulateProgress();

    try {
      const apiFormData = new FormData();
      apiFormData.append('name', formData.name);
      apiFormData.append('symbol', formData.symbol);
      apiFormData.append('description', formData.description);
      apiFormData.append('twitter', formData.twitter);
      apiFormData.append('telegram', formData.telegram);
      apiFormData.append('website', formData.website);
      apiFormData.append('discord', formData.discord);
      if (formData.image) apiFormData.append('image', formData.image);

      const response = await fetch('/api/tokens/create', { method: 'POST', body: apiFormData });
      const result = await response.json();

      if (response.status === 429) {
        setRateLimitError({
          message: result.error,
          remainingMinutes: result.remainingMinutes,
          lastCreation: result.lastCreation,
          rateLimitType: result.rateLimitType || 'ip'
        });
        setLoading(false);
        setCurrentStep(0);
        setStepStatuses({});
        return;
      }

      if (!response.ok || !result.success) throw new Error(result.error || `API Error: ${response.status}`);

      setTokenData(result.token);
      setWalletData(result.wallet);
      setSuccess(true);
      setFormData({ name: '', symbol: '', description: '', image: null, twitter: '', telegram: '', website: '', discord: '' });
      setPreviewImage('');
    } catch (err) {
      setError(err.message || 'An error occurred while creating the token');
      setLoading(false);
      setCurrentStep(0);
      setStepStatuses({});
    } finally {
      setTimeout(() => setLoading(false), 6000);
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setError('');
    setRateLimitError(null);
    setTokenData(null);
    setWalletData(null);
    setCurrentStep(0);
    setStepStatuses({});
  };

  return (
    <div style={styles.desktop}>
      {/* Toast Messages */}
      {rateLimitError && (
        <div style={styles.toast}>
          <div style={styles.toastError}>
            ⏰ Rate Limited - Wait {rateLimitError.remainingMinutes} minutes
            <button onClick={() => setRateLimitError(null)} style={styles.toastClose}>×</button>
          </div>
        </div>
      )}

      {(loading || success) && !rateLimitError && (
        <div style={styles.toast}>
          {loading && (
            <div style={styles.toastLoading}>
              ⏳ {steps[currentStep]?.label || 'Processing...'}
            </div>
          )}
          {success && tokenData && !loading && (
            <div style={styles.toastSuccess}>
              ✅ {tokenData.tokenName} ({tokenData.tokenSymbol}) created!
              {tokenData.mint && tokenData.mint !== 'Unknown' && (
                <a
                  href={isDevelopment ? 'https://pump.fun/board' : `https://pump.fun/${tokenData.mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.toastLink}
                >
                  View
                </a>
              )}
              <button onClick={resetForm} style={styles.toastClose}>×</button>
            </div>
          )}
        </div>
      )}

      <div style={styles.window}>
        {/* Title Bar */}
        <div style={styles.titleBar}>
          <div style={styles.titleLeft}>
            <span style={styles.titleText}>💰 Create New Token</span>
          </div>
          <div style={styles.titleButtons}>
            <button style={styles.titleBtn}>_</button>
            <button style={styles.titleBtn}>□</button>
            <button style={styles.titleBtn}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <Link href="/" style={{ ...styles.button, marginBottom: '16px', display: 'inline-block' }}>
            ← Back
          </Link>

          {/* Error Message */}
          {error && (
            <div style={styles.errorBox}>
              ⚠️ {error}
            </div>
          )}

          {/* Form */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>📝 Token Details</div>
            <div style={styles.sectionBody}>
              <div style={styles.formGrid}>
                {/* Image Upload */}
                <div style={styles.formGroup}>
                  <label style={styles.label}>Image *</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    id="image-upload"
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="image-upload" style={styles.imageUpload}>
                    {previewImage ? (
                      <img src={previewImage} alt="Preview" style={styles.previewImg} />
                    ) : (
                      <span>📁 Click to upload</span>
                    )}
                  </label>
                </div>

                {/* Name & Symbol */}
                <div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Meme"
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Ticker *</label>
                    <input
                      type="text"
                      name="symbol"
                      value={formData.symbol}
                      onChange={handleInputChange}
                      placeholder="MEME"
                      maxLength="10"
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="The best token ever"
                  rows={3}
                  maxLength="500"
                  style={styles.textarea}
                />
                <div style={styles.charCount}>{formData.description.length}/500</div>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div style={styles.section}>
            <div
              style={{ ...styles.sectionHeader, cursor: 'pointer' }}
              onClick={() => setShowLinks(!showLinks)}
            >
              🔗 Social Links (Optional) {showLinks ? '▲' : '▼'}
            </div>
            {showLinks && (
              <div style={styles.sectionBody}>
                <div style={styles.linksGrid}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>𝕏 / Twitter</label>
                    <input
                      type="url"
                      name="twitter"
                      value={formData.twitter}
                      onChange={handleInputChange}
                      placeholder="https://x.com/yourtoken"
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Telegram</label>
                    <input
                      type="url"
                      name="telegram"
                      value={formData.telegram}
                      onChange={handleInputChange}
                      placeholder="https://t.me/yourtoken"
                      style={styles.input}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Website</label>
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleInputChange}
                      placeholder="https://yourtoken.com"
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={createPumpToken}
            disabled={loading || !formData.name || !formData.symbol || rateLimitError}
            style={{
              ...styles.submitButton,
              opacity: (loading || !formData.name || !formData.symbol || rateLimitError) ? 0.6 : 1,
              cursor: (loading || !formData.name || !formData.symbol || rateLimitError) ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Creating...' : rateLimitError ? `⏰ Rate Limited (${rateLimitError.remainingMinutes}m)` : '🚀 Create Token'}
          </button>
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span>{loading ? 'Processing...' : 'Ready'}</span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  desktop: {
    minHeight: '100vh',
    backgroundColor: '#008080',
    padding: '16px',
    fontFamily: '"MS Sans Serif", Tahoma, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  window: {
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    boxShadow: '2px 2px 0 #000',
  },
  titleBar: {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    padding: '3px 4px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  titleText: {
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  titleButtons: {
    display: 'flex',
    gap: '2px',
  },
  titleBtn: {
    width: '16px',
    height: '14px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    fontSize: '10px',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  content: {
    padding: '16px',
    backgroundColor: '#c0c0c0',
  },
  section: {
    marginBottom: '16px',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
  },
  sectionHeader: {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    color: '#fff',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 'bold',
  },
  sectionBody: {
    padding: '12px',
    backgroundColor: '#c0c0c0',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '12px',
  },
  linksGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
  },
  formGroup: {
    marginBottom: '8px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    backgroundColor: '#fff',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '12px',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    backgroundColor: '#fff',
    fontFamily: 'inherit',
    resize: 'none',
    boxSizing: 'border-box',
  },
  charCount: {
    fontSize: '10px',
    color: '#808080',
    textAlign: 'right',
  },
  imageUpload: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100px',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#808080',
  },
  previewImg: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
  },
  button: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#000',
  },
  submitButton: {
    width: '100%',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  errorBox: {
    backgroundColor: '#fff',
    border: '2px solid #ff0000',
    padding: '8px',
    marginBottom: '16px',
    fontSize: '12px',
    color: '#ff0000',
  },
  toast: {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1000,
  },
  toastLoading: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '2px 2px 0 #000',
  },
  toastSuccess: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '2px 2px 0 #000',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toastError: {
    backgroundColor: '#c0c0c0',
    border: '2px solid #ff0000',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '2px 2px 0 #000',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toastLink: {
    backgroundColor: '#000080',
    color: '#fff',
    padding: '2px 8px',
    fontSize: '11px',
    textDecoration: 'none',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
  },
  toastClose: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '8px',
  },
  poweredBy: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#808080',
  },
  statusBar: {
    backgroundColor: '#c0c0c0',
    borderTop: '2px solid #fff',
    padding: '2px 8px',
    fontSize: '11px',
  },
};

export default PumpTokenCreator;