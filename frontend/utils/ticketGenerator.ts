// Ported from Python backend - Tambola ticket generation algorithm

export interface Ticket {
  id: string;
  ticket_number: number;
  player_id: string;
  player_name: string;
  grid: (number | null)[][];
  numbers: number[];
}

export function generateTambolaTicket(ticketNumber: number): {
  ticket_number: number;
  grid: (number | null)[][];
  numbers: number[];
} {
  const ticket: (number | null)[][] = Array(3)
    .fill(null)
    .map(() => Array(9).fill(null));

  // Define column ranges
  const columnRanges = [
    [1, 9],    // Column 0: 1-9
    [10, 19],  // Column 1: 10-19
    [20, 29],  // Column 2: 20-29
    [30, 39],  // Column 3: 30-39
    [40, 49],  // Column 4: 40-49
    [50, 59],  // Column 5: 50-59
    [60, 69],  // Column 6: 60-69
    [70, 79],  // Column 7: 70-79
    [80, 90],  // Column 8: 80-90
  ];

  // Step 1: Select numbers for each column
  const columnNumbers: number[][] = [];
  for (let colIdx = 0; colIdx < columnRanges.length; colIdx++) {
    const [start, end] = columnRanges[colIdx];
    const available = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    // Shuffle
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    columnNumbers.push(available);
  }

  // Step 2: Generate column distribution (how many numbers per column across 3 rows)
  // Total must be 15 numbers distributed across 9 columns
  const columnCounts: number[] = [];
  let remaining = 15;
  for (let i = 0; i < 9; i++) {
    if (i === 8) {
      // Last column gets remaining
      columnCounts.push(remaining);
    } else {
      // Random between 0-3, but ensure we can still distribute remaining
      const maxForThis = Math.min(3, remaining - (8 - i)); // Keep at least 1 for remaining columns
      const minForThis = Math.max(0, remaining - (8 - i) * 3); // Ensure we use enough
      const count = Math.floor(Math.random() * (maxForThis - minForThis + 1)) + minForThis;
      columnCounts.push(count);
      remaining -= count;
    }
  }

  // Step 3: Distribute numbers into rows ensuring 5 per row
  const rowsDistribution: number[][] = [[], [], []]; // Track which columns have numbers in each row

  for (let colIdx = 0; colIdx < columnCounts.length; colIdx++) {
    const count = columnCounts[colIdx];
    if (count === 0) continue;

    // Decide which rows will have numbers in this column
    const availableRows = [0, 1, 2];
    // Shuffle
    for (let i = availableRows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableRows[i], availableRows[j]] = [availableRows[j], availableRows[i]];
    }
    const selectedRows = availableRows.slice(0, count);

    for (const rowIdx of selectedRows) {
      rowsDistribution[rowIdx].push(colIdx);
    }
  }

  // Step 4: Balance rows to have exactly 5 numbers each
  for (let rowIdx = 0; rowIdx < 3; rowIdx++) {
    let currentCount = rowsDistribution[rowIdx].length;

    if (currentCount < 5) {
      // Add more columns
      const availableCols = Array.from({ length: 9 }, (_, i) => i).filter(
        (c) => !rowsDistribution[rowIdx].includes(c) && columnCounts[c] < 3
      );
      const needed = 5 - currentCount;

      for (let _ = 0; _ < needed; _++) {
        if (availableCols.length > 0) {
          const col = availableCols[Math.floor(Math.random() * availableCols.length)];
          rowsDistribution[rowIdx].push(col);
          columnCounts[col]++;
          const index = availableCols.indexOf(col);
          if (index > -1) {
            availableCols.splice(index, 1);
          }
          // Remove if column is now full
          if (columnCounts[col] >= 3) {
            const fullIndex = availableCols.indexOf(col);
            if (fullIndex > -1) {
              availableCols.splice(fullIndex, 1);
            }
          }
        }
      }
    } else if (currentCount > 5) {
      // Remove extra columns
      const extra = currentCount - 5;
      // Shuffle
      for (let i = rowsDistribution[rowIdx].length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rowsDistribution[rowIdx][i], rowsDistribution[rowIdx][j]] = [
          rowsDistribution[rowIdx][j],
          rowsDistribution[rowIdx][i],
        ];
      }
      const toRemove = rowsDistribution[rowIdx].slice(0, extra);

      for (const col of toRemove) {
        const index = rowsDistribution[rowIdx].indexOf(col);
        if (index > -1) {
          rowsDistribution[rowIdx].splice(index, 1);
        }
        columnCounts[col]--;
      }
    }
  }

  // Step 5: Fill ticket with numbers
  for (let colIdx = 0; colIdx < 9; colIdx++) {
    // Get all rows that should have a number in this column
    const rowsWithNumbers = rowsDistribution
      .map((row, idx) => (row.includes(colIdx) ? idx : -1))
      .filter((idx) => idx !== -1);

    // Sort and assign numbers
    rowsWithNumbers.sort((a, b) => a - b);
    for (let idx = 0; idx < rowsWithNumbers.length; idx++) {
      const rowIdx = rowsWithNumbers[idx];
      ticket[rowIdx][colIdx] = columnNumbers[colIdx][idx];
    }
  }

  // Convert ticket to list format with numbers flattened
  const numbersList: number[] = [];
  for (const row of ticket) {
    for (const num of row) {
      if (num !== null) {
        numbersList.push(num);
      }
    }
  }

  return {
    ticket_number: ticketNumber,
    grid: ticket,
    numbers: numbersList.sort((a, b) => a - b),
  };
}

export function generateTicketsForPlayers(
  players: Array<{ id: string; name: string }>,
  ticketCounts: { [key: string]: number }
): Ticket[] {
  const tickets: Ticket[] = [];
  let ticketCounter = 1;

  for (const player of players) {
    const playerId = player.id;
    const playerName = player.name;
    const count = ticketCounts[playerId] || 1;

    for (let _ = 0; _ < count; _++) {
      const ticketData = generateTambolaTicket(ticketCounter);
      const ticket: Ticket = {
        id: `ticket_${ticketCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ticket_number: ticketCounter,
        player_id: playerId,
        player_name: playerName,
        grid: ticketData.grid,
        numbers: ticketData.numbers,
      };
      tickets.push(ticket);
      ticketCounter++;
    }
  }

  return tickets;
}
