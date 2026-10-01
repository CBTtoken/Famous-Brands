-- Demo shop groups (Dewald, 1 October 2026: the pilot shop and the Famous
-- Brands sign-off contact are not known yet, so the POC is shown with
-- clearly labelled demo accounts). A demo group carries a banner on every
-- screen so nobody mistakes it for a real franchisee.
alter table organisations add column is_demo boolean not null default false;
