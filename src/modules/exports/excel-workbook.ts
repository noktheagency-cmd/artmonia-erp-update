export type ExcelColumnKind =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "datetime"
  | "status";

export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export type ExcelExportColumn = {
  key: string;
  label: string;
  kind?: ExcelColumnKind;
  width?: number;
  wrap?: boolean;
};

export type ExcelExportDefinition = {
  title: string;
  worksheetName?: string;
  columns: ExcelExportColumn[];
  rows: Array<Record<string, ExcelCellValue>>;
  summary?: string[];
  generatedAt?: Date;
};

const MAX_COLUMNS = 64;
const MAX_ROWS = 10_000;
const MAX_CELL_LENGTH = 32_767;
const HEADER_ROW = 5;
const FIRST_DATA_ROW = HEADER_ROW + 1;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_IN_MS = 86_400_000;

const positiveStatusTokens = ["aktiv", "ödənilib", "iştirak edib", "tamam", "uğurlu", "təsdiq"];
const warningStatusTokens = ["sınaq", "məzuniyyət", "gözləy", "qismən", "potensial", "dayandır", "qeyd edilməyib"];
const negativeStatusTokens = ["passiv", "deaktiv", "gecik", "qeyri-iştirak", "ləğv", "imtina", "borclu"];

export async function createProfessionalExcelFile(definition: ExcelExportDefinition) {
  validateDefinition(definition);

  const generatedAt = definition.generatedAt ?? new Date();
  const sheetName = sanitizeWorksheetName(definition.worksheetName ?? definition.title);
  const files = buildWorkbookFiles(definition, generatedAt, sheetName);
  const { strToU8, zip } = await import("fflate");
  const encodedFiles = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
  );

  return new Promise<Uint8Array>((resolve, reject) => {
    zip(encodedFiles, { level: 6 }, (error, archive) => {
      if (error) reject(error);
      else resolve(archive);
    });
  });
}

function validateDefinition(definition: ExcelExportDefinition) {
  if (!definition.title.trim()) throw new Error("Excel hesabatının başlığı boş ola bilməz.");
  if (definition.columns.length === 0) throw new Error("Excel hesabatında ən azı bir sütun olmalıdır.");
  if (definition.columns.length > MAX_COLUMNS) throw new Error(`Excel hesabatı ən çox ${MAX_COLUMNS} sütun dəstəkləyir.`);
  if (definition.rows.length > MAX_ROWS) throw new Error(`Excel hesabatı ən çox ${MAX_ROWS.toLocaleString("az-AZ")} sətir dəstəkləyir.`);

  const keys = new Set<string>();
  for (const column of definition.columns) {
    if (!column.key || !column.label.trim()) throw new Error("Excel sütunları etibarlı açar və başlıq daşımalıdır.");
    if (keys.has(column.key)) throw new Error(`Excel sütun açarı təkrarlanır: ${column.key}`);
    keys.add(column.key);
  }
}

function buildWorkbookFiles(definition: ExcelExportDefinition, generatedAt: Date, sheetName: string) {
  return {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": rootRelationshipsXml(),
    "docProps/app.xml": appPropertiesXml(sheetName),
    "docProps/core.xml": corePropertiesXml(definition.title, generatedAt),
    "xl/workbook.xml": workbookXml(sheetName),
    "xl/_rels/workbook.xml.rels": workbookRelationshipsXml(),
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": worksheetXml(definition, generatedAt),
  };
}

