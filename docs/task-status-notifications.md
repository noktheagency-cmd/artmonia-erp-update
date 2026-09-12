# Task status notifications

When a manual workspace task created by İsmet or Vaqif changes status, both active
profiles receive a personal notification in Profile. Recipients are pinned to the
ERP user IDs in `task-status-notifications.ts`; matching names or roles do not
qualify another user. Other task creators do not trigger this notification.

All transitions between OPEN, IN_PROGRESS, DONE and CANCELLED are included.
Saving the same status, including editing only the completion note, does not send
another notification. Changes made by either recipient are included as well.

The notification contains the task title, previous/new status, person who changed
it, and a link to the task. It uses the existing SYSTEM personal notification type
and appears in the profile inbox/unread count. Existing assignment/deadline
notifications are unchanged; these status messages are not marked read just by
opening the task workspace.

The task row is locked for the duration of the status transaction. The status,
audit entry and notifications commit together; realtime refresh is broadcast only
after commit, with the existing polling fallback. Each real transition has a
separate event key, including repeated transitions at a later time.

No historical notifications are backfilled. No database migration is required.
