const PositionalTendencies = {
    'CB': { shoot: 0.50, dribble: 0.50, pass: 1.00, forwardPass: 0.80, cross: 0.50, clearance: 1.30 },
    'LB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10 },
    'RB': { shoot: 0.60, dribble: 0.80, pass: 1.00, forwardPass: 0.90, cross: 1.30, clearance: 1.10 },
    'DM': { shoot: 0.70, dribble: 0.70, pass: 1.30, forwardPass: 1.10, cross: 0.50, clearance: 1.10 },
    'CM': { shoot: 0.80, dribble: 0.90, pass: 1.20, forwardPass: 1.20, cross: 0.80, clearance: 0.90 },
    'LM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80 },
    'RM': { shoot: 0.80, dribble: 1.10, pass: 1.10, forwardPass: 1.10, cross: 1.30, clearance: 0.80 },
    'AM': { shoot: 1.00, dribble: 1.10, pass: 1.10, forwardPass: 1.40, cross: 0.90, clearance: 0.50 },
    'LW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40 },
    'RW': { shoot: 1.10, dribble: 1.30, pass: 0.90, forwardPass: 1.00, cross: 1.40, clearance: 0.40 },
    'CF': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30 },
    'ST': { shoot: 1.40, dribble: 1.10, pass: 0.70, forwardPass: 0.80, cross: 0.50, clearance: 0.30 },
    'GK': { shoot: 0.10, dribble: 0.10, pass: 1.00, forwardPass: 1.00, cross: 0.10, clearance: 1.50 }
};

function getPositionalTendency(pos, action) {
    const t = PositionalTendencies[pos];
    if (t && typeof t[action] === 'number') return t[action];
    return 1.0;
}
console.log(getPositionalTendency('CF', 'shoot'));
