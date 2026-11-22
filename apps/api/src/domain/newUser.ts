/** What a brand-new account starts with, until the person changes it. One definition for every way of signing up. */
export interface NewUserDefaults {
  readonly country: string;
  readonly baseCurrency: string;
  readonly annualInflationRate: number;
}

export const NEW_USER_DEFAULTS: NewUserDefaults = {
  country: 'Spain',
  baseCurrency: 'EUR',
  annualInflationRate: 2.8,
};
