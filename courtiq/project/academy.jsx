// Screen 2: Academy / Course Map

const MODULES = [
  {
    id: 'awareness',
    title: 'Court Awareness',
    subtitle: 'See the floor before it happens',
    icon: 'eye',
    color: '#5AC8FF',
    progress: 100,
    lessons: 8,
    completed: 8,
    status: 'mastered',
    side: 'left',
  },
  {
    id: 'offball',
    title: 'Off-Ball IQ',
    subtitle: 'Cuts, relocation, spacing',
    icon: 'compass',
    color: '#3BE383',
    progress: 62,
    lessons: 12,
    completed: 7,
    status: 'active',
    active: true,
    side: 'right',
  },
  {
    id: 'defense',
    title: 'Defensive IQ',
    subtitle: 'Help, recover, rotate',
    icon: 'shield',
    color: '#8B7CFF',
    progress: 28,
    lessons: 10,
    completed: 3,
    status: 'unlocked',
    side: 'left',
  },
  {
    id: 'transition',
    title: 'Transition IQ',
    subtitle: 'Break decisions, timing',
    icon: 'zap',
    color: '#FF8A3D',
    progress: 0,
    lessons: 9,
    completed: 0,
    status: 'locked',
    requires: 'Off-Ball IQ 80%',
    side: 'right',
  },
  {
    id: 'decisions',
    title: 'Smart Decisions',
    subtitle: 'Reads under pressure',
    icon: 'brain',
    color: '#FF4D6D',
    progress: 0,
    lessons: 14,
    completed: 0,
    status: 'locked',
    requires: 'All above · Final Exam',
    side: 'left',
    capstone: true,
  },
];

function AcademyScreen({ onStartLesson }) {
  return (
    <div style={{ background: CIQ.bg0, minHeight: '100%', paddingBottom: 100 }}>
      {/* Top bar */}
      <div style={{ padding: '62px 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textDim, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>Your Path</div>
          <div style={{ fontFamily: CIQ.display, fontSize: 28, fontWeight: 700, color: CIQ.text, letterSpacing: -0.6 }}>The Academy</div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 999,
          background: CIQ.bg1, border: `1px solid ${CIQ.hairline2}`,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="trophy" size={14} color={CIQ.xp}/>
          <span style={{ fontFamily: CIQ.display, fontWeight: 700, color: CIQ.text, fontSize: 13 }}>18</span>
          <span style={{ fontFamily: CIQ.ui, color: CIQ.textDim, fontSize: 12 }}>/ 53</span>
        </div>
      </div>

      {/* Overall progress strip */}
      <div style={{ padding: '4px 20px 18px' }}>
        <Card pad={14}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: CIQ.ui, fontSize: 12, color: CIQ.textDim, fontWeight: 500 }}>Season Progress</span>
            <span style={{ fontFamily: CIQ.display, fontSize: 14, color: CIQ.text, fontWeight: 700 }}>
              34<span style={{ color: CIQ.textDim, fontWeight: 500 }}>%</span>
            </span>
          </div>
          <Progress value={34} color={CIQ.brand} height={6} glow/>
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textDim }}>
            <span><Dot color={CIQ.brand}/> &nbsp;Active</span>
            <span><Dot color={CIQ.iq}/> &nbsp;Unlocked</span>
            <span><Dot color={CIQ.textMute}/> &nbsp;Locked</span>
          </div>
        </Card>
      </div>

      {/* Path */}
      <div style={{ padding: '0 20px', position: 'relative' }}>
        {/* SVG connector line running down the middle */}
        <svg width="100%" height={MODULES.length * 140 + 60} style={{ position: 'absolute', top: 20, left: 0, pointerEvents: 'none' }}>
          <defs>
            <linearGradient id="pathGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CIQ.brand} stopOpacity="0.7"/>
              <stop offset="50%" stopColor={CIQ.iq} stopOpacity="0.4"/>
              <stop offset="100%" stopColor={CIQ.textMute} stopOpacity="0.2"/>
            </linearGradient>
          </defs>
          <path d={buildPath(MODULES.length)} fill="none" stroke="url(#pathGrad)" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round"/>
        </svg>

        {/* Module nodes */}
        <div style={{ position: 'relative', paddingTop: 12 }}>
          {MODULES.map((m, i) => (
            <ModuleNode key={m.id} module={m} index={i} onClick={() => m.status !== 'locked' && onStartLesson?.(m)}/>
          ))}
        </div>
      </div>

      {/* Footer motivation */}
      <div style={{ padding: '10px 20px 0' }}>
        <div style={{
          textAlign: 'center', padding: '20px 16px',
          fontFamily: CIQ.display, fontSize: 14, color: CIQ.textDim, fontStyle: 'italic', fontWeight: 500,
        }}>
          “The game slows down when the mind speeds up.”
        </div>
      </div>
    </div>
  );
}

