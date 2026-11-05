// M-Pesa STK Push only works on Safaricom lines, which start 2547xx or 2541xx.

export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  let n: string;
  if (/^254\d{9}$/.test(digits)) n = digits;
  else if (/^0\d{9}$/.test(digits)) n = "254" + digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) n = "254" + digits;
  else return null;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

export function maskPhone(n: string): string {
  return n.length >= 12 ? `${n.slice(0, 6)}***${n.slice(-3)}` : n;
}
