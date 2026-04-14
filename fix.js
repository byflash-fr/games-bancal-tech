const fs = require('fs');
let c = fs.readFileSync('public/js/renderer.js', 'utf8');
c = c.replace(/if \(state.status !== 'playing'\) \{/, "if (state.status === 'lobby' || state.status === 'victory' || state.status === 'defeat') {");
fs.writeFileSync('public/js/renderer.js', c);
