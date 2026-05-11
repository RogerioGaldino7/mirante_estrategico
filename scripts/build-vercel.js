const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, '_Sistema');
const outputDir = path.join(root, 'dist');

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Pasta da aplicacao nao encontrada: ${sourceDir}`);
}

removeDir(outputDir);
copyDir(sourceDir, outputDir);

console.log(`Build Vercel concluido: ${path.relative(root, sourceDir)} -> ${path.relative(root, outputDir)}`);
