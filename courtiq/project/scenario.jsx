// Screen 3: Scenario Engine — THE core screen

const SCENARIO = {
  id: 'help-rotation-01',
  module: 'Defensive IQ',
  number: 4,
  total: 8,
  difficulty: 'Varsity',
  timeLimit: 8,
  prompt: "You're the weak-side help defender. Ball-handler just beat his man off the dribble on the strong side.",
  question: "What do you do?",
  options: [
    { id: 'a', label: 'Stunt at the ball, recover to your man', correct: false, feedback: "Too passive — by the time you recover, the driver has a layup. Commit or don't." },
    { id: 'b', label: 'Rotate and tag the roller in the paint', correct: false, feedback: "Close, but there's no roller here — this is a drive, not a PnR. You'd leave the corner shooter wide open." },
    { id: 'c', label: 'Full low-man rotation to the rim', correct: true, feedback: "Correct. As the weak-side low man, you sprint the baseline to seal the rim. The next rotation covers your shooter.", xp: 25 },
    { id: 'd', label: 'Hold your position in the corner', correct: false, feedback: "You just gave up a layup. Help beats the three every time." },
  ],
};

// Players arranged on half court
const BASE_PLAYERS = [
  // Offense (green)
  { id: 'o1', team: 'off', x: 155, y: 290, label: '1' },  // ball handler, drove baseline
  { id: 'o2', team: 'off', x: 90,  y: 180, label: '2' },  // wing
  { id: 'o3', team: 'off', x: 440, y: 125, label: '3' },  // weak corner shooter (YOUR man)
  { id: 'o4', team: 'off', x: 380, y: 260, label: '4' },  // high post
  { id: 'o5', team: 'off', x: 250, y: 380, label: '5' },  // top
  // Defense (red) - except YOU
  { id: 'd2', team: 'def', x: 100, y: 220, label: 'x2' },
  { id: 'd4', team: 'def', x: 375, y: 300, label: 'x4' },
  { id: 'd5', team: 'def', x: 250, y: 340, label: 'x5' },
  { id: 'd1', team: 'def', x: 220, y: 280, label: 'x1', ghost: true }, // beaten
];

// YOU — weakside defender on #3
const YOU = { id: 'you', team: 'def', x: 390, y: 170, label: 'YOU', color: '#FFD447', glow: true };

