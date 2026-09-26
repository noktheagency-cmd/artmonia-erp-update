# Student billing price changes

The student profile's **Cari paket və ödəniş planı** form records an agreed monthly fee and lesson count for a selected billing month. `FROM_MONTH` applies from that month onward; `ONLY_MONTH` applies to the selected month alone. Weekly slot assignments are managed separately.

Saving a price change reprices existing non-void invoices in its scope, including invoices that were previously fully paid. The invoice amount becomes the resolved monthly fee; its balance is the new amount less payment allocations already attached to that invoice. For example, a 100 AZN payment remains allocated when the monthly fee changes to 230 AZN, leaving 130 AZN due. The invoice update also synchronizes the student billing cycle through the database trigger.

If the enrollment already displays the intended fee but an older invoice still has the previous amount, enter the effective month and a change reason and save the same fee again to reapply its billing terms. A reduction below the amount already allocated to an invoice is rejected; credit or refund must be handled separately before such a reduction. The form does not automatically prorate a mid-month schedule change.
