import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, interval, of } from 'rxjs';
import { catchError, exhaustMap, switchMap, takeWhile } from 'rxjs/operators';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';

@Component({
  selector: 'app-group-order-page',
  standalone: true,
  imports: [ParticipantCardComponent, ModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';
  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal('');
  readonly groupId = signal('');
  readonly status = signal<GroupReservationStatus>('Open');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly submitPending = signal(false);
  readonly confirmSubmit = signal(false);
  readonly submitSuccess = signal(false);
  readonly removeTarget = signal<Participant | null>(null);
  readonly refreshError = signal('');
  readonly updatedAt = signal<Date | null>(null);

  readonly consolidated = computed(() => consolidatePreOrder(this.participants()));
  readonly pendingCount = computed(() => this.participants().filter((person) => !person.isSubmitted).length);
  readonly hasParticipants = computed(() => this.participants().some((person) => person.items.length > 0));
  readonly canSubmit = computed(
    () => this.status() === 'Open' && !this.submitPending() && this.consolidated().items.length > 0,
  );
  readonly isSubmitted = computed(() => this.status() === 'Submitted');

  private syncStarted = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.syncStarted = false;
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service
      .getGroupInvite$(this.reservationId)
      .pipe(
        switchMap((invite) => {
          this.invite.set(invite);
          this.groupId.set(invite.GroupReservationId);
          return forkJoin({
            sessions: this.service.getSessions$(invite.GroupReservationId),
            ownerSessionId: this.service.getOwnerSessionId$(this.reservationId),
            status: this.service.getStatus$(invite.GroupReservationId),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ sessions, ownerSessionId, status }) => {
          this.ownerSessionId.set(ownerSessionId);
          this.participants.set(sessions.participants);
          this.status.set(status.status);
          this.updatedAt.set(new Date());
          this.loading.set(false);
          this.startSync();
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(error instanceof HttpErrorResponse && error.status === 404 ? 'Group reservation not found' : 'Could not load group reservation');
        },
      });
  }

  refresh(): void {
    if (!this.groupId() || this.isSubmitted()) return;
    this.refreshError.set('');
    forkJoin({
      sessions: this.service.getSessions$(this.groupId(), { silent: true }),
      status: this.service.getStatus$(this.groupId(), { silent: true }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sessions, status }) => {
          this.applySnapshot(sessions.participants, status.status);
          this.updatedAt.set(new Date());
        },
        error: () => this.refreshError.set("Couldn't refresh. Showing previous data."),
      });
  }

  submit(): void {
    if (!this.canSubmit() || !this.groupId()) return;
    this.submitPending.set(true);
    this.service
      .submit$(this.groupId(), this.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitPending.set(false);
          this.confirmSubmit.set(false);
          this.status.set('Submitted');
          this.submitSuccess.set(true);
          this.toast.success('Pre-order sent to the restaurant');
        },
        error: () => {
          this.submitPending.set(false);
        },
      });
  }

  askRemove(participant: Participant): void {
    this.removeTarget.set(participant);
  }

  chooseDishes(): void {
    void this.router.navigate(['/menu'], {
      queryParams: {
        preOrder: 'true',
        groupPreOrder: 'true',
        reservationId: this.reservationId,
        ...(this.route.snapshot.queryParamMap.has('demo') ? { demo: true } : {}),
      },
    });
  }

  viewReservations(): void {
    this.submitSuccess.set(false);
    void this.router.navigate(['/reservations']);
  }

  removeGuest(): void {
    const target = this.removeTarget();
    if (!target || !this.groupId()) return;
    this.service
      .removeSession$(this.groupId(), target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (snapshot) => {
          this.participants.set(snapshot.participants);
          this.removeTarget.set(null);
          this.updatedAt.set(new Date());
        },
        error: () => this.removeTarget.set(null),
      });
  }

  private startSync(): void {
    if (this.syncStarted || this.status() !== 'Open') return;
    this.syncStarted = true;
    interval(15_000)
      .pipe(
        takeWhile(() => !this.isSubmitted()),
        exhaustMap(() => this.refresh$()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private refresh$() {
    return forkJoin({
      sessions: this.service.getSessions$(this.groupId(), { silent: true }),
      status: this.service.getStatus$(this.groupId(), { silent: true }),
    }).pipe(
      catchError(() => {
        this.refreshError.set("Couldn't refresh. Showing previous data.");
        return of(null);
      }),
      switchMap((result) => {
        if (result) {
          this.applySnapshot(result.sessions.participants, result.status.status);
          this.updatedAt.set(new Date());
        }
        return of(void 0);
      }),
    );
  }

  private applySnapshot(participants: Participant[], status: GroupReservationStatus): void {
    this.participants.set(participants);
    this.status.set(status);
    if (status === 'Submitted') this.syncStarted = false;
  }
}
