import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';

@Component({
  selector: 'app-dish-assistant',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './dish-assistant.component.html',
  styleUrl: './dish-assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DishAssistantComponent {
  readonly dishes = input.required<DishListResponse[]>();
  readonly addDish = output<DishListResponse>();

  readonly preferences = signal('');
  readonly maxPrice = signal<number | null>(null);
  readonly category = signal('');
  readonly opened = signal(false);

  readonly recommendations = computed(() => {
    const preference = this.preferences().trim().toLowerCase();
    const category = this.category();
    const maxPrice = this.maxPrice();
    const words = preference.split(/\s+/).filter(Boolean);

    return this.dishes()
      .filter((dish) => !category || dish.dishType === category)
      .filter((dish) => maxPrice === null || dish.price <= maxPrice)
      .map((dish) => {
        const searchable = `${dish.name} ${dish.description} ${dish.dishType} ${dish.vitamins}`.toLowerCase();
        const matches = words.filter((word) => searchable.includes(word)).length;
        return { dish, score: matches };
      })
      .filter((item) => words.length === 0 || item.score > 0)
      .sort((a, b) => b.score - a.score || a.dish.price - b.dish.price)
      .slice(0, 3)
      .map((item) => item.dish);
  });

  updateMaxPrice(value: string): void {
    const parsed = Number(value);
    this.maxPrice.set(value.trim() && Number.isFinite(parsed) ? parsed : null);
  }

  clear(): void {
    this.preferences.set('');
    this.maxPrice.set(null);
    this.category.set('');
  }
}
