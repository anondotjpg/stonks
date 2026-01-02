'use client';

import { useState, useEffect } from 'react'
import TokensList from './components/TokensList'
import RecentBuys from './components/SBuys'
import Link from 'next/link'

const words = ['memes', 'groups', 'movements', 'projects', 'anything']

function AnimatedWord() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return <span style={{ color: '#008000', fontWeight: 'bold' }}>{words[currentWordIndex]}</span>
}

function ButtonMarquee() {
  const buttons = ['b1.gif', 'b2.gif', 'b3.gif', 'b4.gif', 'b5.gif', 'b6.gif', 'b7.gif', 'b8.gif', 'b9.gif', 'b10.gif', 'b11.gif', 'b12.gif', 'b13.gif', 'b14.gif']
  
  return (
    <div style={styles.marqueeContainer}>
      <div style={styles.marqueeTrack}>
        {[...buttons, ...buttons].map((btn, i) => (
          <img key={i} src={`/${btn}`} alt="" style={styles.marqueeButton} />
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div style={styles.desktop}>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes blink {
          0% { opacity: 1; }
          50% { opacity: 0; }
          100% { opacity: 1; }
        }
        .blink {
          animation: blink 1s step-end infinite;
        }
        .side-gifs {
          display: none;
        }
        .main-wrapper {
          max-width: 900px;
          margin: 0 auto;
          position: relative;
        }
        @media (min-width: 1024px) {
          .main-wrapper {
            display: flex;
            align-items: flex-start;
            justify-content: center;
            gap: 16px;
            max-width: none;
          }
          .side-gifs {
            display: flex;
            flex-direction: column;
            gap: 8px;
            flex-shrink: 0;
            position: sticky;
            top: 16px;
          }
          .side-gif {
            width: 150px;
            height: auto;
            display: block;
            image-rendering: pixelated;
          }
          .main-window {
            max-width: 900px;
            flex: 1;
          }
        }
      `}</style>
      
      <div className="main-wrapper">
        {/* Left side gifs */}
        <div className="side-gifs side-gifs-left">
          {['s1.gif', 's6.gif', 's3.gif', 's4.gif', 's5.gif', 's2.gif'].map((gif, i) => (
            <img key={`left-${i}`} src={`/${gif}`} alt="" className="side-gif" />
          ))}
        </div>
        
        <div className="main-window" style={styles.window}>
          {/* Title Bar */}
          <div style={styles.titleBar}>
            <div style={styles.titleLeft}>
              <img src="/print.png" style={{ width: '16px', height: '16px', imageRendering: 'pixelated' }} alt="icon" />
              <span style={styles.titleText}>Memestonks.exe</span>
            </div>
            <div style={styles.titleButtons}>
              <button style={styles.titleBtn}>_</button>
              <button style={styles.titleBtn}>□</button>
              <button style={styles.titleBtn}>×</button>
            </div>
          </div>

          {/* Content */}
          <div style={styles.content}>
            {/* Hero Section */}
            <div style={styles.hero}>
              <div style={styles.heroInner}>
                <img src="/print.png" alt="Logo" style={styles.heroImage} />
                <div style={styles.heroText}>
                  <div style={styles.heading}>
                    <span className="blink" style={{color: '#ff0000', marginRight: '8px'}}>▶</span>
                    Gib your stonks value
                  </div>
                  <div style={styles.subtitle}>keep the value in our memes</div>
                  <div style={styles.supportText}>support <AnimatedWord /></div>
                </div>
              </div>
              <div style={styles.heroDivider}></div>
              <div style={styles.buttonRow}>
                <Link href="/create" style={styles.button}>[create]</Link>
                <a href="https://x.com/" target="_blank" rel="noopener noreferrer" style={styles.button}>[how it works]</a>
                <a href="https://x.com/" target="_blank" rel="noopener noreferrer" style={styles.button}>[follow]</a>
              </div>
            </div>

            {/* 88x31 Button Marquee */}
            <ButtonMarquee />

            <div style={styles.section}>
              <div style={styles.sectionHeader}>📊 Tokens</div>
              <div style={styles.sectionBody}>
                <TokensList />
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionHeader}>📈 Recent Activity</div>
              <div style={styles.sectionBody}>
                <RecentBuys />
              </div>
            </div>
          </div>

          <div style={styles.statusBar}>
            <span>Ready</span>
          </div>
        </div>
        
        {/* Right side gifs */}
        <div className="side-gifs side-gifs-right">
          {['s7.gif', 's8.gif', 's9.gif', 's10.gif', 's11.gif', 's12.gif'].map((gif, i) => (
            <img key={`right-${i}`} src={`/${gif}`} alt="" className="side-gif" />
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  desktop: {
    minHeight: '100vh',
    // Layer 1: 20% Black Overlay (rgba 0,0,0,0.2)
    // Layer 2: The tiled GIF
    // Layer 3: The fallback teal color
    background: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), 
                 url("/bg.gif") repeat, 
                 #008080`,
    
    // Controls the size (and effectively the density/perceived spacing)
    backgroundSize: 'auto, 100px 100px', 
    
    padding: '16px',
    fontFamily: '"MS Sans Serif", Tahoma, sans-serif',
    imageRendering: 'pixelated',
    
    // This ensures the background stays fixed while scrolling, 
    // which was a common "pro" look in the 90s
    backgroundAttachment: 'fixed',
  },
  window: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
    boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
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
    gap: '4px',
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
  hero: {
    marginBottom: '24px',
    padding: '4px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #808080 #808080 #fff',
  },
  heroInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '16px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#808080 #dfdfdf #dfdfdf #808080',
    boxShadow: 'inset 1px 1px 4px rgba(0,0,0,0.1)',
  },
  heroImage: {
    width: '84px',
    height: '84px',
    imageRendering: 'pixelated',
    flexShrink: 0,
  },
  heroText: {
    flex: 1,
  },
  heading: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#000080',
    marginBottom: '4px',
    textShadow: '1px 1px 0px #dfdfdf',
  },
  subtitle: {
    fontSize: '14px',
    color: '#000',
    marginBottom: '4px',
    fontWeight: 'bold',
  },
  supportText: {
    fontSize: '13px',
    color: '#444',
  },
  heroDivider: {
    height: '2px',
    backgroundColor: '#808080',
    margin: '12px 8px',
    borderBottom: '1px solid #fff',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    paddingBottom: '8px',
  },
  button: {
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#fff #000 #000 #fff',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    textDecoration: 'none',
    color: '#000',
    display: 'inline-block',
    textAlign: 'center',
  },
  marqueeContainer: {
    marginBottom: '16px',
    padding: '4px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    overflow: 'hidden',
  },
  marqueeTrack: {
    display: 'flex',
    gap: '8px',
    animation: 'marquee 20s linear infinite',
    width: 'fit-content',
  },
  marqueeButton: {
    width: '88px',
    height: '31px',
    imageRendering: 'pixelated',
    flexShrink: 0,
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
    padding: '8px',
    backgroundColor: '#c0c0c0',
    border: '2px solid',
    borderColor: '#808080 #fff #fff #808080',
    margin: '4px',
  },
  statusBar: {
    backgroundColor: '#c0c0c0',
    borderTop: '2px solid #808080',
    padding: '2px 8px',
    fontSize: '11px',
    color: '#000',
  },
}