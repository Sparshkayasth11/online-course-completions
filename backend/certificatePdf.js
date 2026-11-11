const puppeteer = require('puppeteer');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createCertificateHtml(studentName, enrollmentNumber, courseTitle, issueDate) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 landscape;
      margin: 0;
    }
    body {
      margin: 0;
      padding: 30px;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      background-color: #ffffff;
      color: #1a1a1a;
      box-sizing: border-box;
    }
    .certificate-container {
      border: 6px double #0f2b5c;
      padding: 35px 45px;
      height: calc(100% - 70px);
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .header {
      text-align: center;
    }
    .brand-jnct {
      font-size: 14px;
      font-weight: 800;
      color: #0f2b5c;
      letter-spacing: 2px;
      margin: 0;
    }
    .brand-college {
      font-size: 16px;
      font-weight: 700;
      color: #333333;
      letter-spacing: 1.5px;
      margin: 2px 0 0 0;
    }
    .subtitle {
      font-size: 11px;
      color: #666666;
      letter-spacing: 2px;
      margin-top: 8px;
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      color: #0f2b5c;
      letter-spacing: 1.5px;
      margin-top: 4px;
      text-transform: uppercase;
    }
    .body-content {
      text-align: center;
      margin-top: 15px;
    }
    .presented-to {
      font-size: 13px;
      color: #555555;
      font-style: italic;
    }
    .student-name {
      font-size: 28px;
      font-weight: 900;
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 2px solid #0f2b5c;
      display: inline-block;
      padding-bottom: 2px;
      margin: 10px 0;
    }
    .enrollment {
      font-size: 13px;
      font-weight: 700;
      color: #222222;
      margin-bottom: 8px;
    }
    .dept-text {
      font-size: 11.5px;
      color: #444444;
      max-width: 650px;
      margin: 0 auto;
      line-height: 1.5;
    }
    .course-title-box {
      background-color: #f0f4f9;
      border: 1px solid #d0dbe7;
      border-radius: 6px;
      padding: 10px;
      max-width: 500px;
      margin: 15px auto 10px auto;
      text-align: center;
    }
    .course-title-label {
      font-size: 10px;
      font-weight: 800;
      color: #0f2b5c;
      letter-spacing: 1.5px;
    }
    .course-title-value {
      font-size: 18px;
      font-weight: 800;
      color: #051937;
      margin-top: 2px;
      text-transform: uppercase;
    }
    .details-table {
      width: 100%;
      max-width: 520px;
      margin: 10px auto;
      border-collapse: collapse;
      font-size: 11px;
    }
    .details-table th, .details-table td {
      border: 1px solid #e0e0e0;
      padding: 5px 12px;
      text-align: left;
    }
    .details-table th {
      background-color: #f8f9fa;
      color: #333;
      font-weight: 700;
    }
    .details-table td {
      color: #555;
    }
    .details-table td.val {
      color: #111;
      font-weight: 600;
    }
    .closing-text {
      font-size: 10.5px;
      color: #666666;
      text-align: center;
      max-width: 650px;
      margin: 10px auto 0 auto;
      line-height: 1.4;
    }
    .footer-row {
      display: table;
      width: 100%;
      margin-top: 15px;
    }
    .footer-left {
      display: table-cell;
      vertical-align: bottom;
      text-align: left;
      font-size: 9.5px;
      color: #888888;
    }
    .footer-right {
      display: table-cell;
      vertical-align: bottom;
      text-align: right;
    }
    .sig-name {
      font-size: 14px;
      font-weight: 700;
      color: #0f2b5c;
    }
    .sig-title {
      border-top: 1px solid #777777;
      padding-top: 2px;
      margin-top: 3px;
      font-size: 10px;
      font-weight: 700;
      color: #333333;
      text-transform: uppercase;
    }
    .sig-sub {
      font-size: 9.5px;
      color: #555555;
    }
  </style>
</head>
<body>
  <div class="certificate-container">
    <div class="header">
      <div class="brand-jnct">JNCT</div>
      <div class="brand-college">LNCT GROUP OF COLLEGE</div>
      <div class="subtitle">ONLINE COURSE COMPLETION</div>
      <div class="title">CERTIFICATE OF COMPLETION</div>
    </div>

    <div class="body-content">
      <div class="presented-to">This certificate is proudly presented to</div>
      <div class="student-name">${escapeHtml(studentName)}</div>
      <div class="enrollment">Enrollment Number: ${escapeHtml(enrollmentNumber)}</div>
      <div class="dept-text">
        of the Department of Computer Science & Engineering (Artificial Intelligence & Data Science), JNCT, Bhopal, for successfully completing an 8-week online course.
      </div>
    </div>

    <div class="course-title-box">
      <div class="course-title-label">COURSE TITLE</div>
      <div class="course-title-value">${escapeHtml(courseTitle)}</div>
    </div>

    <table class="details-table">
      <thead>
        <tr>
          <th>Course Detail</th>
          <th>Information</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Course Duration</td>
          <td class="val">8 Weeks</td>
        </tr>
        <tr>
          <td>Department</td>
          <td class="val">Artificial Intelligence & Data Science</td>
        </tr>
        <tr>
          <td>Course Mode</td>
          <td class="val">Online</td>
        </tr>
        <tr>
          <td>Issue Date</td>
          <td class="val">${escapeHtml(issueDate)}</td>
        </tr>
        <tr>
          <td>Institution</td>
          <td class="val">JNCT, Bhopal</td>
        </tr>
      </tbody>
    </table>

    <div class="closing-text">
      We appreciate the dedication, commitment and enthusiasm demonstrated during the course and wish the student continued success in future academic and professional endeavors.
    </div>

    <div class="footer-row">
      <div class="footer-left">
        <div>Verified Online Certification</div>
        <div>JNCT Completions Portal</div>
      </div>
      <div class="footer-right">
        <div class="sig-name">Prof. Ravinder Tanwar</div>
        <div class="sig-title">Authorized Signatory</div>
        <div class="sig-sub">HOD, CSE (AI&DS)</div>
        <div class="sig-sub">JNCT, Bhopal</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function createCertificatePdf(student, courseTitle, completedAt) {
  const issueDate = new Date(completedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const studentName = student.name || 'Student';
  const enrollmentNumber = student.studentId || student._id.toString();
  const html = createCertificateHtml(
    studentName,
    enrollmentNumber,
    courseTitle || 'Course',
    issueDate
  );
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

module.exports = { createCertificateHtml, createCertificatePdf };
