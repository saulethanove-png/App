import type { Category, TxType } from '../types';

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: 'Еда и продукты', emoji: '🍔', color: '#22D37F', type: 'expense' },
  { id: 'transport', name: 'Транспорт', emoji: '🚕', color: '#3B82F6', type: 'expense' },
  { id: 'shopping', name: 'Покупки', emoji: '🛍', color: '#F59E0B', type: 'expense' },
  { id: 'housing', name: 'Жильё', emoji: '🏠', color: '#8B5CF6', type: 'expense' },
  { id: 'fun', name: 'Развлечения', emoji: '🎮', color: '#EC4899', type: 'expense' },
  { id: 'health', name: 'Здоровье', emoji: '💊', color: '#EF4444', type: 'expense' },
  { id: 'education', name: 'Образование', emoji: '📚', color: '#06B6D4', type: 'expense' },
  { id: 'subscriptions', name: 'Подписки', emoji: '💳', color: '#A3E635', type: 'expense' },
  { id: 'credit', name: 'Кредиты', emoji: '🏦', color: '#F43F5E', type: 'expense' },
  { id: 'other-exp', name: 'Другое', emoji: '📦', color: '#94A3B8', type: 'expense' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Зарплата', emoji: '💼', color: '#22D37F', type: 'income' },
  { id: 'side', name: 'Подработка', emoji: '🛠', color: '#3B82F6', type: 'income' },
  { id: 'business', name: 'Бизнес', emoji: '🏢', color: '#F59E0B', type: 'income' },
  { id: 'invest', name: 'Инвестиции', emoji: '📈', color: '#8B5CF6', type: 'income' },
  { id: 'gifts', name: 'Подарки', emoji: '🎁', color: '#EC4899', type: 'income' },
  { id: 'other-inc', name: 'Другое', emoji: '✨', color: '#94A3B8', type: 'income' },
];

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

const byId = new Map(ALL_CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return byId.get(id) ?? { id, name: 'Другое', emoji: '📦', color: '#94A3B8', type: 'expense' };
}

export function categoriesFor(type: TxType): Category[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
