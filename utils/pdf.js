const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.png');

// ─── Per-training certificate (saved to disk) ────────────────────────────────
async function generateCertificate({ user, training, result, certId, isDemo = false }) {
  return new Promise((resolve, reject) => {
    const fileName  = `cert_${certId}_${user.id}_${Date.now()}.pdf`;
    const filePath  = path.join(__dirname, '..', 'public', 'uploads', 'certificates', fileName);
    const publicPath = `/uploads/certificates/${fileName}`;

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const W = 841.89;
    const H = 595.28;

    doc.rect(0, 0, W, H).fill('#ffffff');
    doc.rect(0, 0, W, 12).fill('#dc2626');
    doc.rect(0, 12, W, 4).fill('#f59e0b');
    doc.rect(0, H - 12, W, 12).fill('#dc2626');
    doc.rect(0, H - 16, W, 4).fill('#f59e0b');
    doc.rect(0, 0, 8, H).fill('#1e293b');
    doc.rect(W - 8, 0, 8, H).fill('#1e293b');

    const cx = 120, cy = 90, r = 45;
    doc.circle(cx, cy, r).fill('#1e293b');
    doc.circle(cx, cy, r - 4).fill('#dc2626');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
       .text('If', cx - 22, cy - 12, { width: 44, align: 'center' });
    doc.fillColor('#f59e0b').fontSize(18)
       .text('DAU', cx - 22, cy + 2, { width: 44, align: 'center' });
    doc.fillColor('#1e293b').font('Helvetica').fontSize(9)
       .text('Institut für Digitale Arbeitsunterweisungen', 30, 148, { width: 180, align: 'center' });

    doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(11)
       .text('ZERTIFIKAT', 250, 60, { width: 500, align: 'center', characterSpacing: 4 });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(26)
       .text('Bescheinigung', 250, 80, { width: 500, align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(12)
       .text('über die erfolgreiche Teilnahme an der Unterweisung', 250, 118, { width: 500, align: 'center' });

    doc.moveTo(280, 150).lineTo(730, 150).strokeColor('#e2e8f0').lineWidth(1).stroke();

    doc.fillColor('#64748b').font('Helvetica').fontSize(11)
       .text('Hiermit wird bescheinigt, dass', 250, 175, { width: 500, align: 'center' });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(28)
       .text(user.name, 250, 198, { width: 500, align: 'center' });

    const nameWidth = Math.min(doc.widthOfString(user.name, { fontSize: 28 }), 400);
    const nameX = 250 + (500 - nameWidth) / 2;
    doc.moveTo(nameX, 236).lineTo(nameX + nameWidth, 236).strokeColor('#dc2626').lineWidth(2).stroke();

    doc.fillColor('#64748b').font('Helvetica').fontSize(11)
       .text('die folgende Unterweisung erfolgreich abgeschlossen hat:', 250, 250, { width: 500, align: 'center' });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(16)
       .text(training.title, 250, 275, { width: 500, align: 'center' });

    const scoreDate = `Ergebnis: ${Math.round(result.score)} % | Ausgestellt am: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
       .text(scoreDate, 250, 325, { width: 500, align: 'center' });

    doc.moveTo(280, 365).lineTo(730, 365).strokeColor('#e2e8f0').lineWidth(1).stroke();

    doc.fillColor('#64748b').font('Helvetica').fontSize(9)
       .text('Zertifikat-Nr.: IFDAU-' + String(certId).padStart(6, '0'), 250, 380, { width: 230, align: 'center' });
    doc.fillColor('#64748b').font('Helvetica').fontSize(9)
       .text('IfDAU – Institut für Digitale Arbeitsunterweisungen', 520, 380, { width: 230, align: 'center' });

    doc.moveTo(280, 440).lineTo(470, 440).strokeColor('#1e293b').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(8)
       .text('Datum, Unterschrift Mitarbeiter/in', 280, 445, { width: 190, align: 'center' });
    doc.moveTo(540, 440).lineTo(730, 440).strokeColor('#1e293b').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(8)
       .text('IfDAU – Digitale Zertifizierung', 540, 445, { width: 190, align: 'center' });

    doc.fillColor('#f1f5f9').font('Helvetica-Bold').fontSize(60)
       .rotate(-30, { origin: [W / 2, H / 2] })
       .text('IFDAU', W / 2 - 100, H / 2 - 30, { width: 200, align: 'center' });

    // Demo-Wasserzeichen
    if (isDemo) {
      doc.save();
      doc.rotate(-35, { origin: [W / 2, H / 2] });
      doc.fillColor('#dc2626').opacity(0.18).font('Helvetica-Bold').fontSize(110)
         .text('DEMO', W / 2 - 200, H / 2 - 60, { width: 400, align: 'center' });
      doc.restore();
      doc.opacity(1);
      doc.fillColor('#dc2626').font('Helvetica').fontSize(8)
         .text('Dieses Zertifikat wurde im Demo-Modus ausgestellt und hat keine rechtliche Gültigkeit.',
               60, H - 30, { width: W - 120, align: 'center' });
    }

    doc.end();
    stream.on('finish', () => resolve(publicPath));
    stream.on('error', reject);
  });
}

// ─── Final / summary certificate (streamed directly to HTTP response) ─────────
function generateFinalCertificate({ user, trainings, res }) {
  const W  = 595.28;   // A4 portrait width  (pt)
  const H  = 841.89;   // A4 portrait height (pt)
  const ML = 55;       // left margin
  const MR = 55;       // right margin
  const CW = W - ML - MR;   // usable content width

  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0 });
  doc.on('error', err => console.error('PDF-Stream-Fehler:', err));
  doc.pipe(res);

  const now     = new Date();
  const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // ── White background ────────────────────────────────────────────
  doc.rect(0, 0, W, H).fill('#ffffff');

  // ── Subtle dot-grid background pattern ──────────────────────────
  for (let gx = 28; gx <= W - 28; gx += 28) {
    for (let gy = 28; gy <= H - 28; gy += 28) {
      doc.circle(gx, gy, 0.65).fill('#e4e4e4');
    }
  }

  // ── Border decorations ─────────────────────────────────────────
  // Top bar
  doc.rect(0, 0, W, 7).fill('#dc2626');
  doc.rect(0, 7, W, 2.5).fill('#f59e0b');
  // Bottom bar
  doc.rect(0, H - 7, W, 7).fill('#dc2626');
  doc.rect(0, H - 9.5, W, 2.5).fill('#f59e0b');
  // Side bars
  doc.rect(0, 0, 5, H).fill('#1e293b');
  doc.rect(W - 5, 0, 5, H).fill('#1e293b');

  // ── Logo top-left ──────────────────────────────────────────────
  // Logo is 1408×768 px → ratio 11:6 → at 175pt wide → ~95pt tall
  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, ML, 16, { width: 175 });
  }

  // ── Title ──────────────────────────────────────────────────────
  doc.fillColor('#1e293b')
     .font('Helvetica-Bold')
     .fontSize(28)
     .text('Zertifikat / Certificate', 0, 138, { width: W, align: 'center' });

  // Red accent line beneath title
  doc.moveTo(ML + 55, 174)
     .lineTo(W - MR - 55, 174)
     .strokeColor('#dc2626').lineWidth(1.5).stroke();

  // ── Person ─────────────────────────────────────────────────────
  doc.fillColor('#64748b')
     .font('Helvetica')
     .fontSize(10)
     .text('Hiermit wird bestätigt, dass / This certifies that', 0, 187, { width: W, align: 'center' });

  doc.fillColor('#1e293b')
     .font('Helvetica-Bold')
     .fontSize(22)
     .text(user.name, 0, 204, { width: W, align: 'center' });

  // Red underline under the name
  const nw     = Math.min(doc.widthOfString(user.name, { fontSize: 22 }), 300);
  const nStartX = (W - nw) / 2;
  doc.moveTo(nStartX, 233)
     .lineTo(nStartX + nw, 233)
     .strokeColor('#dc2626').lineWidth(1.2).stroke();

  // Birthdate (optional)
  let personBottomY = 242;
  if (user.geburtsdatum) {
    const bd = new Date(user.geburtsdatum)
      .toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(10)
       .text(`geboren am / born on the: ${bd}`, 0, 242, { width: W, align: 'center' });
    personBottomY = 256;
  }

  // ── Main participation text ────────────────────────────────────
  const mainY = personBottomY + 18;
  doc.fillColor('#1e293b')
     .font('Helvetica')
     .fontSize(10.5)
     .text(`hat am ${dateStr} an der Arbeitsschutzunterweisung gemäß`, ML, mainY, { width: CW, align: 'left' });

  // Legal references (centred)
  const legalLines = [
    '§ 12 Arbeitsschutzgesetz (occupational health and safety law)',
    '§ 4 DGUV V1 (German Social Accident Insurance) V1',
    '(Grundsätze der Prävention / Principles of prevention),',
    '§ 14 Abs. 2 der Gefahrenstoffverordnung und',
    '§ 9 Betriebssicherheitsverordnung'
  ];

  let ly = mainY + 22;
  doc.fillColor('#1e293b').font('Helvetica').fontSize(10);
  for (const line of legalLines) {
    doc.text(line, ML, ly, { width: CW, align: 'center' });
    ly += 16;
  }

  // "erfolgreich teilgenommen"
  ly += 6;
  doc.fillColor('#1e293b')
     .font('Helvetica-Bold')
     .fontSize(10.5)
     .text('erfolgreich teilgenommen / participated successfully.', ML, ly, { width: CW, align: 'center' });

  // Thin horizontal rule
  const divY = ly + 22;
  doc.moveTo(ML, divY)
     .lineTo(W - MR, divY)
     .strokeColor('#cbd5e1').lineWidth(0.8).stroke();

  // ── Topics (bullet list) ───────────────────────────────────────
  let ty = divY + 15;
  doc.fillColor('#1e293b')
     .font('Helvetica')
     .fontSize(10)
     .text('Die Unterweisung beinhaltete folgende Schwerpunkte /', ML, ty, { width: CW });
  ty += 14;
  doc.text('The instruction emphasised the following points:', ML, ty, { width: CW });
  ty += 18;

  for (const t of trainings) {
    doc.fillColor('#1e293b')
       .font('Helvetica')
       .fontSize(10)
       .text(`•  ${t.title}`, ML + 8, ty, { width: CW - 8 });
    ty += 16;
  }

  // ── Signature area (fixed near bottom) ────────────────────────
  const sigY  = H - 188;
  const slY   = sigY + 38;   // signature lines
  const slLY  = slY  + 7;   // small label above name
  const slNY  = slLY + 13;  // name / placeholder
  const slOY  = slNY + 13;  // organisation

  doc.fillColor('#1e293b')
     .font('Helvetica')
     .fontSize(10)
     .text(`Luckenwalde, den ${dateStr}`, ML, sigY);

  // Left signature (Andreas Mielecke / IfDAU)
  doc.moveTo(ML, slY).lineTo(ML + 190, slY)
     .strokeColor('#1e293b').lineWidth(0.5).stroke();
  doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9)
     .text('Andreas Mielecke', ML, slNY, { width: 190 });
  doc.fillColor('#64748b').font('Helvetica').fontSize(8)
     .text('IfDAU', ML, slOY, { width: 190 });

  // Right signature (FASI placeholder)
  const rxL = ML + 238;
  const rxR = rxL + 230;
  doc.moveTo(rxL, slY).lineTo(rxR, slY)
     .strokeColor('#1e293b').lineWidth(0.5).stroke();
  doc.fillColor('#64748b').font('Helvetica').fontSize(8)
     .text('Fachkraft für Arbeitssicherheit (FASI)', rxL, slLY, { width: rxR - rxL });
  doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(9)
     .text('_________________________', rxL, slNY, { width: rxR - rxL });
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5)
     .text('IfDAU – Institut für Digitale Arbeitsschutzunterweisungen', rxL, slOY, { width: rxR - rxL });

  // ── Seal logo (bottom right) ───────────────────────────────────
  if (fs.existsSync(LOGO_PATH)) {
    // 75pt wide → ~41pt tall (ratio 11:6)
    doc.image(LOGO_PATH, W - MR - 80, H - 85, { width: 75 });
  }

  doc.end();
}

module.exports = { generateCertificate, generateFinalCertificate };
