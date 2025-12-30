import React, { useState } from 'react';

const OdintsovLiveBrand = () => {
  const [theme, setTheme] = useState('light');
  
  const themes = {
    light: {
      bg: '#F8F6F3',
      bgSecondary: '#FFFFFF',
      text: '#1A1A1A',
      textSecondary: '#6B6B6B',
      accent: '#C4A77D',
      accentHover: '#B8956A',
      border: '#E8E4DE',
      cardBg: '#FFFFFF',
      shadowColor: 'rgba(0,0,0,0.06)'
    },
    dark: {
      bg: '#0F0F0F',
      bgSecondary: '#1A1A1A',
      text: '#F5F5F5',
      textSecondary: '#8A8A8A',
      accent: '#C4A77D',
      accentHover: '#D4B78D',
      border: '#2A2A2A',
      cardBg: '#1A1A1A',
      shadowColor: 'rgba(0,0,0,0.4)'
    }
  };
  
  const t = themes[theme];
  
  const Logo = ({ size = 80, showText = true }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.2 }}>
      <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
        {/* Внешний круг O */}
        <circle cx="40" cy="40" r="38" stroke={t.accent} strokeWidth="2" fill="none" />
        {/* Внутренняя L */}
        <path 
          d="M28 24V56H52" 
          stroke={t.text} 
          strokeWidth="3" 
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Точка акцента */}
        <circle cx="52" cy="56" r="4" fill={t.accent} />
      </svg>
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ 
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: size * 0.35,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: t.text,
            lineHeight: 1
          }}>
            Odintsov
          </span>
          <span style={{ 
            fontFamily: "'DM Sans', sans-serif",
            fontSize: size * 0.18,
            fontWeight: 400,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.accent,
            marginTop: 4
          }}>
            Live
          </span>
        </div>
      )}
    </div>
  );
  
  const ColorSwatch = ({ color, name, hex }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        width: 100,
        height: 100,
        backgroundColor: color,
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        boxShadow: `0 4px 20px ${t.shadowColor}`
      }} />
      <span style={{ 
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: t.text 
      }}>{name}</span>
      <span style={{ 
        fontFamily: "'DM Mono', monospace",
        fontSize: 11,
        color: t.textSecondary 
      }}>{hex}</span>
    </div>
  );
  
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: t.bg,
      fontFamily: "'DM Sans', sans-serif",
      padding: 40,
      transition: 'all 0.4s ease'
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      
      {/* Theme Toggle */}
      <div style={{
        position: 'fixed',
        top: 24,
        right: 24,
        display: 'flex',
        gap: 8,
        backgroundColor: t.bgSecondary,
        padding: 6,
        borderRadius: 30,
        border: `1px solid ${t.border}`
      }}>
        {['light', 'dark'].map(th => (
          <button
            key={th}
            onClick={() => setTheme(th)}
            style={{
              padding: '10px 20px',
              borderRadius: 24,
              border: 'none',
              backgroundColor: theme === th ? t.accent : 'transparent',
              color: theme === th ? '#1A1A1A' : t.textSecondary,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            {th === 'light' ? '☀ Light' : '◐ Dark'}
          </button>
        ))}
      </div>
      
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ 
          textAlign: 'center', 
          marginBottom: 80,
          paddingTop: 40
        }}>
          <span style={{ 
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.accent
          }}>
            Brand Guidelines
          </span>
          <h1 style={{ 
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 56,
            fontWeight: 400,
            color: t.text,
            margin: '16px 0 0',
            letterSpacing: '-0.02em'
          }}>
            Odintsov_Live
          </h1>
        </header>
        
        {/* Logo Section */}
        <section style={{ marginBottom: 80 }}>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.textSecondary,
            marginBottom: 32
          }}>
            01 — Logo
          </h2>
          
          <div style={{
            backgroundColor: t.cardBg,
            borderRadius: 24,
            padding: 60,
            border: `1px solid ${t.border}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 60
          }}>
            {/* Main Logo */}
            <Logo size={100} />
            
            {/* Logo Variations */}
            <div style={{ 
              display: 'flex', 
              gap: 60, 
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <div style={{ textAlign: 'center' }}>
                <Logo size={60} showText={false} />
                <p style={{ 
                  fontSize: 11, 
                  color: t.textSecondary, 
                  marginTop: 16,
                  letterSpacing: '0.1em'
                }}>Icon Only</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <Logo size={50} />
                <p style={{ 
                  fontSize: 11, 
                  color: t.textSecondary, 
                  marginTop: 16,
                  letterSpacing: '0.1em'
                }}>Small</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Colors Section */}
        <section style={{ marginBottom: 80 }}>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.textSecondary,
            marginBottom: 32
          }}>
            02 — Color Palette — {theme === 'light' ? 'Light Theme' : 'Dark Theme'}
          </h2>
          
          <div style={{
            backgroundColor: t.cardBg,
            borderRadius: 24,
            padding: 48,
            border: `1px solid ${t.border}`
          }}>
            <div style={{ 
              display: 'flex', 
              gap: 32, 
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <ColorSwatch color={t.bg} name="Background" hex={t.bg} />
              <ColorSwatch color={t.cardBg} name="Surface" hex={t.cardBg} />
              <ColorSwatch color={t.text} name="Primary Text" hex={t.text} />
              <ColorSwatch color={t.textSecondary} name="Secondary Text" hex={t.textSecondary} />
              <ColorSwatch color={t.accent} name="Accent Gold" hex={t.accent} />
              <ColorSwatch color={t.border} name="Border" hex={t.border} />
            </div>
          </div>
        </section>
        
        {/* Typography Section */}
        <section style={{ marginBottom: 80 }}>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.textSecondary,
            marginBottom: 32
          }}>
            03 — Typography
          </h2>
          
          <div style={{
            backgroundColor: t.cardBg,
            borderRadius: 24,
            padding: 48,
            border: `1px solid ${t.border}`
          }}>
            <div style={{ marginBottom: 40 }}>
              <span style={{ 
                fontSize: 11, 
                color: t.accent,
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>Headlines</span>
              <h3 style={{ 
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 48,
                fontWeight: 400,
                color: t.text,
                margin: '12px 0 4px',
                letterSpacing: '-0.02em'
              }}>
                Cormorant Garamond
              </h3>
              <p style={{ 
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: t.textSecondary 
              }}>
                Light 300 / Regular 400 / Medium 500 / SemiBold 600
              </p>
            </div>
            
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 40 }}>
              <span style={{ 
                fontSize: 11, 
                color: t.accent,
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>Body & UI</span>
              <h3 style={{ 
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 32,
                fontWeight: 400,
                color: t.text,
                margin: '12px 0 4px'
              }}>
                DM Sans
              </h3>
              <p style={{ 
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: t.textSecondary 
              }}>
                Light 300 / Regular 400 / Medium 500 / SemiBold 600
              </p>
            </div>
            
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 40, marginTop: 40 }}>
              <span style={{ 
                fontSize: 11, 
                color: t.accent,
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>Monospace</span>
              <h3 style={{ 
                fontFamily: "'DM Mono', monospace",
                fontSize: 24,
                fontWeight: 400,
                color: t.text,
                margin: '12px 0 4px'
              }}>
                DM Mono
              </h3>
              <p style={{ 
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: t.textSecondary 
              }}>
                For code & technical details
              </p>
            </div>
          </div>
        </section>
        
        {/* UI Elements Section */}
        <section style={{ marginBottom: 80 }}>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.textSecondary,
            marginBottom: 32
          }}>
            04 — UI Elements
          </h2>
          
          <div style={{
            backgroundColor: t.cardBg,
            borderRadius: 24,
            padding: 48,
            border: `1px solid ${t.border}`
          }}>
            {/* Buttons */}
            <div style={{ marginBottom: 48 }}>
              <span style={{ 
                fontSize: 11, 
                color: t.accent,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 20
              }}>Buttons</span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <button style={{
                  padding: '14px 32px',
                  backgroundColor: t.accent,
                  color: '#1A1A1A',
                  border: 'none',
                  borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  letterSpacing: '0.02em'
                }}>
                  Primary Action
                </button>
                <button style={{
                  padding: '14px 32px',
                  backgroundColor: 'transparent',
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  letterSpacing: '0.02em'
                }}>
                  Secondary
                </button>
                <button style={{
                  padding: '14px 32px',
                  backgroundColor: 'transparent',
                  color: t.accent,
                  border: 'none',
                  borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  textDecoration: 'underline',
                  textUnderlineOffset: 4
                }}>
                  Text Link →
                </button>
              </div>
            </div>
            
            {/* Cards */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 48 }}>
              <span style={{ 
                fontSize: 11, 
                color: t.accent,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 20
              }}>Card Component</span>
              <div style={{
                backgroundColor: t.bg,
                borderRadius: 16,
                padding: 32,
                border: `1px solid ${t.border}`,
                maxWidth: 360
              }}>
                <div style={{
                  width: '100%',
                  height: 180,
                  backgroundColor: t.border,
                  borderRadius: 12,
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Logo size={50} showText={false} />
                </div>
                <span style={{ 
                  fontSize: 11, 
                  color: t.accent,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase'
                }}>Article</span>
                <h4 style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 24,
                  fontWeight: 500,
                  color: t.text,
                  margin: '8px 0',
                  letterSpacing: '-0.01em'
                }}>
                  Design Principles for the Modern Web
                </h4>
                <p style={{
                  fontSize: 14,
                  color: t.textSecondary,
                  lineHeight: 1.6,
                  margin: 0
                }}>
                  Exploring minimalism, functionality, and the art of restraint in digital design.
                </p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Footer Preview */}
        <section>
          <h2 style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: t.textSecondary,
            marginBottom: 32
          }}>
            05 — Portal Preview
          </h2>
          
          <div style={{
            backgroundColor: t.cardBg,
            borderRadius: 24,
            overflow: 'hidden',
            border: `1px solid ${t.border}`
          }}>
            {/* Nav Preview */}
            <nav style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 40px',
              borderBottom: `1px solid ${t.border}`
            }}>
              <Logo size={40} />
              <div style={{ display: 'flex', gap: 32 }}>
                {['Home', 'Projects', 'Blog', 'Contact'].map(item => (
                  <a key={item} style={{
                    fontSize: 14,
                    color: t.textSecondary,
                    textDecoration: 'none',
                    fontWeight: 400,
                    cursor: 'pointer'
                  }}>
                    {item}
                  </a>
                ))}
              </div>
            </nav>
            
            {/* Hero Preview */}
            <div style={{
              padding: '80px 40px',
              textAlign: 'center'
            }}>
              <span style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: `${t.accent}15`,
                color: t.accent,
                borderRadius: 20,
                fontSize: 12,
                letterSpacing: '0.1em',
                marginBottom: 24
              }}>
                Welcome to my portal
              </span>
              <h2 style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 52,
                fontWeight: 400,
                color: t.text,
                margin: '0 0 20px',
                letterSpacing: '-0.02em',
                lineHeight: 1.1
              }}>
                Ideas, Projects &<br />Digital Experiences
              </h2>
              <p style={{
                fontSize: 16,
                color: t.textSecondary,
                maxWidth: 480,
                margin: '0 auto 32px',
                lineHeight: 1.7
              }}>
                Personal space for sharing thoughts, showcasing work, and connecting with like-minded creators.
              </p>
              <button style={{
                padding: '16px 40px',
                backgroundColor: t.accent,
                color: '#1A1A1A',
                border: 'none',
                borderRadius: 8,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                letterSpacing: '0.02em'
              }}>
                Explore →
              </button>
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          padding: '60px 0 20px',
          color: t.textSecondary,
          fontSize: 12
        }}>
          <Logo size={40} showText={false} />
          <p style={{ marginTop: 20 }}>
            Odintsov_Live Brand Guidelines • 2025
          </p>
        </footer>
      </div>
    </div>
  );
};

export default OdintsovLiveBrand;