function worksheetXml(definition: ExcelExportDefinition, generatedAt: Date) {
  const columnCount = definition.columns.length;
  const lastColumn = columnName(columnCount);
  const dataEndRow = definition.rows.length > 0 ? FIRST_DATA_ROW + definition.rows.length - 1 : FIRST_DATA_ROW;
  const widths = calculateColumnWidths(definition);
  const meta = `Artmonia ERP  •  İxrac tarixi: ${formatGeneratedAt(generatedAt)}  •  ${definition.rows.length.toLocaleString("az-AZ")} qeyd`;
  const summary = definition.summary?.filter(Boolean).join("  •  ") || "Peşəkar Excel hesabatı";
  const mergeCells = columnCount > 1
    ? `<mergeCells count="3"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/></mergeCells>`
    : "";

  const rows = [
    rowXml(1, [inlineStringCell("A1", definition.title, 1)], { height: 34 }),
    rowXml(2, [inlineStringCell("A2", meta, 2)], { height: 22 }),
    rowXml(3, [inlineStringCell("A3", summary, 3)], { height: 28 }),
    rowXml(4, [], { height: 8 }),
    rowXml(
      HEADER_ROW,
      definition.columns.map((column, index) => inlineStringCell(`${columnName(index + 1)}${HEADER_ROW}`, column.label, 4)),
      { height: 28 },
    ),
  ];

  if (definition.rows.length === 0) {
    rows.push(rowXml(FIRST_DATA_ROW, [inlineStringCell(`A${FIRST_DATA_ROW}`, "Seçilən meyarlara uyğun məlumat yoxdur.", 23)], { height: 30 }));
  } else {
    definition.rows.forEach((record, rowIndex) => {
      const excelRow = FIRST_DATA_ROW + rowIndex;
      const alternate = rowIndex % 2 === 1;
      const cells = definition.columns.map((column, columnIndex) => {
        const reference = `${columnName(columnIndex + 1)}${excelRow}`;
        return dataCellXml(reference, record[column.key], column, alternate);
      });
      const hasLongWrappedValue = definition.columns.some((column) => {
        if (!column.wrap) return false;
        return displayText(record[column.key]).length > Math.max(40, (column.width ?? 24) * 1.5);
      });
      rows.push(rowXml(excelRow, cells, { height: hasLongWrappedValue ? 38 : 21 }));
    });
  }

  const columns = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const emptyRowMerge = definition.rows.length === 0 && columnCount > 1
    ? `<mergeCells count="4"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/><mergeCell ref="A3:${lastColumn}3"/><mergeCell ref="A${FIRST_DATA_ROW}:${lastColumn}${FIRST_DATA_ROW}"/></mergeCells>`
    : mergeCells;
  const orientation = columnCount > 6 ? "landscape" : "portrait";

  return `${xmlDeclaration()}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:${lastColumn}${dataEndRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${FIRST_DATA_ROW}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${FIRST_DATA_ROW}" sqref="A${FIRST_DATA_ROW}"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${columns}</cols>
  <sheetData>${rows.join("")}</sheetData>
  ${emptyRowMerge}
  <autoFilter ref="A${HEADER_ROW}:${lastColumn}${Math.max(HEADER_ROW, dataEndRow)}"/>
  <printOptions horizontalCentered="0" verticalCentered="0"/>
  <pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="${orientation}" fitToWidth="1" fitToHeight="0"/>
  <headerFooter><oddHeader>&amp;LArtmonia ERP&amp;C${escapeXml(definition.title)}&amp;R${formatGeneratedAt(generatedAt)}</oddHeader><oddFooter>&amp;LPeşəkar hesabat&amp;RSəhifə &amp;P / &amp;N</oddFooter></headerFooter>
</worksheet>`;
}

function dataCellXml(reference: string, rawValue: ExcelCellValue, column: ExcelExportColumn, alternate: boolean) {
  const kind = column.kind ?? "text";
  const normalized = normalizeValue(rawValue, kind);
  const style = styleIndex(kind, normalized, alternate, Boolean(column.wrap));

  if (normalized === null || normalized === undefined || normalized === "") {
    return `<c r="${reference}" s="${style}"/>`;
  }
  if (typeof normalized === "number") {
    return `<c r="${reference}" s="${style}"><v>${Number.isFinite(normalized) ? normalized : 0}</v></c>`;
  }
  if (typeof normalized === "boolean") {
    return `<c r="${reference}" s="${style}" t="b"><v>${normalized ? 1 : 0}</v></c>`;
  }
  return inlineStringCell(reference, normalized, style);
}