function ScenarioScreen({ onComplete, onExit }) {
  const [phase, setPhase] = React.useState('prompt'); // prompt, selected, feedback, xp
  const [selected, setSelected] = React.useState(null);
  const [timeLeft, setTimeLeft] = React.useState(SCENARIO.timeLimit);
  const [showHint, setShowHint] = React.useState(false);

  // Timer
  React.useEffect(() => {
    if (phase !== 'prompt') return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft(s => s - 0.1), 100);
    return () => clearTimeout(t);
  }, [timeLeft, phase]);

  const handleSelect = (opt) => {
    if (phase !== 'prompt') return;
    setSelected(opt);
    setPhase('feedback');
  };

  const handleNext = () => {
    onComplete?.(selected?.correct);
  };

  const isCorrect = selected?.correct;

  // Build court arrows based on state
  let arrows = [];
  let flash = null;
  let players = [...BASE_PLAYERS];

  if (phase === 'prompt') {
    // Show the drive happening
    arrows.push({ from: [220, 280], to: [155, 290], color: CIQ.heat, dashed: true, sw: 2 }); // x1 beaten trail
    arrows.push({ from: [155, 290], to: [220, 90], color: '#FF8A3D', sw: 3, curve: { x: -30, y: -60 } }); // ball path
    flash = { x: 155, y: 290, color: '#FF8A3D' };
  } else if (phase === 'feedback' && selected) {
    if (selected.id === 'c') {
      arrows.push({ from: [390, 170], to: [220, 90], color: CIQ.brand, sw: 3, curve: { x: 40, y: 60 } });
      flash = { x: 220, y: 90, color: CIQ.brand };
    } else if (selected.id === 'a') {
      arrows.push({ from: [390, 170], to: [300, 200], color: CIQ.heat, sw: 2, dashed: true });
      arrows.push({ from: [300, 200], to: [390, 170], color: CIQ.heat, sw: 2, dashed: true });
      flash = { x: 220, y: 80, color: CIQ.heat };
    } else if (selected.id === 'b') {
      arrows.push({ from: [390, 170], to: [260, 150], color: CIQ.heat, sw: 2 });
      flash = { x: 440, y: 125, color: CIQ.heat };
    } else {
      flash = { x: 220, y: 80, color: CIQ.heat };
    }
  }

  return (
    <div style={{ background: CIQ.bg0, minHeight: '100%', display: 'flex', flexDirection: 'column', paddingBottom: 34 }}>
      {/* Top session bar */}
      <div style={{ padding: '54px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onExit} style={{
            width: 36, height: 36, borderRadius: 10, border: 'none',
            background: CIQ.bg1, color: CIQ.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="x" size={16} color={CIQ.textDim}/>
          </button>
          {/* Session progress dots */}
          <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
            {Array.from({ length: SCENARIO.total }).map((_, i) => {
              const done = i < SCENARIO.number - 1;
              const active = i === SCENARIO.number - 1;
              return (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: done ? CIQ.brand : active ? CIQ.text : 'rgba(255,255,255,0.08)',
                  boxShadow: active ? `0 0 8px ${CIQ.text}40` : 'none',
                }}/>
              );
            })}
          </div>
          {/* XP counter */}
          <div style={{
            padding: '6px 10px', borderRadius: 999,
            background: 'rgba(255,138,61,0.12)', border: '1px solid rgba(255,138,61,0.25)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Icon name="bolt" size={12} color={CIQ.xp}/>
            <span style={{ fontFamily: CIQ.display, fontWeight: 700, color: CIQ.xp, fontSize: 13 }}>+75</span>
          </div>
        </div>

        {/* Scenario meta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Chip color={CIQ.iq} bg="rgba(139,124,255,0.12)" border="1px solid rgba(139,124,255,0.25)">
              {SCENARIO.module}
            </Chip>
            <span style={{ fontFamily: CIQ.mono, fontSize: 11, color: CIQ.textDim }}>
              {SCENARIO.number}/{SCENARIO.total} · {SCENARIO.difficulty}
            </span>
          </div>
          {/* Timer */}
          {phase === 'prompt' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TimerRing value={timeLeft} max={SCENARIO.timeLimit}/>
              <span style={{ fontFamily: CIQ.mono, fontSize: 13, fontWeight: 700,
                color: timeLeft < 3 ? CIQ.heat : CIQ.text,
              }}>
                {timeLeft.toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Court */}
      <div style={{ padding: '6px 16px 0', position: 'relative' }}>
        <div style={{
          borderRadius: 20, overflow: 'hidden',
          border: `1px solid ${CIQ.hairline2}`,
          background: '#0E1014',
          position: 'relative',
        }}>
          <HalfCourt
            width="100%" height={260}
            players={[...players, YOU]}
            arrows={arrows}
            flash={flash}
            ball={{ x: 155, y: 290 }}
          />

          {/* Your-player label pointer */}
          <div style={{
            position: 'absolute', top: 88, right: 18,
            fontFamily: CIQ.mono, fontSize: 10, color: '#FFD447',
            letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase',
          }}>
            ← You
          </div>

          {/* Legend overlay */}
          <div style={{
            position: 'absolute', bottom: 10, left: 10,
            padding: '6px 10px', borderRadius: 8,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            display: 'flex', gap: 10,
            fontFamily: CIQ.ui, fontSize: 10, color: CIQ.textDim, fontWeight: 600,
            letterSpacing: 0.4,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Dot color={CIQ.brand}/>OFF</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Dot color={CIQ.heat}/>DEF</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Dot color="#FFD447"/>YOU</span>
          </div>

          {/* Pause hint button */}
          <button onClick={() => setShowHint(!showHint)} style={{
            position: 'absolute', top: 10, right: 10,
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,0.08)', color: CIQ.textDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <Icon name="info" size={14} color={CIQ.textDim}/>
          </button>
        </div>
      </div>

      {/* Prompt */}
      <div style={{ padding: '16px 16px 6px' }}>
        <div style={{ fontFamily: CIQ.ui, fontSize: 13, color: CIQ.textDim, lineHeight: 1.45, fontWeight: 500 }}>
          {SCENARIO.prompt}
        </div>
        <div style={{ fontFamily: CIQ.display, fontSize: 20, fontWeight: 700, color: CIQ.text, marginTop: 6, letterSpacing: -0.3, lineHeight: 1.25 }}>
          {SCENARIO.question}
        </div>
      </div>

      {/* Options */}
      <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {SCENARIO.options.map((opt, i) => (
          <OptionButton
            key={opt.id}
            option={opt}
            letter={String.fromCharCode(65 + i)}
            selected={selected?.id === opt.id}
            phase={phase}
            onClick={() => handleSelect(opt)}
          />
        ))}
      </div>

      {/* Feedback tray */}
      {phase === 'feedback' && (
        <FeedbackTray correct={isCorrect} option={selected} onNext={handleNext}/>
      )}
    </div>
  );
}

function TimerRing({ value, max }) {
  const pct = value / max;
  const dash = 2 * Math.PI * 10;
  const color = value < 3 ? CIQ.heat : value < 5 ? CIQ.xp : CIQ.brand;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5"/>
      <circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="2.5"
              strokeDasharray={`${pct * dash} ${dash}`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 100ms linear, stroke 200ms' }}/>
    </svg>
  );
}

function OptionButton({ option, letter, selected, phase, onClick }) {
  const isFeedback = phase === 'feedback';
  const correct = option.correct;
  const showCorrect = isFeedback && correct;
  const showWrong = isFeedback && selected && !correct;
  const fade = isFeedback && !selected && !correct;

  let bg = CIQ.bg1;
  let borderColor = CIQ.hairline2;
  let letterBg = CIQ.bg3;
  let letterColor = CIQ.text;

  if (showCorrect) {
    bg = 'rgba(59,227,131,0.10)';
    borderColor = CIQ.brand;
    letterBg = CIQ.brand;
    letterColor = CIQ.brandInk;
  } else if (showWrong) {
    bg = 'rgba(255,77,109,0.08)';
    borderColor = CIQ.heat;
    letterBg = CIQ.heat;
    letterColor = '#fff';
  }

  return (
    <button onClick={onClick} disabled={isFeedback} style={{
      appearance: 'none', cursor: isFeedback ? 'default' : 'pointer',
      background: bg, border: `1.5px solid ${borderColor}`,
      borderRadius: 16, padding: '14px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      textAlign: 'left',
      opacity: fade ? 0.4 : 1,
      transition: 'all 200ms',
      transform: showCorrect ? 'scale(1.01)' : 'scale(1)',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: letterBg, color: letterColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: CIQ.display, fontWeight: 700, fontSize: 15,
      }}>
        {showCorrect ? <Icon name="check" size={18} color={letterColor} strokeWidth={3}/>
          : showWrong ? <Icon name="x" size={18} color={letterColor} strokeWidth={3}/>
          : letter}
      </div>
      <span style={{
        flex: 1, fontFamily: CIQ.ui, fontSize: 14, fontWeight: 500,
        color: CIQ.text, lineHeight: 1.35, letterSpacing: -0.1,
      }}>
        {option.label}
      </span>
    </button>
  );
}

function FeedbackTray({ correct, option, onNext }) {
  return (
    <div style={{
      marginTop: 10,
      padding: '16px 16px 12px',
      background: correct ? 'rgba(59,227,131,0.06)' : 'rgba(255,77,109,0.05)',
      borderTop: `1px solid ${correct ? 'rgba(59,227,131,0.3)' : 'rgba(255,77,109,0.3)'}`,
      animation: 'ciq-slideup 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 999,
            background: correct ? CIQ.brand : CIQ.heat,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={correct ? 'check' : 'x'} size={14} color={correct ? CIQ.brandInk : '#fff'} strokeWidth={3}/>
          </div>
          <span style={{
            fontFamily: CIQ.display, fontSize: 16, fontWeight: 700,
            color: correct ? CIQ.brand : CIQ.heat, letterSpacing: -0.2,
            textTransform: 'uppercase',
          }}>
            {correct ? 'Right Read' : 'Wrong Read'}
          </span>
        </div>
        {correct && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            animation: 'ciq-pop 400ms cubic-bezier(0.2, 1.6, 0.4, 1)',
          }}>
            <Icon name="bolt" size={14} color={CIQ.xp}/>
            <span style={{ fontFamily: CIQ.display, fontWeight: 700, color: CIQ.xp, fontSize: 18, letterSpacing: -0.3 }}>
              +{option.xp || 25} XP
            </span>
          </div>
        )}
      </div>
      <div style={{
        fontFamily: CIQ.ui, fontSize: 13, color: CIQ.text, lineHeight: 1.5,
        marginBottom: 12,
      }}>
        {option.feedback}
      </div>
      <PrimaryButton onClick={onNext} icon="arrow-right">
        Next Scenario
      </PrimaryButton>
    </div>
  );
}

Object.assign(window, { ScenarioScreen });
