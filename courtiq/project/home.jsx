// Screen 1: Home Dashboard

function HomeScreen({ onStartScenario, onOpenAcademy }) {
  return (
    <div style={{ background: CIQ.bg0, minHeight: '100%', paddingBottom: 100 }}>
      {/* Top bar */}
      <div style={{ padding: '62px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: `linear-gradient(145deg, ${CIQ.bg2}, ${CIQ.bg1})`,
            border: `1px solid ${CIQ.hairline2}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: CIQ.display, fontWeight: 700, color: CIQ.brand, fontSize: 16,
          }}>MJ</div>
          <div>
            <div style={{ fontFamily: CIQ.ui, fontSize: 12, color: CIQ.textDim, letterSpacing: 0.3 }}>Good evening</div>
            <div style={{ fontFamily: CIQ.display, fontSize: 17, color: CIQ.text, fontWeight: 600 }}>Marcus</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            height: 36, padding: '0 10px', borderRadius: 999,
            background: 'rgba(255,77,109,0.12)', border: '1px solid rgba(255,77,109,0.3)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon name="flame" size={14} color={CIQ.heat}/>
            <span style={{ fontFamily: CIQ.display, fontWeight: 700, color: CIQ.heat, fontSize: 14 }}>12</span>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 999,
            background: CIQ.bg1, border: `1px solid ${CIQ.hairline2}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 14, height: 14, borderRadius: 999, background: CIQ.bg3, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 999, background: CIQ.brand, border: `1.5px solid ${CIQ.bg1}` }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Hero IQ Score */}
      <div style={{ padding: '28px 20px 0' }}>
        <Card pad={0} bg="transparent" style={{
          background: `linear-gradient(160deg, ${CIQ.bg1} 0%, #0F1622 100%)`,
          border: `1px solid ${CIQ.hairline2}`,
          overflow: 'hidden', position: 'relative',
        }}>
          {/* glow blob */}
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 220, height: 220,
            borderRadius: 999, background: `radial-gradient(circle, ${CIQ.brand}22, transparent 70%)`,
            filter: 'blur(10px)',
          }}/>
          <div style={{ padding: '20px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textDim, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>Basketball IQ</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <div style={{ fontFamily: CIQ.display, fontSize: 56, fontWeight: 700, color: CIQ.text, letterSpacing: -1.5, lineHeight: 1 }}>1,284</div>
                <Chip color={CIQ.brand} bg="rgba(59,227,131,0.1)" border="1px solid rgba(59,227,131,0.25)">
                  ↑ 48 THIS WK
                </Chip>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textDim, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>Rank</div>
              <div style={{ fontFamily: CIQ.display, fontSize: 22, fontWeight: 700, color: CIQ.text, marginTop: 4 }}>VARSITY</div>
              <div style={{ fontFamily: CIQ.mono, fontSize: 10, color: CIQ.brand }}>TIER III</div>
            </div>
          </div>
          {/* IQ sparkline */}
          <div style={{ padding: '14px 20px 0', position: 'relative' }}>
            <svg width="100%" height="52" viewBox="0 0 340 52" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CIQ.brand} stopOpacity="0.35"/>
                  <stop offset="100%" stopColor={CIQ.brand} stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M 0 40 L 30 38 L 60 42 L 90 30 L 120 32 L 150 28 L 180 22 L 210 24 L 240 16 L 270 20 L 300 10 L 340 6 L 340 52 L 0 52 Z" fill="url(#sparkFill)"/>
              <path d="M 0 40 L 30 38 L 60 42 L 90 30 L 120 32 L 150 28 L 180 22 L 210 24 L 240 16 L 270 20 L 300 10 L 340 6" fill="none" stroke={CIQ.brand} strokeWidth="2"/>
              <circle cx="340" cy="6" r="4" fill={CIQ.brand}/>
              <circle cx="340" cy="6" r="8" fill={CIQ.brand} opacity="0.2"/>
            </svg>
          </div>
          {/* stats row */}
          <div style={{ padding: '12px 20px 20px', display: 'flex', gap: 12, position: 'relative' }}>
            <MiniStat label="Decision %" value="78" suffix="%" color={CIQ.brand}/>
            <div style={{ width: 1, background: CIQ.hairline }}/>
            <MiniStat label="Reaction" value="1.42" suffix="s" color={CIQ.iq}/>
            <div style={{ width: 1, background: CIQ.hairline }}/>
            <MiniStat label="Reps" value="2,184" color={CIQ.xp}/>
          </div>
        </Card>
      </div>

      {/* Continue training — huge CTA card */}
      <div style={{ padding: '14px 20px 0' }}>
        <Card pad={0} bg={CIQ.bg1} style={{ overflow: 'hidden', borderColor: CIQ.hairline2 }} interactive onClick={onStartScenario}>
          <div style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{
              width: 70, height: 70, borderRadius: 18, flexShrink: 0,
              background: `linear-gradient(145deg, ${CIQ.bg2}, ${CIQ.bg0})`,
              border: `1px solid ${CIQ.hairline2}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              <HalfCourt width={56} height={52}/>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)', borderRadius: 18 }}/>
              <div style={{ position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: 999, background: CIQ.brand, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="play" size={10} color={CIQ.brandInk}/>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Chip color={CIQ.brand} bg="rgba(59,227,131,0.1)" style={{ marginBottom: 6 }}>Continue</Chip>
              <div style={{ fontFamily: CIQ.display, fontSize: 17, fontWeight: 600, color: CIQ.text, letterSpacing: -0.2 }}>
                Weakside Help Rotations
              </div>
              <div style={{ fontFamily: CIQ.ui, fontSize: 13, color: CIQ.textDim, marginTop: 2 }}>
                Lesson 4 of 8 · 6 min left
              </div>
            </div>
          </div>
          <div style={{ padding: '0 18px 16px' }}>
            <Progress value={52} color={CIQ.brand} height={4}/>
          </div>
        </Card>
      </div>

      {/* Daily Challenge */}
      <div style={{ padding: '14px 20px 0' }}>
        <Card pad={0} bg="transparent" style={{
          background: `linear-gradient(135deg, rgba(255,138,61,0.08), rgba(255,77,109,0.04))`,
          border: '1px solid rgba(255,138,61,0.25)',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: -20, right: -20, width: 120, height: 120,
            borderRadius: 999, background: 'radial-gradient(circle, rgba(255,138,61,0.15), transparent 70%)',
          }}/>
          <div style={{ padding: 18, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="bolt" size={18} color={CIQ.xp}/>
                <span style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.xp, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
                  Daily Challenge
                </span>
              </div>
              <div style={{
                fontFamily: CIQ.mono, fontSize: 11, color: CIQ.xp, fontWeight: 600,
                padding: '3px 8px', borderRadius: 6, background: 'rgba(255,138,61,0.12)',
              }}>04:12:38</div>
            </div>
            <div style={{ fontFamily: CIQ.display, fontSize: 20, fontWeight: 600, color: CIQ.text, marginTop: 10, lineHeight: 1.2, letterSpacing: -0.3 }}>
              Read 5 pick-and-roll coverages in a row
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 1, 1, 0, 0].map((done, i) => (
                  <div key={i} style={{
                    width: 28, height: 6, borderRadius: 2,
                    background: done ? CIQ.xp : 'rgba(255,255,255,0.08)',
                  }}/>
                ))}
              </div>
              <div style={{ flex: 1 }}/>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: CIQ.display, fontWeight: 700, color: CIQ.xp, fontSize: 16 }}>+120</span>
                <span style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.xp, letterSpacing: 1, fontWeight: 600 }}>XP</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Today's training — 2 stat cards */}
      <div style={{ padding: '14px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Icon name="eye" size={14} color={CIQ.iq}/>
            <span style={{ fontFamily: CIQ.ui, fontSize: 10, color: CIQ.textDim, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600 }}>Recognition</span>
          </div>
          <div style={{ fontFamily: CIQ.display, fontSize: 28, fontWeight: 700, color: CIQ.text, letterSpacing: -0.5 }}>
            1.42<span style={{ fontSize: 14, color: CIQ.textDim, fontWeight: 500 }}>s</span>
          </div>
          <div style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.brand, marginTop: 2, fontWeight: 600 }}>
            −0.18s this week
          </div>
        </Card>
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Icon name="target" size={14} color={CIQ.brand}/>
            <span style={{ fontFamily: CIQ.ui, fontSize: 10, color: CIQ.textDim, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600 }}>Accuracy</span>
          </div>
          <div style={{ fontFamily: CIQ.display, fontSize: 28, fontWeight: 700, color: CIQ.text, letterSpacing: -0.5 }}>
            78<span style={{ fontSize: 14, color: CIQ.textDim, fontWeight: 500 }}>%</span>
          </div>
          <div style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.brand, marginTop: 2, fontWeight: 600 }}>
            +6% this week
          </div>
        </Card>
      </div>

      {/* Recommended */}
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: CIQ.display, fontSize: 15, fontWeight: 600, color: CIQ.text, letterSpacing: -0.1 }}>For You</span>
          <span style={{ fontFamily: CIQ.ui, fontSize: 13, color: CIQ.textDim }}>Coach AI</span>
        </div>
        <Card pad={0} interactive onClick={onOpenAcademy} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex' }}>
            <div style={{
              width: 96, background: `linear-gradient(160deg, #1a2533, #0E1014)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRight: `1px solid ${CIQ.hairline}`,
            }}>
              <Icon name="shield" size={32} color={CIQ.iq}/>
            </div>
            <div style={{ flex: 1, padding: '14px 14px 14px 14px' }}>
              <Chip color={CIQ.iq} bg="rgba(139,124,255,0.1)" style={{ marginBottom: 6 }}>Defensive IQ</Chip>
              <div style={{ fontFamily: CIQ.display, fontSize: 15, fontWeight: 600, color: CIQ.text }}>
                Low-man Rotations
              </div>
              <div style={{ fontFamily: CIQ.ui, fontSize: 12, color: CIQ.textDim, marginTop: 3 }}>
                Why: you scored 61% on helpside reads
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingRight: 14 }}>
              <Icon name="chevron-right" size={18} color={CIQ.textMute}/>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MiniStat({ label, value, suffix, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: CIQ.ui, fontSize: 10, color: CIQ.textDim, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: CIQ.display, fontSize: 20, fontWeight: 700, color: CIQ.text, letterSpacing: -0.3, marginTop: 2 }}>
        {value}{suffix && <span style={{ fontSize: 12, color, fontWeight: 600 }}>{suffix}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen });
