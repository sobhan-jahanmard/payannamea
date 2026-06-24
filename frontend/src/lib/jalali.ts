const tehranUtcOffsetMinutes = 210;
const jalaliBreaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function div(a: number, b: number) {
  return Math.trunc(a / b);
}

function mod(a: number, b: number) {
  return a - Math.trunc(a / b) * b;
}

function gregorianToDayNumber(year: number, month: number, day: number) {
  let d = div((year + div(month - 8, 6) + 100100) * 1461, 4);
  d += div(153 * mod(month + 9, 12) + 2, 5);
  d += day - 34840408;
  d -= div(div(year + 100100 + div(month - 8, 6), 100) * 3, 4);
  return d + 752;
}

function dayNumberToGregorian(dayNumber: number) {
  let j = 4 * dayNumber + 139361631;
  j += div(div(4 * dayNumber + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const day = div(mod(i, 153), 5) + 1;
  const month = mod(div(i, 153), 12) + 1;
  const year = div(j, 1461) - 100100 + div(8 - month, 6);
  return { year, month, day };
}

function jalaliCalendar(year: number) {
  const breaksLength = jalaliBreaks.length;
  let gy = year + 621;
  let leapJ = -14;
  let jp = jalaliBreaks[0];
  let jm = jp;
  let jump = 0;

  if (year < jp || year >= jalaliBreaks[breaksLength - 1]) {
    throw new Error("Jalali year is out of supported range");
  }

  for (let i = 1; i < breaksLength; i++) {
    jm = jalaliBreaks[i];
    jump = jm - jp;
    if (year < jm) {
      break;
    }
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = year - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ++;
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) {
    leap = 4;
  }

  return { leap, gy, march };
}

function jalaliToDayNumber(year: number, month: number, day: number) {
  const calendar = jalaliCalendar(year);
  return gregorianToDayNumber(calendar.gy, 3, calendar.march) + (month - 1) * 31 - div(month, 7) * (month - 7) + day - 1;
}

function dayNumberToJalali(dayNumber: number) {
  const gregorian = dayNumberToGregorian(dayNumber);
  let year = gregorian.year - 621;
  const calendar = jalaliCalendar(year);
  const firstFarvardin = gregorianToDayNumber(gregorian.year, 3, calendar.march);
  let dayOfYear = dayNumber - firstFarvardin;

  if (dayOfYear >= 0) {
    if (dayOfYear <= 185) {
      return { year, month: 1 + div(dayOfYear, 31), day: mod(dayOfYear, 31) + 1 };
    }
    dayOfYear -= 186;
  } else {
    year--;
    dayOfYear += calendar.leap === 1 ? 180 : 179;
  }

  return { year, month: 7 + div(dayOfYear, 30), day: mod(dayOfYear, 30) + 1 };
}

export function jalaliToGregorian(year: number, month: number, day: number) {
  return dayNumberToGregorian(jalaliToDayNumber(year, month, day));
}

export function gregorianToJalali(year: number, month: number, day: number) {
  return dayNumberToJalali(gregorianToDayNumber(year, month, day));
}

export function jalaliMonthLength(year: number, month: number) {
  if (month <= 6) {
    return 31;
  }
  if (month <= 11) {
    return 30;
  }
  return jalaliCalendar(year).leap === 0 ? 30 : 29;
}

export function jalaliDateToUtcIso(year?: number, month?: number, day?: number): string | undefined {
  if (!year || !month || !day) {
    return undefined;
  }
  const gregorian = jalaliToGregorian(year, month, day);
  const utcMillis = Date.UTC(gregorian.year, gregorian.month - 1, gregorian.day, 0, -tehranUtcOffsetMinutes, 0, 0);
  return new Date(utcMillis).toISOString();
}

export function utcIsoToJalaliDate(value?: string | null) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const tehranMillis = date.getTime() + tehranUtcOffsetMinutes * 60 * 1000;
  const tehranDate = new Date(tehranMillis);
  return gregorianToJalali(
    tehranDate.getUTCFullYear(),
    tehranDate.getUTCMonth() + 1,
    tehranDate.getUTCDate()
  );
}
