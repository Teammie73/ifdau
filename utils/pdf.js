const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function generateCertificate({ user, training, result, certId }) {
  return new Promise((resolve, reject) => {
    const fileName = `cert_${certId}_${user.id}_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, '..', 'public', 'uploads', 'certificates', fileName);
    const publicPath = `/uploads/certificates/${fileName}`;

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const W = 841.89;
    const H = 595.28;

    // Background
    doc.rect(0, 0, W, H).fill('#ffffff');

    // Red top bar
    doc.rect(0, 0, W, 12).fill('#dc2626');

    // Yellow accent stripe
    doc.rect(0, 12, W, 4).fill('#f59e0b');

    // Bottom bar
    doc.rect(0, H - 12, W, 12).fill('#dc2626');
    doc.rect(0, H - 16, W, 4).fill('#f59e0b');

    // Left decorative bar
    doc.rect(0, 0, 8, H).fill('#1e293b');

    // Right decorative bar
    doc.rect(W - 8, 0, 8, H).fill('#1e293b');

    // Logo circle
    const cx = 120, cy = 90, r = 45;
    doc.circle(cx, cy, r).fill('#1e293b');
    doc.circle(cx, cy, r - 4).fill('#dc2626');

    // Logo text in circle
    doc.fillColor('#ffffff')
       .font('Helvetica-Bold')
       .fontSize(18)
       .text('If', cx - 22, cy - 12, { width: 44, align: 'center' });
    doc.fillColor('#f59e0b')
       .fontSize(18)
       .text('DAU', cx - 22, cy + 2, { width: 44, align: 'center' });

    // Institut name
    doc.fillColor('#1e293b')
       .font('Helvetica')
       .fontSize(9)
       .text('Institut für Digitale Arbeitsunterweisungen', 30, 148, { width: 180, align: 'center' });

    // Certificate title
    doc.fillColor('#dc2626')
       .font('Helvetica-Bold')
       .fontSize(11)
       .text('ZERTIFIKAT', 250, 60, { width: 500, align: 'center', characterSpacing: 4 });

    doc.fillColor('#1e293b')
       .font('Helvetica-Bold')
       .fontSize(26)
       .text('Bescheinigung', 250, 80, { width: 500, align: 'center' });

    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(12)
       .text('über die erfolgreiche Teilnahme an der Unterweisung', 250, 118, { width: 500, align: 'center' });

    // Divider line
    doc.moveTo(280, 150).lineTo(730, 150).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // This certifies that
    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(11)
       .text('Hiermit wird bescheinigt, dass', 250, 175, { width: 500, align: 'center' });

    // Name
    doc.fillColor('#1e293b')
       .font('Helvetica-Bold')
       .fontSize(28)
       .text(user.name, 250, 198, { width: 500, align: 'center' });

    // Name underline
    const nameWidth = Math.min(doc.widthOfString(user.name, { fontSize: 28 }), 400);
    const nameX = 250 + (500 - nameWidth) / 2;
    doc.moveTo(nameX, 236).lineTo(nameX + nameWidth, 236).strokeColor('#dc2626').lineWidth(2).stroke();

    // Training name
    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(11)
       .text('die folgende Unterweisung erfolgreich abgeschlossen hat:', 250, 250, { width: 500, align: 'center' });

    doc.fillColor('#1e293b')
       .font('Helvetica-Bold')
       .fontSize(16)
       .text(training.title, 250, 275, { width: 500, align: 'center' });

    // Score and date row
    const scoreDate = `Ergebnis: ${Math.round(result.score)} % | Ausgestellt am: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(10)
       .text(scoreDate, 250, 325, { width: 500, align: 'center' });

    // Bottom divider
    doc.moveTo(280, 365).lineTo(730, 365).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // Signature area
    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(9)
       .text('Zertifikat-Nr.: IFDAU-' + String(certId).padStart(6, '0'), 250, 380, { width: 230, align: 'center' });

    doc.fillColor('#64748b')
       .font('Helvetica')
       .fontSize(9)
       .text('IfDAU – Institut für Digitale Arbeitsunterweisungen', 520, 380, { width: 230, align: 'center' });

    // Signature line left
    doc.moveTo(280, 440).lineTo(470, 440).strokeColor('#1e293b').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(8).text('Datum, Unterschrift Mitarbeiter/in', 280, 445, { width: 190, align: 'center' });

    // Signature line right
    doc.moveTo(540, 440).lineTo(730, 440).strokeColor('#1e293b').lineWidth(0.5).stroke();
    doc.fillColor('#64748b').fontSize(8).text('IfDAU – Digitale Zertifizierung', 540, 445, { width: 190, align: 'center' });

    // Certificate number watermark
    doc.fillColor('#f1f5f9')
       .font('Helvetica-Bold')
       .fontSize(60)
       .rotate(-30, { origin: [W / 2, H / 2] })
       .text('IFDAU', W / 2 - 100, H / 2 - 30, { width: 200, align: 'center' });

    doc.end();

    stream.on('finish', () => resolve(publicPath));
    stream.on('error', reject);
  });
}

module.exports = { generateCertificate };
