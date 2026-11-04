-- Terms section 5 contradicted the refund policy.
--
-- It promised "a full refund is available within 7 days of purchase if less
-- than 20% of the course has been consumed", while the refund policy says a
-- paid enrolment is final and the only refund case is Dream Edge cancelling
-- a course. Both pages were live on a site taking payments, so a customer
-- could quote whichever favoured them.
--
-- Resolved in favour of the refund policy, on the owner's instruction. The
-- summary now points at that page and restates it correctly rather than
-- paraphrasing it into a different promise.
--
-- Applied as a migration as well as to the row, so a replay from migrations
-- does not resurrect the contradiction that the seed file still carries.

update public.legal_documents
   set body = replace(
         body,
         'Our full refund policy is on a dedicated page: [Refund & Cancellation Policy](/refund-policy). In short, a full refund is available within 7 days of purchase if less than 20% of the course has been consumed.',
         'Our full refund policy is on a dedicated page: [Refund & Cancellation Policy](/refund-policy). In short, a paid enrolment is final. A refund is issued only where Dream Edge cancels a course, or where a payment was taken but access was never granted.'
       )
 where slug = 'terms';

-- Fails loudly rather than silently doing nothing if the sentence has since
-- been edited by hand in the panel.
do $$
begin
  if exists (
    select 1 from public.legal_documents
     where slug = 'terms' and body like '%full refund is available within 7 days%'
  ) then
    raise exception 'Terms section 5 still contains the 7-day refund promise';
  end if;
end;
$$;
