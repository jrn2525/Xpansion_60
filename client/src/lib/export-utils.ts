import type { jsPDF as JsPDFType } from "jspdf";

export interface ExportColumn {
  key: string;
  header: string;
  format?: (value: any) => string;
}

export function exportToCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) {
  if (data.length === 0) return;

  const escapeCSV = (val: any): string => {
    const str = val == null ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = columns.map((col) => escapeCSV(col.header)).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        const formatted = col.format ? col.format(value) : value;
        return escapeCSV(formatted);
      })
      .join(",")
  );

  const csvContent = [headerRow, ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportToPDF(
  elementId: string,
  filename: string
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: null,
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;

  const pdfWidth = 210;
  const pdfMargin = 10;
  const contentWidth = pdfWidth - 2 * pdfMargin;
  const ratio = contentWidth / imgWidth;
  const contentHeight = imgHeight * ratio;

  const pdf: JsPDFType = new jsPDF({
    orientation: contentHeight > pdfWidth ? "portrait" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageHeight = pdf.internal.pageSize.getHeight() - 2 * pdfMargin;

  if (contentHeight <= pageHeight) {
    pdf.addImage(imgData, "PNG", pdfMargin, pdfMargin, contentWidth, contentHeight);
  } else {
    let remainingHeight = contentHeight;
    let position = 0;
    let page = 0;

    while (remainingHeight > 0) {
      if (page > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        imgData,
        "PNG",
        pdfMargin,
        pdfMargin - position,
        contentWidth,
        contentHeight
      );
      remainingHeight -= pageHeight;
      position += pageHeight;
      page++;
    }
  }

  pdf.save(`${filename}.pdf`);
}
