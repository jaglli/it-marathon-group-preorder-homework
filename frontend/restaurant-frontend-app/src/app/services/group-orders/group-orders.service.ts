import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';
import { SKIP_ERROR_TOAST } from '@app/auth/skip-error-toast.context';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupStatusResponse } from '@app/models/group-orders/group-status.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { SubmittedDish } from '@app/models/group-orders/submit-group-pre-order.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GuestInviteService } from '../reservation/guest-invite.service';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { GuestMenuResponse } from '@app/services/guest-sessions/guest-sessions.service';

export interface SilentRequestOptions {
  silent?: boolean;
}

@Injectable({ providedIn: 'root' })
export class GroupOrdersService {
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly guestInviteService = inject(GuestInviteService);

  getGroupInvite$(reservationId: string): Observable<GuestInvite> {
    return this.guestInviteService
      .getInviteToken$(reservationId)
      .pipe(switchMap(({ token }) => this.guestInviteService.getInvite$(token)));
  }

  getSessions$(groupReservationId: string, options: SilentRequestOptions = {}): Observable<GroupSessionsResponse> {
    return this.http.get<GroupSessionsResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions`,
      { context: this.context(options) },
    ).pipe(map((response) => this.normalizeSessionsResponse(response)));
  }

  getOwnerSessionId$(reservationId: string): Observable<string> {
    return this.http
      .get<{ guestSessionId: string }>(
        `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session-id`,
      )
      .pipe(map(({ guestSessionId }) => guestSessionId));
  }

  getOwnerMenu$(reservationId: string): Observable<DishListResponse[]> {
    return this.http.get<GuestMenuResponse>(
      `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session/menu`,
    ).pipe(
      map((response) => {
        const raw = response as GuestMenuResponse & {
          Dishes?: Record<string, Array<Record<string, unknown>>>;
        };
        const categories = (raw.dishes ?? raw.Dishes ?? {}) as unknown as Record<string, Array<Record<string, unknown>>>;

        return Object.entries(categories).flatMap(([dishType, dishes]) =>
          (dishes ?? []).map((rawDish) => ({
            id: String(rawDish['id'] ?? rawDish['Id'] ?? ''),
            name: String(rawDish['name'] ?? rawDish['Name'] ?? ''),
            imageUrl: String(rawDish['imageUrl'] ?? rawDish['ImageUrl'] ?? 'assets/img/dish.png'),
            price: Number(rawDish['price'] ?? rawDish['Price'] ?? 0),
            state: String(rawDish['state'] ?? rawDish['State'] ?? 'Unavailable'),
            weight: String(rawDish['weight'] ?? rawDish['Weight'] ?? ''),
            dishType,
            description: String(rawDish['description'] ?? rawDish['Description'] ?? ''),
            calories: String(rawDish['calories'] ?? rawDish['Calories'] ?? ''),
            proteins: String(rawDish['proteins'] ?? rawDish['Proteins'] ?? ''),
            carbohydrates: String(rawDish['carbohydrates'] ?? rawDish['Carbohydrates'] ?? ''),
            fats: String(rawDish['fats'] ?? rawDish['Fats'] ?? ''),
            vitamins: String(rawDish['vitamins'] ?? rawDish['Vitamins'] ?? ''),
          })),
        ).filter((dish) => dish.id && dish.state.toLowerCase() === 'available');
      }),
    );
  }

  addOwnerDish$(reservationId: string, dish: DishListResponse, quantity = 1): Observable<unknown> {
    return this.http.post(
      `${this.baseUrl}/reservations/${encodeURIComponent(reservationId)}/guest-session/dishes`,
      { dishId: dish.id, quantity },
      { params: { owner: 'true' } },
    );
  }

  getStatus$(groupReservationId: string, options: SilentRequestOptions = {}): Observable<GroupStatusResponse> {
    return this.http.get<GroupStatusResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/status`,
      { context: this.context(options) },
    );
  }

  submit$(groupReservationId: string, reservationId: string): Observable<SubmittedDish[]> {
    return this.http.post<SubmittedDish[]>(
      `${this.baseUrl}/group-reservations/${encodeURIComponent(groupReservationId)}/submit`,
      { reservationId },
    );
  }

  removeSession$(groupReservationId: string, guestSessionId: string): Observable<GroupSessionsResponse> {
    return this.http.delete<GroupSessionsResponse>(
      `${this.baseUrl}/guest/groups/${encodeURIComponent(groupReservationId)}/sessions/${encodeURIComponent(guestSessionId)}`,
    );
  }

  private context(options: SilentRequestOptions): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, options.silent === true);
  }

  private normalizeSessionsResponse(response: GroupSessionsResponse): GroupSessionsResponse {
    const raw = response as GroupSessionsResponse & {
      Participants?: GroupSessionsResponse['participants'];
      Total?: number;
    };

    return {
      participants: (raw.participants ?? raw.Participants ?? []).map((participant) => {
        const itemSource = participant as Participant & {
          Id?: string;
          Type?: Participant['type'];
          Name?: string;
          Items?: Participant['items'];
          Total?: number;
          IsSubmitted?: boolean;
        };

        return {
          id: itemSource.id ?? itemSource.Id ?? '',
          type: itemSource.type ?? itemSource.Type ?? 'Guest',
          name: itemSource.name ?? itemSource.Name ?? '',
          items: (itemSource.items ?? itemSource.Items ?? []).map((item) => ({
            ...item,
            dish: item.dish ?? (item as typeof item & { Dish?: typeof item.dish }).Dish,
          })),
          total: itemSource.total ?? itemSource.Total ?? 0,
          isSubmitted: itemSource.isSubmitted ?? itemSource.IsSubmitted ?? false,
        };
      }),
      total: raw.total ?? raw.Total ?? 0,
    };
  }
}
