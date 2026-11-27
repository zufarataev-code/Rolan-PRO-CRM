-- Call outcome of a lead, set by hand in «Новые лиды»: REACHED / NOT_REACHED / WRONG_PHONE.
-- Lets the owner see how many real contacts each ad source brings.
ALTER TABLE "leads" ADD COLUMN "contact_tag" VARCHAR(20);
