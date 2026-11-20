import {
  Utensils, BusFront, House, Zap, Wifi, HeartPulse, ShoppingBag, HeartHandshake,
  Clapperboard, GraduationCap, Shapes, BriefcaseBusiness, Store, Laptop, Gift,
} from 'lucide-react';
import { getCategory } from '../lib/budget.js';

const icons = {
  food: Utensils, transport: BusFront, housing: House, bills: Zap, data: Wifi,
  health: HeartPulse, shopping: ShoppingBag, family: HeartHandshake,
  entertainment: Clapperboard, education: GraduationCap, other: Shapes,
  salary: BriefcaseBusiness, business: Store, freelance: Laptop, gift: Gift,
};

export default function CategoryIcon({ type, category }) {
  const data = getCategory(type, category);
  const Icon = icons[data?.icon] || Shapes;
  return <span className="category-icon" style={{ '--category-color': data?.color || '#a5aba4' }} aria-hidden="true"><Icon size={17} strokeWidth={1.7} /></span>;
}
