const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCertificateHtml } = require('../certificatePdf');

test('builds the Gamma certificate HTML and escapes certificate values', () => {
  const html = createCertificateHtml(
    '<Student & Name>',
    '0131AD231067',
    'Frontend <Developer>',
    '11 November 2026'
  );

  assert.match(html, /@page\s*\{\s*size: A4 landscape;\s*margin: 0;/);
  assert.match(html, /border: 6px double #0f2b5c;/);
  assert.match(html, /font-family: 'Helvetica Neue', Arial, sans-serif;/);
  assert.match(html, /<div class="brand-jnct">JNCT<\/div>/);
  assert.match(html, /LNCT GROUP OF COLLEGE/);
  assert.match(html, /ONLINE COURSE COMPLETION/);
  assert.match(html, /CERTIFICATE OF COMPLETION/);
  assert.match(html, /&lt;Student &amp; Name&gt;/);
  assert.match(html, /Enrollment Number: 0131AD231067/);
  assert.match(html, /Frontend &lt;Developer&gt;/);
  assert.match(html, /<td class="val">11 November 2026<\/td>/);
  assert.match(html, /Course Duration/);
  assert.match(html, /Artificial Intelligence & Data Science/);
  assert.match(html, /We appreciate the dedication/);
  assert.match(html, /Prof\. Ravinder Tanwar/);
  assert.match(html, /Authorized Signatory/);
  assert.match(html, /HOD, CSE \(AI&DS\)/);
});
