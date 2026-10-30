export type AccentId = 'green' | 'blue' | 'violet' | 'orange' | 'pink' | 'teal' | 'gold';

/** Палитры акцентного цвета (оттенки 50…700). Те же значения — в index.css */
export const ACCENTS: Record<AccentId, { label: string; shades: string[] }> = {
  green: { label: 'Мята', shades: ["#E8FDF2", "#C6F9DE", "#8EF2BE", "#52E79B", "#22D37F", "#12B76A", "#0A9356", "#087245"] },
  blue: { label: 'Океан', shades: ["#EAF3FF", "#CFE3FF", "#9DC6FF", "#63A4FF", "#3B8BFF", "#1F6FE5", "#1657B8", "#11438C"] },
  violet: { label: 'Лаванда', shades: ["#F3EEFF", "#E4D9FF", "#C8B3FF", "#A98BFF", "#8F6BFF", "#7448F0", "#5B34C7", "#45279A"] },
  orange: { label: 'Закат', shades: ["#FFF3E8", "#FFE1C7", "#FFC48F", "#FFA457", "#FF8A2B", "#F06D0E", "#C4550A", "#974108"] },
  pink: { label: 'Сакура', shades: ["#FFEEF5", "#FFD5E6", "#FFA8CA", "#FF78AB", "#FF4F93", "#E83378", "#BD245F", "#8F1B48"] },
  teal: { label: 'Бирюза', shades: ["#E6FBFA", "#C2F4F1", "#86E8E2", "#46D9D0", "#19C3B9", "#0FA39A", "#0B827B", "#09625D"] },
  gold: { label: 'Золото', shades: ["#FFF9E6", "#FFEFBF", "#FFE08A", "#FFCF4D", "#F5B70F", "#D99A06", "#AD7A05", "#7F5A04"] },
};

export const accentHex = (id: AccentId | undefined, shade: 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 = 400) =>
  (ACCENTS[id ?? 'green'] ?? ACCENTS.green).shades[[50, 100, 200, 300, 400, 500, 600, 700].indexOf(shade)];

export const APP_NAME = 'Finalyze';
