-- One active experiment per user. The app enforces this too; the index makes
-- it impossible to bypass. Any extra active experiments that exist already are
-- marked abandoned first (newest kept), so the index can be created safely.
with ranked as (
  select id, row_number() over (partition by user_id order by created_at desc) as rn
  from experiments
  where status = 'active'
)
update experiments e
set status = 'abandoned'
from ranked r
where e.id = r.id and r.rn > 1;

create unique index experiments_one_active_per_user
  on experiments (user_id)
  where status = 'active';
