"use client";

import React, { useState, useEffect } from 'react';
import Image from "next/image";

/**
 * Windows 95 style component - Recent Buys
 * Includes a real-time ticking clock and live "time ago" updates.
 */

const RecentBuys = () => {
  const [buys, setBuys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // State for the ticking clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch recent buy activities
  const fetchRecentBuys = async () => {
    try {
      const response = await fetch('/api/activity?type=buy&limit=20');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setBuys(data.activities || []);
    } catch (err) {
      console.error('Error fetching buys:', err);
    } finally {
      setLoading(false);
    }
  };

  // Effect 1: API Polling (Every 30 seconds)
  useEffect(() => {
    fetchRecentBuys();
    const interval = setInterval(fetchRecentBuys, 30000);
    return () => clearInterval(interval);
  }, []);

  // Effect 2: Clock Heartbeat (Every 1 second)
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Format time ago relative to the ticking currentTime state
  const timeAgo = (dateString) => {
    const seconds = Math.floor((currentTime - new Date(dateString)) / 1000);
    if (seconds < 0) return `0s ago`; // Handle slight clock desync
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatSol = (amount) => {
    if (!amount) return '0.0000';
    return parseFloat(amount).toFixed(4);
  };

  const getActivityIcon = (type) => {
    if (type?.includes('target')) {
      return (
        <div style={styles.icon95}>
          <Image src="/print.png" alt="Print" width={16} height={16} style={{ imageRendering: 'pixelated' }} />
        </div>
      );
    }
    if (type?.includes('self')) {
      return (
        <div style={{ ...styles.icon95, backgroundColor: '#800080' }}>
          <span style={{ fontSize: '10px' }}>↻</span>
        </div>
      );
    }
    if (type?.includes('combined')) {
      return (
        <div style={{ ...styles.icon95, backgroundColor: '#808000' }}>
          <span style={{ fontSize: '10px' }}>⚡</span>
        </div>
      );
    }
    return (
      <div style={{ ...styles.icon95, backgroundColor: '#008000' }}>
        <span style={{ fontSize: '10px' }}>$</span>
      </div>
    );
  };

  const getActivityLabel = (type) => {
    if (type?.includes('target')) return 'Stonks Fund';
    if (type?.includes('self')) return 'Buyback';
    if (type?.includes('combined')) return 'Stonks Fund';
    return 'Buy';
  };

  if (isMinimized) return null;

  return (
    <div style={styles.windowContainer}>
      {/* Window Frame */}
      <div style={styles.window95}>
        {/* Title Bar */}
        <div style={styles.titleBar}>
          <div style={styles.titleBarLeft}>
            <span style={styles.titleText}>Recent Activity</span>
          </div>
        </div>

        {/* Menu Bar */}
        <div style={styles.menuBar}>
          <span style={styles.menuItem}>File</span>
          <span style={styles.menuItem}>Edit</span>
          <span style={styles.menuItem}>View</span>
          <span style={styles.menuItem}>Help</span>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <button style={styles.toolbarButton} onClick={fetchRecentBuys}>
            <span>🔄</span> Refresh
          </button>
          <div style={styles.toolbarSeparator}></div>
          <div style={styles.statusIndicator}>
            <div style={styles.statusDot}></div>
            <span style={{ fontSize: '11px' }}>Live</span>
          </div>
        </div>

        {/* Content Area */}
        <div style={styles.contentArea}>
          {loading ? (
            <div style={styles.loadingContainer}>
              <div style={styles.loadingWindow}>
                <div style={styles.loadingTitleBar}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold' }}>Loading...</span>
                </div>
                <div style={styles.loadingContent}>
                  <div style={styles.hourglassIcon}>⏳</div>
                  <p style={{ margin: '8px 0', fontSize: '11px' }}>Please wait while Windows loads your transactions...</p>
                  <div style={styles.progressBarOuter}>
                    <div style={styles.progressBarInner}></div>
                  </div>
                </div>
              </div>
            </div>
          ) : buys.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📂</div>
              <p style={styles.emptyTitle}>This folder is empty</p>
              <p style={styles.emptySubtitle}>Transactions will appear here as they happen.</p>
            </div>
          ) : (
            <>
              {/* Column Headers */}
              <div style={styles.listHeader}>
                <div style={{ ...styles.headerCell, width: '32px' }}></div>
                <div style={{ ...styles.headerCell, flex: 1 }}>Name</div>
                <div style={{ ...styles.headerCell, width: '80px' }}>Type</div>
                <div style={{ ...styles.headerCell, width: '100px', textAlign: 'right' }}>Amount</div>
                <div style={{ ...styles.headerCell, width: '70px', textAlign: 'right' }}>Time</div>
              </div>

              {/* List Items */}
              <div style={styles.listContainer}>
                {buys.map((buy, index) => (
                  <a
                    key={buy.id || index}
                    href={buy.transaction_signature ? `https://solscan.io/tx/${buy.transaction_signature}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.listItem}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#000080';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#000000';
                    }}
                  >
                    <div style={{ width: '32px', display: 'flex', justifyContent: 'center' }}>
                      {getActivityIcon(buy.activity_type)}
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {buy.token_name || getActivityLabel(buy.activity_type)}
                    </div>
                    <div style={{ width: '80px', fontSize: '11px' }}>
                      {getActivityLabel(buy.activity_type)}
                    </div>
                    <div style={{ width: '100px', textAlign: 'right', color: '#008000', fontWeight: 'bold' }}>
                      +{formatSol(buy.amount_sol)} SOL
                    </div>
                    <div style={{ width: '70px', textAlign: 'right', fontSize: '11px' }}>
                      {timeAgo(buy.created_at)}
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status Bar */}
        <div style={styles.statusBar}>
          <div style={styles.statusSection}>
            {buys.length} object(s)
          </div>
          <div style={{ ...styles.statusSection, maxWidth: '100px', textAlign: 'center' }}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Windows 95 Styles
const styles = {
  windowContainer: {
    width: '100%',
    maxWidth: '640px',
    margin: '0 auto',
    padding: '16px',
    fontFamily: '"MS Sans Serif", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  },
  window95: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    boxShadow: '1px 1px 0 0 #000000',
  },
  titleBar: {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    padding: '2px 3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  titleText: {
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 'bold',
    textShadow: '1px 1px 0 #000000',
  },
  titleBarButtons: {
    display: 'flex',
    gap: '2px',
  },
  titleButton: {
    width: '16px',
    height: '14px',
    backgroundColor: '#c0c0c0',
    border: '1px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    fontSize: '11px',
    fontWeight: 'bold',
  },
  closeButton: {
    marginLeft: '2px',
  },
  buttonIcon: {
    lineHeight: 1,
    marginTop: '-2px',
  },
  menuBar: {
    backgroundColor: '#c0c0c0',
    borderBottom: '1px solid #808080',
    padding: '2px 4px',
    display: 'flex',
    gap: '8px',
  },
  menuItem: {
    fontSize: '11px',
    padding: '2px 6px',
    cursor: 'pointer',
  },
  toolbar: {
    backgroundColor: '#c0c0c0',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #808080',
  },
  toolbarButton: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    padding: '2px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  toolbarSeparator: {
    width: '2px',
    height: '20px',
    borderLeft: '1px solid #808080',
    borderRight: '1px solid #ffffff',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
  },
  statusDot: {
    width: '4px',
    height: '4px',
    backgroundColor: '#00ff00',
    borderRadius: '50%',
    boxShadow: '0 0 4px #00ff00',
  },
  contentArea: {
    backgroundColor: '#ffffff',
    border: '2px solid',
    borderColor: '#808080 #ffffff #ffffff #808080',
    margin: '4px',
    minHeight: '300px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: '#c0c0c0',
    borderBottom: '2px solid',
    borderColor: '#808080 #ffffff #ffffff #808080',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerCell: {
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '2px 4px',
  },
  listContainer: {
    padding: '2px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '11px',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#000000',
    transition: 'none',
  },
  icon95: {
    width: '16px',
    height: '16px',
    backgroundColor: '#000080',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '10px',
    imageRendering: 'pixelated',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '200px',
  },
  loadingWindow: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    width: '280px',
  },
  loadingTitleBar: {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    padding: '2px 4px',
    color: '#ffffff',
  },
  loadingContent: {
    padding: '16px',
    textAlign: 'center',
  },
  hourglassIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  progressBarOuter: {
    width: '100%',
    height: '16px',
    backgroundColor: '#ffffff',
    border: '2px solid',
    borderColor: '#808080 #ffffff #ffffff #808080',
    overflow: 'hidden',
  },
  progressBarInner: {
    width: '60%',
    height: '100%',
    background: 'repeating-linear-gradient(90deg, #000080 0px, #000080 8px, #c0c0c0 8px, #c0c0c0 16px)',
    animation: 'progress95 1s linear infinite',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '12px',
    fontWeight: 'bold',
    margin: '0 0 4px 0',
  },
  emptySubtitle: {
    fontSize: '11px',
    color: '#808080',
    margin: 0,
  },
  statusBar: {
    backgroundColor: '#c0c0c0',
    borderTop: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    padding: '2px 4px',
    display: 'flex',
    gap: '4px',
    fontSize: '11px',
    height: '24px',
  },
  statusSection: {
    flex: 1,
    padding: '2px 4px',
    border: '1px solid',
    borderColor: '#808080 #ffffff #ffffff #808080',
    backgroundColor: '#c0c0c0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
};

// Add keyframes for progress bar animation and system font fallback
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes progress95 {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default RecentBuys;