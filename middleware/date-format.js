function normalizeDateFields(req, _res, next) {
  if (!req.body || typeof req.body !== "object") return next();
  for (const [name, value] of Object.entries(req.body)) {
    if (!/(?:_date|^deadline$|^date_of_birth$)/.test(name) || typeof value !== "string") continue;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) continue;
    const [, dayText, monthText, yearText] = match;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      req.body[name] = `${yearText}-${monthText}-${dayText}`;
    }
  }
  next();
}

function formatDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", dateOnly ? { timeZone: "UTC" } : undefined);
}

function toDateInputValue(value) {
  if (value === null || value === undefined || value === "") return "";
  const isoDate = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
    : String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

module.exports = { formatDate, normalizeDateFields, toDateInputValue };
