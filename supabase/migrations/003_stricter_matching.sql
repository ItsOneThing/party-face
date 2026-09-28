-- Conservative starting point for new events; calibrate with labelled event photos.
-- Leave existing events' thresholds unchanged: their settings may already be calibrated.
alter table public.events alter column threshold set default 0.42;
