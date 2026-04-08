const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'public');
const itemsToCopy = [
  'index.html',
  'style.css',
  'campaign.css',
  'campaign.js',
  'legal.css',
  'legal-document.js',
  'script.js',
  'robots.txt',
  'sitemap.xml',
  'regulamento_campanha_bonus_2_meses_leco.pdf',
  'regulamento_campanha_bonus_2_meses_leco.txt',
  'termos_uso_leco_final.pdf',
  'termos_uso_leco_final.txt',
  'politica_privacidade_leco_final.pdf',
  'politica_privacidade_leco_final.txt',
  'termo_exclusao_dados_leco.pdf',
  'termo_exclusao_dados_leco.txt',
  'Logo',
  'apresentacao',
  'excluir-dados',
  'familias-fundadoras',
  'privacidade',
  'inscricao',
  'regulamento-campanha-bonus-2-meses',
  'termo-exclusao-de-dados',
  'termos-de-uso',
  'politica-de-privacidade',
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
