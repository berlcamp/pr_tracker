-- The one-time FY2026 General Fund seed (20261020000600_saao_seed_fy2026_gf.sql) must
-- reproduce the October 2026 workbook's grand totals (spec §2.4) under the default rules.
begin;
select plan(19);

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
-- The workbook's 50% total (AF1364) adds unrounded AE/2 per line = half of total savings.
select is((select round(sum(savings) / 2, 2) from seed_lines), 3418090.18::numeric,
  '50% of savings: half of total savings matches the workbook (AF1364)');
-- R-B rounds each line's half away from zero; six lines have odd-centavo savings (rows 636, 637,
-- 752, 885, 1201, 1236), so the sum of line halves is 3 centavos above the workbook's total.
select is((select sum(savings_half) from seed_lines), 3418090.21::numeric,
  '50% of savings: sum of per-line halves (R-B rounding) is 3 centavos above AF1364');
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

select * from finish();
rollback;
