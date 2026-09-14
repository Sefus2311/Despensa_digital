const { execSync } = require('child_process');
const os = require('os');

const hostname = os.hostname();
const isLaptop = hostname === 'Portatil_HP';

const cmd = isLaptop ? 'next dev --webpack' : 'next dev';

console.log(`[dev] Máquina detectada: ${hostname} → usando ${isLaptop ? 'Webpack' : 'Turbopack'}`);

execSync(cmd, { stdio: 'inherit' });