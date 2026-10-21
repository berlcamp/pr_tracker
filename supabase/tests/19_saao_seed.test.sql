-- The one-time FY2026 General Fund seed (20261020000600_saao_seed_fy2026_gf.sql) must
-- reproduce the October 2026 workbook's grand totals (spec §2.4) under the default rules.
begin;
select plan(26);

select tests.make_user('seed-finalizer@saao.test', 'BAC');
select tests.grant_saao('seed-finalizer@saao.test', 'finalizer');

create temp table seed_book on commit drop as
  select b.id from pr_tracker.saao_books b join pr_tracker.saao_funds f on f.id = b.fund_id
  where b.fiscal_year = 2026 and f.code = 'GF';
grant select on seed_book to authenticated;

select is((select count(*)::int from seed_book), 1, 'the FY2026 General Fund book is seeded');
select is((select title from pr_tracker.saao_books where id = (select id from seed_book)),
  'FY 2026 General Fund', 'book title');

select tests.authenticate_as('seed-finalizer@saao.test');
create temp table seed_lines on commit drop as
  select * from pr_tracker.saao_compute_lines((select id from seed_book), '2026-10-31');
select tests.clear_authentication();

select is((select sum(appropriation) from seed_lines), 1477560233.28::numeric, 'annual appropriation');
select is((select sum(supplemental) from seed_lines), 78854376.62::numeric, 'supplemental');
select is((select sum(realignment) from seed_lines), -39531743.54::numeric, 'realignment / reversion');
select is((select sum(adjusted) from seed_lines), 1516882866.36::numeric, 'total adjusted appropriation');
select is((select sum(obligation) from seed_lines), 610365038.67::numeric, 'obligation');
select is((select sum(balance_allotment) from seed_lines), 906517827.69::numeric, 'balance of allotment');
select is((select sum(savings) from seed_lines), 6836180.36::numeric, 'savings');
-- AWAITING BUDGET OFFICE (R14): the official 50% total is half of summed savings, rounded once
-- (matches the workbook's AF1364); lines keep their own rounded halves (R-B).
select is((select round(sum(savings) / 2, 2) from seed_lines), 3418090.18::numeric, '50% of savings (AF1364)');
select is((select sum((sb ->> '1')::numeric) from seed_lines), 5512422.54::numeric, 'SB-1');
select is((select sum((sb ->> '2')::numeric) from seed_lines), 14732435.00::numeric, 'SB-2');
select is((select sum((sb ->> '3')::numeric) from seed_lines), 58609519.08::numeric, 'SB-3');

-- Section totals match workbook rows 164, 476 and 530.
create temp table seed_section_adjusted on commit drop as
  with recursive t as (
    select n.id, n.label as section from pr_tracker.saao_nodes n
    where n.book_id = (select id from seed_book) and n.parent_id is null and n.kind = 'section'
    union all
    select c.id, t.section from pr_tracker.saao_nodes c join t on c.parent_id = t.id
  )
  select t.section, sum(l.adjusted) as adjusted from t join seed_lines l on l.node_id = t.id group by t.section;

select is((select adjusted from seed_section_adjusted where section = 'CITY MAYOR''S OFFICE'),
  395338865.14::numeric, 'City Mayor''s Office adjusted (row 164)');
select is((select adjusted from seed_section_adjusted where section = 'CITY COUNCIL'),
  97509323.06::numeric, 'City Council adjusted (row 476)');
select is((select adjusted from seed_section_adjusted where section = 'CITY ADMINISTRATOR'),
  39792740.98::numeric, 'City Administrator adjusted (row 530)');

select ok((select count(*) from seed_lines) >= 900, 'at least 900 lines are seeded');
select is((select count(*)::int from pr_tracker.saao_audit
           where book_id = (select id from seed_book) and entity = 'book' and action = 'seed'), 1,
  'the seed writes one audit row');

-- Movements: SB-1..SB-3 plus 25 RealignmentReversion columns (K is cancelled with no amounts).
create temp table seed_mv on commit drop as
  select * from pr_tracker.saao_movements where book_id = (select id from seed_book);
select is((select count(*)::int from seed_mv), 28, '28 movements');
select is((select status || '|' || status_note from seed_mv where reference_no = '003-2026'),
  'pending|WAITING FOR APPROVAL', 'column I (OCM AUGMENTATION 003-2026) is pending, waiting for approval');
select is((select status || '|' || status_note from seed_mv where title like 'FOR SB- 3 CITY COUNCIL RESOLUTION -POC # %'),
  'pending|for resolution', 'column Z is pending, for resolution');
select is((select status from seed_mv where reference_no = '018-2026'), 'cancelled', 'column AD (018-2026) is cancelled');
select is((select count(*)::int from seed_mv where reference_no = '005-2026' or title like 'CDRRMO AUGMENTATION%'), 0,
  'no movement from column K (cancelled, no amounts)');

-- Obligations keep the typed a+b+c expression (SAAO row 15, January).
select is((select o.amount::text || '|' || o.entry from pr_tracker.saao_obligations o
           join pr_tracker.saao_nodes n on n.id = o.node_id
           where n.book_id = (select id from seed_book) and n.label = 'Salaries and Wages-Regular Pay -SB3'
             and o.month = 1),
  '1394351.00|895256+57158+441937', 'row 15 January obligation keeps its entry');

-- CNA/Savings tags in both modes.
select ok((select count(*) from pr_tracker.saao_line_extras e join pr_tracker.saao_nodes n on n.id = e.node_id
           where n.book_id = (select id from seed_book) and e.mode = 'balance') > 0, 'balance-mode extras seeded');
select ok((select count(*) from pr_tracker.saao_line_extras e join pr_tracker.saao_nodes n on n.id = e.node_id
           where n.book_id = (select id from seed_book) and e.mode = 'amount') > 0, 'amount-mode extras seeded');

select * from finish();
rollback;
