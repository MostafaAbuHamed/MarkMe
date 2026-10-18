begin;
select plan(1);
select ok(false, 'deliberate fault');
select * from finish();
rollback;
