import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { EndorsementApplication } from '../types/types';
import { maxTotalScore, ordinal, totalScore } from './endorsement';

const HEADER_COLOR: [number, number, number] = [41, 128, 185];
const STRIPE_COLOR: [number, number, number] = [245, 250, 254];
const TABLE_STYLES = { overflow: 'linebreak', cellPadding: 4, fontSize: 10 } as const;

const formatTime = (ms: number | undefined) => (ms === undefined ? '—' : new Date(ms).toUTCString());
const formatScore = (score: number | null | undefined) => (score === null || score === undefined ? '—' : String(score));

export function generateEndorsementPdf(app: EndorsementApplication): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // autoTable records where the last table ended on the document.
  const tableEnd = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 0;
  const { videos, rubric } = app.config;
  const maxTotal = maxTotalScore(rubric);

  doc.setFontSize(20);
  doc.setTextColor(44, 62, 80);
  doc.text('Judge Endorsement Application', pageWidth / 2, 15, { align: 'center' });

  const tableDefaults = {
    headStyles: { fillColor: HEADER_COLOR, textColor: 255 },
    alternateRowStyles: { fillColor: STRIPE_COLOR },
    styles: TABLE_STYLES,
    margin: { top: 20 },
  } as const;

  // Starts a section on a new page when there isn't room for its title and a row or two.
  const addSectionTitle = (title: string, y: number) => {
    let top = y;
    if (top > pageHeight - 50) {
      doc.addPage();
      top = 20;
    }
    doc.setFontSize(14);
    doc.setTextColor(52, 73, 94);
    doc.text(title, 14, top);
    return top + 4;
  };

  autoTable(doc, {
    ...tableDefaults,
    startY: 24,
    head: [['Judge information', '']],
    body: [
      ['Name', app.judge.name],
      ['Email', app.judge.email],
      ['Started', formatTime(app.createdAt)],
      ['Submitted', formatTime(app.submittedAt)],
    ],
    columnStyles: { 0: { cellWidth: 40, fontStyle: 'bold' } },
  });

  app.performances.forEach((performance, index) => {
    const video = videos[index];
    autoTable(doc, {
      ...tableDefaults,
      startY: addSectionTitle(`Video ${index + 1}: ${video?.label ?? ''}`, tableEnd() + 12),
      head: [['Category', 'Score', 'Notes']],
      body: [
        ...rubric.map((category) => [
          category.name,
          `${formatScore(performance.scores[category.id])} / ${category.maxScore}`,
          performance.notes[category.id] || '—',
        ]),
        [{ content: 'Total', styles: { fontStyle: 'bold' } }, { content: `${totalScore(performance)} / ${maxTotal}`, styles: { fontStyle: 'bold' } }, ''],
        [
          { content: 'What should this team improve before their next competition?', styles: { fontStyle: 'bold' } },
          { content: performance.feedback || '—', colSpan: 2 },
        ],
      ],
      foot: [[{
        content: performance.autoSubmitted
          ? `Auto-submitted when time ran out (${formatTime(performance.submittedAt)})`
          : `Submitted ${formatTime(performance.submittedAt)}`,
        colSpan: 3,
        styles: { fontStyle: 'italic', fontSize: 9, textColor: 100, fillColor: 255 },
      }]],
      showFoot: 'lastPage',
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 22 }, 2: { cellWidth: 'auto' } },
    });
  });

  autoTable(doc, {
    ...tableDefaults,
    startY: addSectionTitle('Final Ranking', tableEnd() + 12),
    head: [['Place', 'Team', 'Total score']],
    body: app.ranking.order.map((performanceIndex, place) => [
      ordinal(place + 1),
      videos[performanceIndex]?.label ?? `Video ${performanceIndex + 1}`,
      `${totalScore(app.performances[performanceIndex])} / ${maxTotal}`,
    ]),
    columnStyles: { 0: { cellWidth: 22 } },
  });

  autoTable(doc, {
    ...tableDefaults,
    startY: tableEnd() + 6,
    head: [['Ranking explanation']],
    body: [[app.ranking.explanation || '—']],
    foot: [[{
      content: app.ranking.autoSubmitted
        ? `Auto-submitted when time ran out (${formatTime(app.ranking.submittedAt)})`
        : `Submitted ${formatTime(app.ranking.submittedAt)}`,
      styles: { fontStyle: 'italic', fontSize: 9, textColor: 100, fillColor: 255 },
    }]],
    showFoot: 'lastPage',
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`${app.judge.name} — Page ${page} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
