// Known Unsplash photo IDs mapped to food categories.
// Falls back to a generic healthy-food photo and a muted color.

const FOOD_PHOTOS = {
  chicken:       'photo-1598103442097-8b74394b95c3',
  turkey:        'photo-1567620832903-9fc6debc209f',
  beef:          'photo-1546833999-b9f581a1996d',
  steak:         'photo-1546833999-b9f581a1996d',
  pork:          'photo-1432139509613-5c4255815697',
  salmon:        'photo-1467003909585-2f8a72700288',
  tuna:          'photo-1580822184713-fc5400e7fe10',
  shrimp:        'photo-1565557623262-b51c2513a641',
  egg:           'photo-1525351484163-7529414344d8',
  eggs:          'photo-1525351484163-7529414344d8',
  rice:          'photo-1536304993881-ff6e9eefa2a6',
  pasta:         'photo-1621996346565-e3dbc646d9a9',
  bread:         'photo-1509440159596-0249088772ff',
  oats:          'photo-1517093728432-a0440f8d45af',
  oatmeal:       'photo-1517093728432-a0440f8d45af',
  potato:        'photo-1518977676601-b53f82aba655',
  sweetpotato:   'photo-1596097635121-14b38c5d7a27',
  banana:        'photo-1528825871115-3581a5387919',
  apple:         'photo-1568702846914-96b305d2aaeb',
  salad:         'photo-1512621776951-a57141f2eefd',
  broccoli:      'photo-1459411621453-7b03977f4bfc',
  spinach:       'photo-1576045057995-568f588f82fb',
  avocado:       'photo-1523049673857-eb18f1d7b578',
  yogurt:        'photo-1488477181946-6428a0291777',
  cheese:        'photo-1486297678162-eb2a19b0a32d',
  milk:          'photo-1550583724-b2692b85b150',
  nuts:          'photo-1508061253366-f7da158b6d46',
  almonds:       'photo-1508061253366-f7da158b6d46',
  soup:          'photo-1547592166-23ac45744acd',
  pizza:         'photo-1565299624946-b28f40a0ae38',
  burger:        'photo-1568901346375-23c9450c58cd',
  sandwich:      'photo-1528735602780-2552fd46c7af',
  sushi:         'photo-1579871494447-9811cf80d66c',
  tacos:         'photo-1565299585323-38d6b0865b47',
  coffee:        'photo-1495474472287-4d71bcdd2085',
  smoothie:      'photo-1553530666-ba11a90bb0c4',
  protein_shake: 'photo-1579722820308-d74e571900a9',
  default:       'photo-1546069901-ba9599a7e63c',
};

const FOOD_COLORS = {
  chicken:       '#3A2A10',
  turkey:        '#3A2A10',
  beef:          '#2A1010',
  steak:         '#2A1010',
  pork:          '#2A1818',
  salmon:        '#3A1A1A',
  tuna:          '#1A2A3A',
  egg:           '#3A3010',
  rice:          '#2A2A1A',
  pasta:         '#3A2A10',
  bread:         '#3A2A10',
  oats:          '#2A2010',
  potato:        '#2A2A10',
  banana:        '#3A3010',
  apple:         '#2A1A1A',
  salad:         '#0A2A0A',
  broccoli:      '#0A2A0A',
  spinach:       '#0A2A0A',
  avocado:       '#1A2A0A',
  yogurt:        '#2A2A3A',
  cheese:        '#3A3010',
  pizza:         '#3A1A0A',
  burger:        '#2A1A0A',
  default:       '#1A2A1A',
};

/** Returns a full Unsplash image URL for the given food name. */
export function getFoodImageUrl(foodName) {
  const key   = foodName.toLowerCase().replace(/\s+/g, '');
  const photo = FOOD_PHOTOS[key] || FOOD_PHOTOS.default;
  return `https://images.unsplash.com/${photo}?w=800&q=90&fit=crop&auto=format`;
}

/** Returns a dark background fallback color for a food card. */
export function getFoodColor(foodName) {
  const key = foodName.toLowerCase().replace(/\s+/g, '');
  return FOOD_COLORS[key] || FOOD_COLORS.default;
}
