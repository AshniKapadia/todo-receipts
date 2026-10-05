// Store-walk order: the bag lists sections in the order you'd meet them in a store.
export const GROCERY_SECTIONS = [
  'Produce', 'Bakery', 'Meat & fish', 'Dairy & eggs', 'Frozen',
  'Pantry', 'Snacks', 'Drinks', 'Household', 'Personal care', 'Other',
] as const;

// Checked in order, so "frozen berries" lands in Frozen before Produce sees "berries".
const RULES: Array<[string, string[]]> = [
  ['Frozen', ['frozen', 'ice cream', 'gyoza', 'dumpling', 'orange chicken', 'gnocchi', 'popsicle', 'waffles', 'pizza', 'mochi']],
  ['Household', ['paper towel', 'toilet paper', 'tissue', 'dish soap', 'detergent', 'sponge', 'trash bag', 'garbage bag', 'foil', 'plastic wrap', 'ziploc', 'bleach', 'cleaner', 'wipes', 'batteries', 'light bulb', 'candle', 'napkin', 'laundry', 'dryer sheet']],
  ['Personal care', ['toothpaste', 'toothbrush', 'floss', 'shampoo', 'conditioner', 'body wash', 'soap', 'deodorant', 'razor', 'lotion', 'sunscreen', 'tampon', 'pad', 'cotton', 'vitamin', 'advil', 'tylenol', 'medicine', 'face wash', 'moisturizer', 'chapstick', 'mouthwash']],
  ['Dairy & eggs', ['milk', 'egg', 'yogurt', 'cheese', 'butter', 'cream', 'kefir', 'cottage', 'ricotta', 'mozzarella', 'feta', 'parmesan', 'creamer', 'ghee']],
  ['Meat & fish', ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'salmon', 'tuna steak', 'shrimp', 'fish', 'steak', 'ground', 'ham', 'lamb', 'tofu', 'tempeh']],
  ['Bakery', ['bread', 'sourdough', 'bagel', 'tortilla', 'bun', 'roll', 'croissant', 'muffin', 'pita', 'naan', 'baguette', 'english muffin']],
  ['Drinks', ['coffee', 'tea', 'juice', 'soda', 'sparkling', 'water', 'kombucha', 'wine', 'beer', 'seltzer', 'la croix', 'oat milk latte', 'cold brew', 'gatorade']],
  ['Snacks', ['chips', 'crackers', 'popcorn', 'pretzel', 'cookie', 'chocolate', 'candy', 'granola bar', 'protein bar', 'nuts', 'almonds', 'cashews', 'trail mix', 'peanut butter cups', 'gummies', 'puffs', 'seaweed snack']],
  ['Produce', ['apple', 'banana', 'berries', 'berry', 'strawberr', 'blueberr', 'raspberr', 'grape', 'orange', 'lemon', 'lime', 'avocado', 'tomato', 'spinach', 'lettuce', 'kale', 'arugula', 'greens', 'onion', 'garlic', 'ginger', 'potato', 'carrot', 'celery', 'cucumber', 'pepper', 'broccoli', 'cauliflower', 'zucchini', 'mushroom', 'herb', 'cilantro', 'basil', 'parsley', 'mango', 'pineapple', 'melon', 'peach', 'pear', 'cabbage', 'scallion', 'corn', 'asparagus', 'squash', 'salad']],
  ['Pantry', ['rice', 'pasta', 'noodle', 'ramen', 'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'soy', 'beans', 'lentil', 'quinoa', 'oats', 'oatmeal', 'cereal', 'granola', 'honey', 'syrup', 'peanut butter', 'jam', 'spice', 'seasoning', 'broth', 'stock', 'canned', 'tuna', 'chickpea', 'hummus', 'salsa', 'ketchup', 'mustard', 'mayo', 'dressing']],
];

export function classifyGrocery(name: string): string {
  const n = name.toLowerCase();
  for (const [section, words] of RULES) {
    if (words.some(w => n.includes(w))) return section;
  }
  return 'Other';
}
