import {
  createLessonReservationAction,
  markLessonAttendanceAction,
} from "@/modules/bookings/actions";
import { getBookingData } from "@/modules/bookings/queries";
import { BookingWorkspace } from "@/modules/bookings/booking-workspace";

export default async function BookingsPage() {
  const data = await getBookingData();

  return (
    <BookingWorkspace
      data={data}
      createLessonReservationAction={createLessonReservationAction}
      markLessonAttendanceAction={markLessonAttendanceAction}
    />
  );
}
