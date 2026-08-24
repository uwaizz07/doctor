const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const links = [];
const re = /href="([^"]+)"/g;
let m;
while ((m = re.exec(c)) !== null) {
  if (m[1].startsWith('/')) links.push(m[1]);
}
console.log([...new Set(links)].join('\n'));
