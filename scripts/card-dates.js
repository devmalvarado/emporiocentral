import assert from "node:assert/strict";

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function withDay(year, monthIndex, day) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function cardDates(chargeDate, statementDay, paymentDueDay) {
  const charge = new Date(`${chargeDate}T00:00:00`);
  const year = charge.getFullYear();
  const month = charge.getMonth();
  const firstStatement = withDay(year, month, statementDay);
  const statement = charge <= firstStatement
    ? firstStatement
    : withDay(year, month + 1, statementDay);
  const dueMonth = paymentDueDay > statementDay ? statement.getMonth() : statement.getMonth() + 1;
  const due = withDay(statement.getFullYear(), dueMonth, paymentDueDay);
  return {
    charge_date: formatDate(charge),
    statement_date: formatDate(statement),
    payment_due_date: formatDate(due),
  };
}

function selfTest() {
  assert.deepEqual(cardDates("2026-09-10", 15, 5), {
    charge_date: "2026-09-10",
    statement_date: "2026-09-15",
    payment_due_date: "2026-10-05",
  });
  assert.deepEqual(cardDates("2026-09-20", 15, 5), {
    charge_date: "2026-09-20",
    statement_date: "2026-10-15",
    payment_due_date: "2026-11-05",
  });
  console.log("ok");
}

if (process.argv.includes("--self-test")) selfTest();
