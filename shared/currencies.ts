export interface Currency {
  code: string;
  name: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', symbolPosition: 'before' },
  { code: 'EUR', name: 'Euro', symbol: '€', symbolPosition: 'before' },
  { code: 'GBP', name: 'British Pound', symbol: '£', symbolPosition: 'before' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', symbolPosition: 'before' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', symbolPosition: 'before' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', symbolPosition: 'before' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', symbolPosition: 'before' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', symbolPosition: 'before' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', symbolPosition: 'before' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', symbolPosition: 'before' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', symbolPosition: 'after' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', symbolPosition: 'after' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', symbolPosition: 'after' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', symbolPosition: 'before' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', symbolPosition: 'before' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', symbolPosition: 'before' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', symbolPosition: 'before' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', symbolPosition: 'before' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', symbolPosition: 'before' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', symbolPosition: 'before' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', symbolPosition: 'before' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', symbolPosition: 'before' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', symbolPosition: 'before' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', symbolPosition: 'after' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', symbolPosition: 'after' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', symbolPosition: 'after' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', symbolPosition: 'before' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', symbolPosition: 'before' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', symbolPosition: 'before' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', symbolPosition: 'before' },
];

export const DEFAULT_CURRENCY = 'USD';

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map(c => c.code);

export function getCurrency(code: string): Currency | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code.toUpperCase());
}

export function formatPrice(price: number | string, currencyCode: string = DEFAULT_CURRENCY): string {
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  const currency = getCurrency(currencyCode);
  
  if (!currency) {
    return `${currencyCode} ${Math.round(numericPrice).toLocaleString()}`;
  }

  const formattedNumber = Math.round(numericPrice).toLocaleString();

  if (currency.symbolPosition === 'after') {
    return `${formattedNumber} ${currency.symbol}`;
  }
  
  return `${currency.symbol}${formattedNumber}`;
}

export function getStripeCurrencyCode(currencyCode: string): string {
  return currencyCode.toLowerCase();
}

export function isValidCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code.toUpperCase());
}
