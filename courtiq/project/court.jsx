// Half-court SVG diagram. Top-down view, standard NBA proportions (simplified).
// Viewbox 0..500 wide, 0..470 tall. Basket at top center (250, 40).

function HalfCourt({
  width = 340, height = 320,
  players = [], // {id, team: 'off'|'def', x, y, label, highlight, ghost, glow}
  ball = null,  // {x, y}
  arrows = [],  // {from:[x,y], to:[x,y], color, dashed, curve}
  zones = [],   // {d, fill, stroke}
  flash = null, // {x, y, color}
  bg = '#0E1014',
  lineColor = 'rgba(255,255,255,0.55)',
}) {
  const VB_W = 500, VB_H = 470;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="courtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14171E"/>
          <stop offset="100%" stopColor="#0A0B0E"/>
        </linearGradient>
        <radialGradient id="hoopGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(255,138,61,0.35)"/>
          <stop offset="100%" stopColor="rgba(255,138,61,0)"/>
        </radialGradient>
        <pattern id="woodGrain" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="url(#courtGrad)"/>
          <line x1="0" y1="7" x2="14" y2="7" stroke="rgba(255,255,255,0.015)" strokeWidth="1"/>
        </pattern>
      </defs>

      {/* court surface */}
      <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#woodGrain)"/>

      {/* Custom zones (highlight areas) */}
      {zones.map((z, i) => (
        <path key={i} d={z.d} fill={z.fill || 'none'} stroke={z.stroke || 'none'}
              strokeWidth={z.sw || 2} strokeDasharray={z.dash || 0}/>
      ))}

      {/* outer boundary */}
      <rect x="20" y="20" width={VB_W - 40} height={VB_H - 40} fill="none"
            stroke={lineColor} strokeWidth="2.5"/>

      {/* three point line — arc from baseline corners to above top of key */}
      {/* corners at x=58/442, baseline y=20, corner 3 ends at y=160 then arc to center */}
      <path d="M 58 20 L 58 160 A 220 220 0 0 0 442 160 L 442 20"
            fill="none" stroke={lineColor} strokeWidth="2.5"/>

      {/* paint (lane) — key is 160 wide, 190 tall */}
      <rect x="170" y="20" width="160" height="190" fill="rgba(59,227,131,0.04)"
            stroke={lineColor} strokeWidth="2.5"/>

      {/* free throw arc */}
      <path d="M 170 210 A 80 80 0 0 0 330 210" fill="none" stroke={lineColor} strokeWidth="2.5"/>
      <path d="M 170 210 A 80 80 0 0 1 330 210" fill="none" stroke={lineColor} strokeWidth="1.5" strokeDasharray="6 6"/>

      {/* restricted area */}
      <path d="M 210 50 A 40 40 0 0 0 290 50" fill="none" stroke={lineColor} strokeWidth="1.5"/>

      {/* backboard + rim */}
      <line x1="222" y1="40" x2="278" y2="40" stroke={lineColor} strokeWidth="3"/>
      <circle cx="250" cy="52" r="10" fill="none" stroke="#FF8A3D" strokeWidth="2"/>

      {/* half court line (bottom edge of viewable half) */}
      <line x1="20" y1={VB_H - 20} x2={VB_W - 20} y2={VB_H - 20} stroke={lineColor} strokeWidth="2.5"/>
      <circle cx="250" cy={VB_H - 20} r="60" fill="none" stroke={lineColor} strokeWidth="2" strokeDasharray="4 4"/>

      {/* hash marks along lane */}
      {[70, 110, 150].map(y => (
        <g key={y}>
          <line x1="165" y1={y} x2="175" y2={y} stroke={lineColor} strokeWidth="2"/>
          <line x1="325" y1={y} x2="335" y2={y} stroke={lineColor} strokeWidth="2"/>
        </g>
      ))}

      {/* Arrows — movement paths */}
      {arrows.map((a, i) => (
        <ArrowPath key={i} {...a}/>
      ))}

      {/* Flash ring */}
      {flash && (
        <circle cx={flash.x} cy={flash.y} r="30" fill="none" stroke={flash.color || '#3BE383'}
                strokeWidth="2" opacity="0.6">
          <animate attributeName="r" from="22" to="40" dur="1.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.8" to="0" dur="1.2s" repeatCount="indefinite"/>
        </circle>
      )}

      {/* Players */}
      {players.map(p => <Player key={p.id} {...p}/>)}

      {/* Ball */}
      {ball && (
        <g transform={`translate(${ball.x} ${ball.y})`}>
          <circle r="9" fill="#FF8A3D" stroke="#2A1206" strokeWidth="1.5"/>
          <path d="M -8 0 A 8 8 0 0 1 8 0 M 0 -8 A 8 8 0 0 1 0 8" stroke="#2A1206" strokeWidth="1" fill="none"/>
        </g>
      )}
    </svg>
  );
}

function Player({ team, x, y, label, highlight, ghost, glow, color }) {
  const offFill = color || '#3BE383';
  const defFill = color || '#FF4D6D';
  const fill = team === 'off' ? offFill : defFill;
  const ink = team === 'off' ? '#021810' : '#fff';
  return (
    <g transform={`translate(${x} ${y})`} opacity={ghost ? 0.35 : 1}>
      {glow && (
        <circle r="26" fill={fill} opacity="0.2">
          <animate attributeName="r" from="20" to="32" dur="1.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite"/>
        </circle>
      )}
      {highlight && (
        <circle r="20" fill="none" stroke={fill} strokeWidth="2" strokeDasharray="3 3">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite"/>
        </circle>
      )}
      <circle r="15" fill={fill} stroke={ghost ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.4)'} strokeWidth="1.5"
              strokeDasharray={ghost ? '3 3' : 0}/>
      <text y="5" textAnchor="middle" fontFamily="'Space Grotesk', sans-serif" fontWeight="700"
            fontSize="14" fill={ink}>{label}</text>
    </g>
  );
}

function ArrowPath({ from, to, color = '#3BE383', dashed, curve, sw = 2.5 }) {
  const id = `arrow-${Math.random().toString(36).slice(2, 8)}`;
  let d;
  if (curve) {
    const mx = (from[0] + to[0]) / 2 + (curve.x || 0);
    const my = (from[1] + to[1]) / 2 + (curve.y || 0);
    d = `M ${from[0]} ${from[1]} Q ${mx} ${my} ${to[0]} ${to[1]}`;
  } else {
    d = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`;
  }
  return (
    <g>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color}/>
        </marker>
      </defs>
      <path d={d} fill="none" stroke={color} strokeWidth={sw}
            strokeDasharray={dashed ? '6 5' : 0}
            strokeLinecap="round" markerEnd={`url(#${id})`}/>
    </g>
  );
}

Object.assign(window, { HalfCourt });
