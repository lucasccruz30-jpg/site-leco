const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'public');
const itemsToCopy = [
  'index.html',
  'style.css',
  'script.js',
  'Logo',
  'apresentacao',
  'inscricao',
];

function removeDirectory(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyEntry(sourcePath, destinationPath) {
  const stats = fs.statSync(sourcePath);

  if (stats.isDirectory()) {
    ensureDirectory(destinationPath);
    for (const childName of fs.readdirSync(sourcePath)) {
      copyEntry(
        path.join(sourcePath, childName),
        path.join(destinationPath, childName)
      );
    }
    return;
  }

  ensureDirectory(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

removeDirectory(outputDir);
ensureDirectory(outputDir);

for (const relativePath of itemsToCopy) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(outputDir, relativePath);
  copyEntry(sourcePath, destinationPath);
}

console.log(`Static files copied to ${outputDir}`);
