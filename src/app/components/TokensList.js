"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

const TARGET_TOKEN_CA = process.env.NEXT_PUBLIC_TARGET_TOKEN_CA;

const TokensList = () => {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({});
  const [copiedAddresses, setCopiedAddresses] = useState(new Set());
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    status: 'all',
    search: ''
  });

  const isTargetToken = (token) => {
    if (!TARGET_TOKEN_CA || !token.mint_address) return false;
    return token.mint_address.toLowerCase() === TARGET_TOKEN_CA.toLowerCase();
  };

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/tokens?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch tokens: ${response.status}`);
      const data = await response.json();
      setTokens(data.tokens);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Error fetching tokens:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = async (address) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddresses(prev => new Set([...prev, address]));
      setTimeout(() => {
        setCopiedAddresses(prev => {
          const newSet = new Set(prev);
          newSet.delete(address);
          return newSet;
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const generateTweetIntent = (token) => {
    const message = `People just made a token for you`;
    const url = token.mint_address ? `https://pump.fun/${token.mint_address}` : '';
    const handle = token.fee_account ? ` @${token.fee_account.replace('@', '')}` : '';
    const tweetParams = new URLSearchParams({ text: `${message}${handle}`, url: url });
    return `https://twitter.com/intent/tweet?${tweetParams.toString()}`;
  };

  useEffect(() => { fetchTokens(); }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === 'search' || key === 'status' ? 1 : prev.page
    }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const isTestToken = (token) => {
    return token.raw_response?.test === true || 
           token.mint_address?.startsWith('test-') ||
           token.transaction_signature?.startsWith('test-');
  };

  const getTwitterProfileImage = (username) => {
    if (!username) return null;
    return `https://unavatar.io/twitter/${username.replace('@', '')}`;
  };

  const SkeletonToken = () => (
    <div style={styles.tokenCard}>
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ ...styles.tokenImage, background: '#808080' }}></div>
        <div style={{ flex: 1 }}>
          <div style={{ height: '14px', background: '#808080', width: '60%', marginBottom: '8px' }}></div>
          <div style={{ height: '10px', background: '#a0a0a0', width: '40%', marginBottom: '8px' }}></div>
          <div style={{ height: '8px', background: '#a0a0a0', width: '80%' }}></div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Search and Refresh */}
      <div style={styles.searchRow}>
        <div style={styles.searchContainer}>
          <span style={{ marginRight: '4px' }}>🔍</span>
          <input
            type="text"
            placeholder="Search tokens..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <button onClick={fetchTokens} disabled={loading} style={styles.refreshBtn}>
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Tokens Grid */}
      <div style={styles.tokensGrid}>
        {loading ? (
          [...Array(2)].map((_, i) => <SkeletonToken key={i} />)
        ) : (
          tokens.map((token) => (
            <Link key={token.id} href={`/${token.mint_address}`} style={{ textDecoration: 'none' }}>
              <div style={{
                ...styles.tokenCard,
                borderLeft: isTestToken(token) ? '4px solid #000080' : undefined
              }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {/* Token Image */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {token.image_uri ? (
                      <img
                        src={token.image_uri}
                        alt={token.name}
                        style={styles.tokenImage}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ ...styles.tokenImage, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#c0c0c0' }}>
                        <span style={{ fontSize: '14px', color: '#808080' }}>
                          {token.symbol?.slice(0, 3) || '?'}
                        </span>
                      </div>
                    )}
                    {isTargetToken(token) && (
                      <div style={styles.verifiedBadge}>✓</div>
                    )}
                  </div>

                  {/* Token Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={styles.tokenName}>{token.name}</span>
                          {isTestToken(token) && <span style={styles.testBadge}>TEST</span>}
                        </div>
                        <div style={styles.tokenSymbol}>({token.symbol})</div>
                      </div>
                      {token.mint_address && !isTestToken(token) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://pump.fun/${token.mint_address}`, '_blank');
                          }}
                          style={styles.pumpBtn}
                          title="View on Pump.fun"
                        >
                          <img src="/pill.png" style={{ width: '20px', height: '20px' }} />
                        </button>
                      )}
                    </div>

                    {token.description && (
                      <p style={styles.tokenDesc}>{token.description}</p>
                    )}
                  </div>
                </div>

                {/* Bottom Row */}
                <div style={styles.tokenFooter}>
                  {token.mint_address && (
                    <div style={styles.mintAddress}>
                      <span>{token.mint_address.slice(0, 3)}...{token.mint_address.slice(-4)}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCopyAddress(token.mint_address);
                        }}
                        style={styles.copyBtn}
                      >
                        {copiedAddresses.has(token.mint_address) ? '✓' : '📋'}
                      </button>
                    </div>
                  )}
                  {token.fee_account && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(generateTweetIntent(token), '_blank');
                        }}
                        style={styles.shareBtn}
                        title="Tweet"
                      >
                        📢
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`https://x.com/${token.fee_account}`, '_blank');
                        }}
                        style={styles.twitterBtn}
                      >
                        {token.fee_account} 𝕏
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Empty State */}
      {tokens.length === 0 && !loading && (
        <div style={styles.emptyState}>
          <div>📂 No tokens found</div>
          <div style={{ fontSize: '11px', color: '#808080' }}>
            {filters.search || filters.status !== 'all' 
              ? 'Try adjusting your filters' 
              : 'Create your first token to see it here'}
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={styles.pagination}>
          <span style={{ fontSize: '11px' }}>Page {pagination.page} of {pagination.totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev}
              style={{ ...styles.pageBtn, opacity: pagination.hasPrev ? 1 : 0.5 }}
            >
              ◀ Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext}
              style={{ ...styles.pageBtn, opacity: pagination.hasNext ? 1 : 0.5 }}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  searchRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#fff',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    padding: '4px 8px',
    width: '50%',
  },
  searchInput: {
    border: 'none',
    outline: 'none',
    fontSize: '12px',
    flex: 1,
    fontFamily: 'inherit',
  },
  refreshBtn: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  errorBox: {
    backgroundColor: '#fff',
    border: '2px solid #ff0000',
    padding: '8px',
    marginBottom: '16px',
    fontSize: '12px',
  },
  tokensGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '8px',
  },
  tokenCard: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '8px',
    cursor: 'pointer',
  },
  tokenImage: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: '-4px',
    right: '-4px',
    backgroundColor: '#000080',
    color: '#fff',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  tokenName: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#000',
  },
  tokenSymbol: {
    fontSize: '11px',
    color: '#808080',
  },
  testBadge: {
    backgroundColor: '#000080',
    color: '#fff',
    padding: '1px 4px',
    fontSize: '9px',
    fontWeight: 'bold',
  },
  pumpBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
  },
  tokenDesc: {
    fontSize: '10px',
    color: '#404040',
    margin: '4px 0 0 0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  tokenFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #808080',
  },
  mintAddress: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '9px',
    color: '#808080',
  },
  copyBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    padding: 0,
  },
  shareBtn: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '2px 4px',
  },
  twitterBtn: {
    backgroundColor: '#000',
    color: '#fff',
    border: 'none',
    padding: '2px 6px',
    fontSize: '10px',
    cursor: 'pointer',
  },
  emptyState: {
    textAlign: 'center',
    padding: '32px',
    fontSize: '12px',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
    paddingTop: '8px',
    borderTop: '1px solid #808080',
  },
  pageBtn: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    padding: '4px 8px',
    fontSize: '11px',
    cursor: 'pointer',
  },
};

export default TokensList;