function normalizeValue(value: ExcelCellValue, kind: ExcelColumnKind) {
  if (value === null || value === undefined) return null;

  if (kind === "date" || kind === "datetime") {
    const date = value instanceof Date ? value : parseDate(value);
    return date ? (date.getTime() - EXCEL_EPOCH) / DAY_IN_MS : displayText(value);
  }
  if (kind === "currency" || kind === "number") {
    return typeof value === "number" ? value : parseLocalizedNumber(value) ?? displayText(value);
  }
  if (kind === "percentage") {
    if (typeof value === "number") return Math.abs(value) > 1 ? value / 100 : value;
    const numeric = parseLocalizedNumber(value);
    return numeric === null ? displayText(value) : Math.abs(numeric) > 1 ? numeric / 100 : numeric;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function parseDate(value: ExcelCellValue) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const localDate = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  const normalized = localDate
    ? `${localDate[3]}-${localDate[2]}-${localDate[1]}T00:00:00.000Z`
    : /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(trimmed)
      ? trimmed.length === 10 ? `${trimmed}T00:00:00.000Z` : trimmed
      : null;
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLocalizedNumber(value: ExcelCellValue) {
  if (typeof value !== "string") return null;
  const isAzerbaijaniCurrency = /(?:AZN|₼)/i.test(value);
  const compact = value.replace(/[₼%\s\u00a0]/g, "").replace(/[^0-9,.-]/g, "");
  if (!compact || !/[0-9]/.test(compact)) return null;

  let normalized = compact;
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  if (isAzerbaijaniCurrency) normalized = compact.replaceAll(".", "").replace(",", ".");
  else if (comma > dot) normalized = compact.replaceAll(".", "").replace(",", ".");
  else if (dot > comma && comma >= 0) normalized = compact.replaceAll(",", "");
  else if (comma >= 0) normalized = compact.replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function styleIndex(kind: ExcelColumnKind, value: ReturnType<typeof normalizeValue>, alternate: boolean, wrap: boolean) {
  if (kind === "status") return statusStyle(displayText(value));
  if (kind === "number") return alternate ? 10 : 9;
  if (kind === "currency") return alternate ? 12 : 11;
  if (kind === "date") return alternate ? 14 : 13;
  if (kind === "datetime") return alternate ? 16 : 15;
  if (kind === "percentage") return alternate ? 18 : 17;
  if (wrap) return alternate ? 8 : 7;
  return alternate ? 6 : 5;
}

function statusStyle(value: string) {
  const normalized = value.toLocaleLowerCase("az");
  if (negativeStatusTokens.some((token) => normalized.includes(token))) return 21;
  if (warningStatusTokens.some((token) => normalized.includes(token))) return 20;
  if (positiveStatusTokens.some((token) => normalized.includes(token))) return 19;
  return 22;
}

function calculateColumnWidths(definition: ExcelExportDefinition) {
  const sampleRows = definition.rows.slice(0, 250);
  return definition.columns.map((column) => {
    if (column.width) return clamp(column.width, 10, 52);
    let longest = Math.max(column.label.length + 2, minimumWidth(column.kind ?? "text"));
    for (const row of sampleRows) {
      longest = Math.max(longest, displayText(row[column.key]).length + 1);
    }
    const cap = column.wrap ? 46 : column.kind === "currency" ? 20 : 34;
    return clamp(Math.ceil(longest * 1.08), 10, cap);
  });
}

function minimumWidth(kind: ExcelColumnKind) {
  if (kind === "currency") return 15;
  if (kind === "date") return 14;
  if (kind === "datetime") return 20;
  if (kind === "percentage" || kind === "number") return 12;
  if (kind === "status") return 14;
  return 12;
}

function rowXml(index: number, cells: string[], options: { height: number }) {
  return `<row r="${index}" ht="${options.height}" customHeight="1">${cells.join("")}</row>`;
}

function inlineStringCell(reference: string, value: unknown, style: number) {
  const text = truncateText(displayText(value));
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function displayText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Bəli" : "Xeyr";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function truncateText(value: string) {
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return cleaned.length > MAX_CELL_LENGTH ? `${cleaned.slice(0, MAX_CELL_LENGTH - 1)}…` : cleaned;
}

function sanitizeWorksheetName(value: string) {
  const cleaned = value.replace(/^Artmonia\s*[·-]\s*/i, "").replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Hesabat").slice(0, 31);
}

function columnName(index: number) {
  let current = index;
  let name = "";
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatGeneratedAt(value: Date) {
  return new Intl.DateTimeFormat("az-AZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Baku",
  }).format(value);
}

function xmlDeclaration() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function contentTypesXml() {
  return `${xmlDeclaration()}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRelationshipsXml() {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookRelationshipsXml() {
  return `${xmlDeclaration()}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function workbookXml(sheetName: string) {
  return `${xmlDeclaration()}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr defaultThemeVersion="164011"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000" activeTab="0"/></bookViews><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
}

function appPropertiesXml(sheetName: string) {
  return `${xmlDeclaration()}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Artmonia ERP</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts><Company>Artmonia</Company><AppVersion>16.0300</AppVersion></Properties>`;
}

function corePropertiesXml(title: string, generatedAt: Date) {
  const timestamp = generatedAt.toISOString();
  return `${xmlDeclaration()}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>Artmonia ERP</dc:creator><cp:lastModifiedBy>Artmonia ERP</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`;
}

function stylesXml() {
  const fonts = [
    '<font><sz val="10"/><color rgb="FF243B53"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>',
    '<font><sz val="9"/><color rgb="FFD9E5F5"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF173D76"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>',
    '<font><i/><sz val="10"/><color rgb="FF718096"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF13795B"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF9A6700"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FFB42318"/><name val="Aptos"/><family val="2"/></font>',
    '<font><b/><sz val="10"/><color rgb="FF52677D"/><name val="Aptos"/><family val="2"/></font>',
  ].join("");
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF102A43"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF173D76"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4FF"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF3158F5"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FC"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF8F2"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF7E6"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEC"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFF3F8"/><bgColor indexed="64"/></patternFill></fill>',
  ].join("");
  const borders = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="medium"><color rgb="FF173D76"/></bottom><diagonal/></border>',
  ].join("");
  const xf = (fontId: number, fillId: number, borderId: number, alignment: string, numFmtId = 0) =>
    `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${numFmtId ? ' applyNumberFormat="1"' : ""}><alignment ${alignment}/></xf>`;
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    xf(1, 2, 0, 'horizontal="left" vertical="center"'),
    xf(2, 3, 0, 'horizontal="left" vertical="center"'),
    xf(3, 4, 0, 'horizontal="left" vertical="center" wrapText="1"'),
    xf(4, 5, 2, 'horizontal="left" vertical="center" wrapText="1"'),
    xf(0, 6, 1, 'horizontal="left" vertical="top"'),
    xf(0, 7, 1, 'horizontal="left" vertical="top"'),
    xf(0, 6, 1, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(0, 7, 1, 'horizontal="left" vertical="top" wrapText="1"'),
    xf(0, 6, 1, 'horizontal="right" vertical="top"', 3),
    xf(0, 7, 1, 'horizontal="right" vertical="top"', 3),
    xf(0, 6, 1, 'horizontal="right" vertical="top"', 164),
    xf(0, 7, 1, 'horizontal="right" vertical="top"', 164),
    xf(0, 6, 1, 'horizontal="center" vertical="top"', 165),
    xf(0, 7, 1, 'horizontal="center" vertical="top"', 165),
    xf(0, 6, 1, 'horizontal="center" vertical="top"', 166),
    xf(0, 7, 1, 'horizontal="center" vertical="top"', 166),
    xf(0, 6, 1, 'horizontal="right" vertical="top"', 167),
    xf(0, 7, 1, 'horizontal="right" vertical="top"', 167),
    xf(6, 8, 1, 'horizontal="center" vertical="center"'),
    xf(7, 9, 1, 'horizontal="center" vertical="center"'),
    xf(8, 10, 1, 'horizontal="center" vertical="center"'),
    xf(9, 11, 1, 'horizontal="center" vertical="center"'),
    xf(5, 6, 0, 'horizontal="center" vertical="center"'),
  ].join("");

  return `${xmlDeclaration()}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;₼&quot;"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/><numFmt numFmtId="166" formatCode="dd mmm yyyy hh:mm"/><numFmt numFmtId="167" formatCode="0.0%"/></numFmts><fonts count="10">${fonts}</fonts><fills count="12">${fills}</fills><borders count="3">${borders}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="24">${cellXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
}
