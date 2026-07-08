const fs = require('fs');
const path = require('path');

const distDir = './dist-electron';

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      content = content.replace(/from '(\.\.?\/.*?)\.js'/g, "from '$1.cjs'");
      
      content = content.replace(/require\(["'](\.\.?\/[^"']+)["']\)/g, (match, p1) => {
        if (p1.endsWith('.cjs') || p1.endsWith('.js')) {
          return match;
        }
        return `require("${p1}.cjs")`;
      });
      
      fs.writeFileSync(fullPath, content);
      
      const newPath = fullPath.replace(/\.js$/, '.cjs');
      fs.renameSync(fullPath, newPath);
      console.log('Renamed: ' + fullPath + ' -> ' + newPath);
    }
  }
}

console.log('Processing dist-electron directory...');
processDirectory(distDir);

const preloadSrc = 'electron/preload.cjs';
const preloadDest = 'dist-electron/preload.cjs';
fs.copyFileSync(preloadSrc, preloadDest);
console.log('Copied: ' + preloadSrc + ' -> ' + preloadDest);

const mobileSrc = 'electron/vaultApi/mobile.html';
const mobileDest = 'dist-electron/vaultApi/mobile.html';
if (fs.existsSync(mobileSrc)) {
  fs.mkdirSync(path.dirname(mobileDest), { recursive: true });
  fs.copyFileSync(mobileSrc, mobileDest);
  console.log('Copied: ' + mobileSrc + ' -> ' + mobileDest);
}

console.log('Done!');
