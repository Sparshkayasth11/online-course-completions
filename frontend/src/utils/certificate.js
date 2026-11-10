import { jsPDF } from 'jspdf';

export function getBranchFromStudentId(studentId) {
  if (/AD/i.test(studentId || '')) {
    return 'Artificial Intelligence and Data Science (AIDS)';
  }
  if (/CL/i.test(studentId || '')) {
    return 'Artificial Intelligence and Machine Learning (AIML)';
  }
  if (/CS/i.test(studentId || '')) {
    return 'Computer Science Engineering (CSE)';
  }
  return 'Branch not identified';
}

export function generateCertificatePdf(student, course) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const center = width / 2;
  const studentId = student.studentId || student._id;
  const branch =
    student.branch || getBranchFromStudentId(studentId || '');

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, width, height, 'F');
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, width, 34, 'F');
  doc.setDrawColor(201, 168, 92);
  doc.setLineWidth(1.2);
  doc.rect(9, 9, width - 18, height - 18);
  doc.setLineWidth(0.35);
  doc.rect(13, 13, width - 26, height - 26);

  doc.setFillColor(255, 255, 255);
  doc.circle(center, 20, 9, 'F');
  doc.setDrawColor(201, 168, 92);
  doc.setLineWidth(0.7);
  doc.circle(center, 20, 9, 'S');
  doc.setLineWidth(0.25);
  doc.circle(center, 20, 7.3, 'S');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('JNCT', center, 22, { align: 'center' });
  doc.setTextColor(226, 232, 240);
  doc.setFontSize(14);
  doc.text('Jai Narain College of Technology, Bhopal', center, 39, {
    align: 'center',
  });
  doc.setTextColor(79, 70, 229);
  doc.setFontSize(11);
  doc.text('JNCT COMPLETIONS', center, 55, { align: 'center' });
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(25);
  doc.text('8-Week Course Completion Certificate', center, 70, {
    align: 'center',
  });
  doc.setDrawColor(201, 168, 92);
  doc.setLineWidth(0.8);
  doc.line(center - 48, 77, center + 48, 77);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('This certificate is proudly presented to', center, 91, {
    align: 'center',
  });
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(student.name || 'Student', center, 105, { align: 'center' });
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('for successfully completing the course', center, 117, {
    align: 'center',
  });
  doc.setTextColor(49, 46, 129);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(course.title || 'Course', center, 128, { align: 'center' });
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Branch: ${branch}`, center, 140, { align: 'center' });
  doc.text(`Roll Number: ${studentId}`, center, 148, { align: 'center' });
  doc.text('Eight weeks completed', center, 156, { align: 'center' });

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.line(center - 33, 171, center + 33, 171);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Sparsh Srivastava', center, 177, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Head of JNCT', center, 182, { align: 'center' });
  doc.text(
    `Issued ${new Date().toLocaleDateString()}`,
    width - 20,
    height - 17,
    { align: 'right' }
  );

  const filename = `${studentId}-${course.title || 'course'}-certificate`
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  doc.save(`${filename}.pdf`);
}
