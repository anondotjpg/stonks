'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function Token() {
  const params = useParams();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  useEffect(() => {
    if (params.addr) {
      fetchToken();
    }
  }, [params.addr]);

  const fetchToken = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/tokens/${params.addr}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch token');
      setToken(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (loading) {
    return (
      <div style={styles.desktop}>
        <div style={styles.window}>
          <div style={styles.titleBar}>
            <span style={styles.titleText}>Loading...</span>
            <div style={styles.titleButtons}>
              <button style={styles.titleBtn}>×</button>
            </div>
          </div>
          <div style={{ ...styles.content, textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
            <div>Loading token data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.desktop}>
        <div style={styles.window}>
          <div style={styles.titleBar}>
            <span style={styles.titleText}>Error</span>
            <div style={styles.titleButtons}>
              <button style={styles.titleBtn}>×</button>
            </div>
          </div>
          <div style={{ ...styles.content, textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>❌</div>
            <div style={{ color: '#ff0000', marginBottom: '16px' }}>{error}</div>
            <Link href="/" style={styles.button}>← Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={styles.desktop}>
        <div style={styles.window}>
          <div style={styles.titleBar}>
            <span style={styles.titleText}>Not Found</span>
            <div style={styles.titleButtons}>
              <button style={styles.titleBtn}>×</button>
            </div>
          </div>
          <div style={{ ...styles.content, textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>📂</div>
            <div style={{ marginBottom: '16px' }}>Token not found</div>
            <Link href="/" style={styles.button}>← Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.desktop}>
      <div style={styles.window}>
        {/* Title Bar */}
        <div style={styles.titleBar}>
          <div style={styles.titleLeft}>
            <span style={styles.titleText}>{token.name} ({token.symbol})</span>
          </div>
          <div style={styles.titleButtons}>
            <button style={styles.titleBtn}>_</button>
            <button style={styles.titleBtn}>□</button>
            <button style={styles.titleBtn}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Back Button */}
          <Link href="/" style={{ ...styles.button, marginBottom: '16px', display: 'inline-block' }}>
            ← Back
          </Link>

          {/* Token Info Section */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>📋 Token Information</div>
            <div style={styles.sectionBody}>
              <div style={styles.tokenHeader}>
                {token.image_uri && (
                  <img
                    src={token.image_uri}
                    alt={token.name}
                    style={styles.tokenImage}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div style={styles.tokenInfo}>
                  <div style={styles.tokenName}>{token.name}</div>
                  <div style={styles.tokenSymbol}>${token.symbol}</div>
                  {token.description && (
                    <div style={styles.tokenDesc}>{token.description}</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mint Address Section */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>🔑 Mint Address</div>
            <div style={styles.sectionBody}>
              <div style={styles.addressRow}>
                <div style={styles.addressBox}>
                  {token.mint_address.slice(0, 8)}...{token.mint_address.slice(-8)}
                </div>
                <button
                  onClick={() => copyToClipboard(token.mint_address, 'mint')}
                  style={styles.button}
                >
                  {copiedField === 'mint' ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Fee Account Section */}
          {token.fee_account && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>💰 Rewards To</div>
              <div style={styles.sectionBody}>
                <a
                  href={`https://x.com/${token.fee_account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.linkButton}
                >
                  {token.fee_account} 𝕏
                </a>
              </div>
            </div>
          )}

          {/* Social Links Section */}
          {(token.website_url || token.twitter_url || token.telegram_url) && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>🔗 Links</div>
              <div style={styles.sectionBody}>
                <div style={styles.linksRow}>
                  {token.website_url && (
                    <a href={token.website_url} target="_blank" rel="noopener noreferrer" style={styles.button}>
                      🌐 Website
                    </a>
                  )}
                  {token.twitter_url && (
                    <a href={token.twitter_url} target="_blank" rel="noopener noreferrer" style={styles.button}>
                      𝕏 Twitter
                    </a>
                  )}
                  {token.telegram_url && (
                    <a href={token.telegram_url} target="_blank" rel="noopener noreferrer" style={styles.button}>
                      📱 Telegram
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Trade Links Section */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>📈 Trade</div>
            <div style={styles.sectionBody}>
              <div style={styles.tradeLinks}>
                <a
                  href={`https://pump.fun/coin/${token.mint_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.tradeButton}
                >
                  <img src="/pill.png" style={styles.tradeIcon} />
                  View on Pump
                </a>
                <a
                  href="https://jup.ag/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.tradeButton}
                >
                  <img src="/logo.png" style={styles.tradeIcon} />
                  Buy on Jupiter
                </a>
                <a
                  href={`https://axiom.trade/t/${token.mint_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.tradeButton}
                >
                  <img src="/axiom.png" style={{ ...styles.tradeIcon, borderRadius: '50%' }} />
                  Buy on Axiom
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <span>Ready</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  desktop: {
    minHeight: '100vh',
    backgroundColor: '#008080',
    padding: '16px',
    fontFamily: '"MS Sans Serif", Tahoma, sans-serif',
  },
  window: {
    maxWidth: '600px',
    margin: '0 auto',
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
    backgroundColor: '#fff',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    margin: '4px',
  },
  tokenHeader: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
  },
  tokenImage: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    flexShrink: 0,
  },
  tokenInfo: {
    flex: 1,
  },
  tokenName: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#000080',
    marginBottom: '4px',
  },
  tokenSymbol: {
    fontSize: '14px',
    color: '#808080',
    marginBottom: '8px',
  },
  tokenDesc: {
    fontSize: '11px',
    color: '#000',
    lineHeight: 1.4,
  },
  addressRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  addressBox: {
    flex: 1,
    padding: '8px',
    backgroundColor: '#fff',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    fontSize: '11px',
    fontFamily: 'monospace',
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
    display: 'inline-block',
  },
  linkButton: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#000',
    display: 'inline-block',
  },
  linksRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  tradeLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tradeButton: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tradeIcon: {
    width: '20px',
    height: '20px',
  },
  statusBar: {
    backgroundColor: '#c0c0c0',
    borderTop: '2px solid #fff',
    padding: '2px 8px',
    fontSize: '11px',
  },
};