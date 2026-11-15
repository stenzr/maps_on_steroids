export const colors = {
  primary: '#0B5FFF',
  primaryDark: '#0842B5',
  car: '#0B5FFF',
  carFrozen: '#6B7A90',
  trail: '11, 95, 255',
  surface: '#FFFFFF',
  surfaceMuted: '#F2F4F7',
  text: '#101828',
  textMuted: '#475467',
  danger: '#D92D20',
  warning: '#B54708',
  border: '#D0D5DD',
} as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;
export const spacing = (n: number): number => n * 4;