function buildPath(n) {
  // zig-zag path connecting node centers
  const startX = 56, startY = 36;
  const rowH = 140;
  let d = `M ${startX} ${startY}`;
  for (let i = 1; i < n; i++) {
    const toX = i % 2 === 0 ? startX : 300;
    const toY = startY + i * rowH;
    const ctrlY = toY - rowH / 2;
    d += ` C ${i % 2 === 0 ? 100 : 260} ${ctrlY}, ${i % 2 === 0 ? 200 : 140} ${ctrlY + 30}, ${toX} ${toY}`;
  }
  return d;
}

function ModuleNode({ module: m, index, onClick }) {
  const locked = m.status === 'locked';
  const mastered = m.status === 'mastered';
  const active = m.active;
  const isLeft = m.side === 'left';

  return (
    <div onClick={!locked ? onClick : undefined} style={{
      position: 'relative', height: 140,
      display: 'flex', alignItems: 'center',
      flexDirection: isLeft ? 'row' : 'row-reverse',
      cursor: !locked ? 'pointer' : 'default',
    }}>
      {/* node circle */}
      <div style={{
        width: 72, height: 72, borderRadius: 24, flexShrink: 0,
        background: locked ? CIQ.bg1 : `linear-gradient(145deg, ${m.color}30, ${CIQ.bg1})`,
        border: locked ? `1px dashed ${CIQ.hairline2}` : `1.5px solid ${m.color}60`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        boxShadow: active ? `0 0 0 4px ${m.color}15, 0 0 24px ${m.color}30` : 'none',
      }}>
        {active && (
          <div style={{
            position: 'absolute', inset: -6, borderRadius: 28,
            border: `2px solid ${m.color}`, animation: 'ciq-pulse 2s ease-out infinite',
          }}/>
        )}
        <Icon name={locked ? 'lock' : m.icon} size={28} color={locked ? CIQ.textMute : m.color} strokeWidth={2}/>
        {mastered && (
          <div style={{
            position: 'absolute', top: -4, right: -4, width: 24, height: 24, borderRadius: 999,
            background: CIQ.brand, border: `2px solid ${CIQ.bg0}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={14} color={CIQ.brandInk} strokeWidth={3}/>
          </div>
        )}
        {/* Progress ring */}
        {!locked && !mastered && (
          <svg width="84" height="84" style={{ position: 'absolute', top: -6, left: -6, transform: 'rotate(-90deg)' }}>
            <circle cx="42" cy="42" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2"/>
            <circle cx="42" cy="42" r="38" fill="none" stroke={m.color} strokeWidth="2.5"
                    strokeDasharray={`${(m.progress / 100) * 238.76} 238.76`} strokeLinecap="round"/>
          </svg>
        )}
      </div>

      {/* info card */}
      <div style={{
        flex: 1, marginLeft: isLeft ? 14 : 0, marginRight: isLeft ? 0 : 14,
        padding: '12px 14px', borderRadius: 16,
        background: locked ? 'transparent' : CIQ.bg1,
        border: `1px solid ${locked ? 'transparent' : CIQ.hairline}`,
        opacity: locked ? 0.55 : 1,
        textAlign: isLeft ? 'left' : 'right',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
          <span style={{ fontFamily: CIQ.mono, fontSize: 10, color: m.color, fontWeight: 600, letterSpacing: 0.5 }}>
            MODULE {String(index + 1).padStart(2, '0')}
          </span>
          {m.capstone && <Chip color={CIQ.xp} bg="rgba(255,138,61,0.12)">CAPSTONE</Chip>}
          {active && <Chip color={CIQ.brand} bg="rgba(59,227,131,0.12)">● Active</Chip>}
        </div>
        <div style={{ fontFamily: CIQ.display, fontSize: 17, fontWeight: 700, color: CIQ.text, marginTop: 3, letterSpacing: -0.2 }}>
          {m.title}
        </div>
        <div style={{ fontFamily: CIQ.ui, fontSize: 12, color: CIQ.textDim, marginTop: 2 }}>
          {m.subtitle}
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, justifyContent: isLeft ? 'flex-start' : 'flex-end' }}>
          {locked ? (
            <span style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textMute, fontWeight: 500 }}>
              Unlock: {m.requires}
            </span>
          ) : (
            <>
              <span style={{ fontFamily: CIQ.display, fontSize: 13, fontWeight: 700, color: CIQ.text }}>
                {m.completed}<span style={{ color: CIQ.textDim, fontWeight: 500 }}>/{m.lessons}</span>
              </span>
              <span style={{ fontFamily: CIQ.ui, fontSize: 11, color: CIQ.textDim }}>lessons</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AcademyScreen });
