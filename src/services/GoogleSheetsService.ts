import { google, sheets_v4 } from 'googleapis';

interface PostEntry {
  username: string;
  link: string;
  averageRating: number;
  totalRatings: number;
}

interface SheetData {
  title: string;
  groups: Map<number, PostEntry[][]>; // bucket → list of author entries (each author = array of posts)
}

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(json);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

export async function createResultsSheet(data: SheetData): Promise<string> {
  const auth = getAuth();
  const sheetsClient = google.sheets({ version: 'v4', auth });
  const driveClient = google.drive({ version: 'v3', auth });

  // Create spreadsheet
  const spreadsheet = await sheetsClient.spreadsheets.create({
    requestBody: {
      properties: { title: data.title },
      sheets: [{ properties: { title: 'Results' } }],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;
  const sheetId = spreadsheet.data.sheets![0].properties!.sheetId!;

  // Build rows
  const rows: string[][] = [];
  const formatting: sheets_v4.Schema$Request[] = [];
  let rowIndex = 0;

  // Title row
  rows.push([data.title]);
  formatting.push(
    mergeCells(sheetId, rowIndex, 0, 3),
    boldText(sheetId, rowIndex, 0, 3),
    fontSize(sheetId, rowIndex, 0, 3, 14),
    bgColor(sheetId, rowIndex, 0, 3, { red: 0.1, green: 0.1, blue: 0.1 }),
    fontColor(sheetId, rowIndex, 0, 3, { red: 1, green: 1, blue: 1 }),
  );
  rowIndex++;

  // Empty row
  rows.push(['']);
  rowIndex++;

  const sortedBuckets = Array.from(data.groups.keys()).sort((a, b) => b - a);

  for (const bucket of sortedBuckets) {
    // Section header: "X points"
    rows.push([`${bucket} points`, '', '']);
    formatting.push(
      boldText(sheetId, rowIndex, 0, 3),
      bgColor(sheetId, rowIndex, 0, 3, { red: 0.204, green: 0.659, blue: 0.325 }),
      fontColor(sheetId, rowIndex, 0, 3, { red: 1, green: 1, blue: 1 }),
    );
    rowIndex++;

    // Column headers
    rows.push(['Username', 'Link', 'Avg Rating']);
    formatting.push(
      boldText(sheetId, rowIndex, 0, 3),
      bgColor(sheetId, rowIndex, 0, 3, { red: 0.85, green: 0.85, blue: 0.85 }),
    );
    rowIndex++;

    const authorEntries = data.groups.get(bucket)!;
    for (const authorPosts of authorEntries) {
      // Best post (main row)
      const best = authorPosts[0];
      rows.push([best.username, best.link, `${best.averageRating.toFixed(2)} (${best.totalRatings})`]);
      rowIndex++;

      // Additional posts (indented)
      for (let i = 1; i < authorPosts.length; i++) {
        const other = authorPosts[i];
        rows.push([`  ↳ ${other.username}`, other.link, `${other.averageRating.toFixed(2)} (${other.totalRatings})`]);
        formatting.push(
          fontColor(sheetId, rowIndex, 0, 3, { red: 0.4, green: 0.4, blue: 0.4 }),
        );
        rowIndex++;
      }
    }

    // Empty row between sections
    rows.push(['']);
    rowIndex++;
  }

  // Write data
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: 'Results!A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  // Apply formatting
  if (formatting.length > 0) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: formatting },
    });
  }

  // Set column widths
  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        columnWidth(sheetId, 0, 180),
        columnWidth(sheetId, 1, 420),
        columnWidth(sheetId, 2, 140),
      ],
    },
  });

  // Make sheet publicly readable
  await driveClient.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

// --- Formatting helpers ---

function mergeCells(sheetId: number, row: number, colStart: number, colEnd: number): sheets_v4.Schema$Request {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
      mergeType: 'MERGE_ALL',
    },
  };
}

function boldText(sheetId: number, row: number, colStart: number, colEnd: number): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  };
}

function fontSize(sheetId: number, row: number, colStart: number, colEnd: number, size: number): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
      cell: { userEnteredFormat: { textFormat: { fontSize: size } } },
      fields: 'userEnteredFormat.textFormat.fontSize',
    },
  };
}

function bgColor(sheetId: number, row: number, colStart: number, colEnd: number, color: { red: number; green: number; blue: number }): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
      cell: { userEnteredFormat: { backgroundColor: color } },
      fields: 'userEnteredFormat.backgroundColor',
    },
  };
}

function fontColor(sheetId: number, row: number, colStart: number, colEnd: number, color: { red: number; green: number; blue: number }): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: colStart, endColumnIndex: colEnd },
      cell: { userEnteredFormat: { textFormat: { foregroundColor: color } } },
      fields: 'userEnteredFormat.textFormat.foregroundColor',
    },
  };
}

function columnWidth(sheetId: number, colIndex: number, width: number): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 },
      properties: { pixelSize: width },
      fields: 'pixelSize',
    },
  };
}
