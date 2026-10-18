begin;
select plan(1);
select ok(true, 'pgTAP runs');
select * from finish();
rollback;
